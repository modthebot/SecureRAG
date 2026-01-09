"""Library folder processor for auto-ingesting PDFs on startup."""
import json
import hashlib
import logging
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

from app.config import settings
from app.services.parser import DocumentParser
from app.services.chunker import TextChunker
from app.services.embedder import Embedder
from app.services.vector_store import VectorStore
from app.services.rag import RAGService
from app.api.ingest import documents_store
from app.schemas import DocumentMetadata, DocumentSummary

logger = logging.getLogger(__name__)


class LibraryProcessor:
    """Processes PDFs from the library folder on startup."""
    
    def __init__(self):
        self.library_dir = Path(settings.library_dir)
        self.tracker_file = Path(settings.processed_files_tracker)
        self.library_dir.mkdir(parents=True, exist_ok=True)
        self.tracker_file.parent.mkdir(parents=True, exist_ok=True)
    
    def get_processed_files(self) -> Dict[str, dict]:
        """Load the processed files tracking JSON."""
        if not self.tracker_file.exists():
            return {}
        
        try:
            with open(self.tracker_file, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Error reading processed files tracker: {e}")
            return {}
    
    def track_processed_file(self, file_path: Path, doc_id: str, file_hash: str):
        """Mark a file as processed in the tracking JSON."""
        processed = self.get_processed_files()
        
        # Use absolute path as key for consistency
        abs_path = str(file_path.absolute())
        processed[abs_path] = {
            'file_path': str(file_path),
            'file_hash': file_hash,
            'processed_at': datetime.now().isoformat(),
            'doc_id': doc_id
        }
        
        try:
            with open(self.tracker_file, 'w') as f:
                json.dump(processed, f, indent=2)
            logger.info(f"Tracked processed file: {file_path}")
        except IOError as e:
            logger.error(f"Error writing processed files tracker: {e}")
    
    def calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of a file."""
        sha256 = hashlib.sha256()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256.update(chunk)
            return sha256.hexdigest()
        except IOError as e:
            logger.error(f"Error calculating file hash for {file_path}: {e}")
            return ""
    
    def is_file_processed(self, file_path: Path) -> bool:
        """Check if a file has already been processed."""
        processed = self.get_processed_files()
        abs_path = str(file_path.absolute())
        
        if abs_path not in processed:
            return False
        
        # Check if file hash matches (file hasn't changed)
        stored_hash = processed[abs_path].get('file_hash', '')
        current_hash = self.calculate_file_hash(file_path)
        
        if stored_hash and current_hash == stored_hash:
            return True
        
        # File exists but hash changed, so reprocess
        logger.info(f"File {file_path} hash changed, will reprocess")
        return False
    
    def process_pdf_file(self, file_path: Path) -> Optional[str]:
        """Process a single PDF file through the ingestion pipeline."""
        import uuid
        
        try:
            # Check if already processed
            if self.is_file_processed(file_path):
                logger.info(f"Skipping already processed file: {file_path}")
                return None
            
            logger.info(f"Processing library file: {file_path}")
            
            # Generate document ID
            doc_id = str(uuid.uuid4())
            
            # Create document directory in raw_docs_dir
            doc_dir = Path(settings.raw_docs_dir) / doc_id
            doc_dir.mkdir(parents=True, exist_ok=True)
            
            # Copy file to raw_docs_dir
            file_ext = file_path.suffix
            original_path = doc_dir / f"original{file_ext}"
            
            import shutil
            shutil.copy2(file_path, original_path)
            
            # Parse document
            parser = DocumentParser()
            text, page_count, image_paths = parser.parse(str(original_path), doc_id)
            text = parser.clean_text(text)
            
            if not text or len(text.strip()) < 50:
                logger.warning(f"Document {file_path} contains too little text, skipping")
                return None
            
            # Chunk text
            chunker = TextChunker()
            metadata = {
                'owner': None,
                'project': None,
                'tags': [],
                'filename': file_path.name
            }
            
            # For multi-page documents, chunk per page
            chunks = []
            if page_count > 1:
                pages = text.split("--- Page")
                for page_num, page_text in enumerate(pages[1:], 1):
                    page_chunks = chunker.chunk_text(page_text, doc_id, page_num, metadata)
                    chunks.extend(page_chunks)
            else:
                chunks = chunker.chunk_text(text, doc_id, 1, metadata)
            
            # Add filename to chunks
            for chunk in chunks:
                chunk['filename'] = file_path.name
            
            if not chunks:
                logger.warning(f"Document {file_path} produced no chunks, skipping")
                return None
            
            # Generate embeddings
            embedder = Embedder()
            chunk_texts = [chunk['text'] for chunk in chunks]
            embeddings = embedder.get_embeddings_batch(chunk_texts)
            
            # Store in vector DB
            vector_store = VectorStore()
            vector_store.add_chunks(chunks, embeddings)
            
            # Generate summary using RAG
            rag_service = RAGService()
            summary_query = "Provide a 3-sentence summary of this document, list key technologies mentioned, identify focus areas for penetration testing, and suggest use cases."
            
            # Use first few chunks for summary
            summary_chunks = chunks[:min(5, len(chunks))]
            summary_context = "\n\n".join([c['text'] for c in summary_chunks])
            
            try:
                summary_text = rag_service.model_adapter.generate_text(
                    prompt=f"Document content:\n{summary_context}\n\n{summary_query}",
                    system="You are a security analyst. Provide concise summaries.",
                    max_tokens=500,
                    temperature=0.5
                )
            except Exception as e:
                logger.warning(f"Failed to generate summary: {e}")
                summary_text = "Summary generation failed."
            
            # Extract technologies
            technologies = rag_service.extract_technologies(text)
            
            # Create document summary
            summary = DocumentSummary(
                summary=summary_text,
                technologies=technologies,
                focus_areas=["Authentication", "Network Security", "Data Protection"],
                use_cases=["Penetration Testing", "Security Audit"]
            )
            
            # Store document metadata
            documents_store[doc_id] = {
                'doc_id': doc_id,
                'filename': file_path.name,
                'file_type': file_ext,
                'pages': page_count,
                'chunks': len(chunks),
                'summary': summary,
                'metadata': DocumentMetadata(owner=None, project=None, tags=[]),
                'file_path': str(original_path)
            }
            
            # Track as processed
            file_hash = self.calculate_file_hash(file_path)
            self.track_processed_file(file_path, doc_id, file_hash)
            
            # Persist documents_store after processing
            try:
                from app.api.ingest import persist_documents_store
                persist_documents_store()
            except Exception as e:
                logger.warning(f"Failed to persist documents_store after processing: {e}")
            
            logger.info(f"Successfully processed library file: {file_path} (doc_id: {doc_id}, chunks: {len(chunks)})")
            return doc_id
            
        except Exception as e:
            logger.error(f"Error processing library file {file_path}: {e}", exc_info=True)
            return None
    
    def reconstruct_documents_store_from_tracker(self) -> Dict[str, int]:
        """
        Reconstruct documents_store entries for already-processed files.
        This ensures documents appear in the UI even if they were processed in a previous session.
        
        Returns:
            Dictionary with stats: {'loaded': count, 'errors': count}
        """
        stats = {'loaded': 0, 'errors': 0}
        processed_files = self.get_processed_files()
        
        if not processed_files:
            logger.info("No processed files in tracker to reconstruct")
            return stats
        
        vector_store = VectorStore()
        doc_info_from_vector = vector_store.get_all_document_ids()
        
        for file_path_str, file_info in processed_files.items():
            try:
                doc_id = file_info.get('doc_id')
                if not doc_id:
                    continue
                
                # Skip if already in documents_store
                if doc_id in documents_store:
                    continue
                
                # Skip if document doesn't exist in vector store (was deleted)
                if doc_id not in doc_info_from_vector:
                    logger.debug(f"Skipping doc_id {doc_id} - not found in vector store (likely deleted)")
                    continue
                
                # Get info from vector store if available
                vector_info = doc_info_from_vector.get(doc_id, {})
                filename = vector_info.get('filename', Path(file_info.get('file_path', '')).name)
                chunk_count = vector_info.get('chunk_count', 0)
                max_page = vector_info.get('max_page', 0)
                
                # Try to get file extension from path
                file_path = Path(file_info.get('file_path', ''))
                file_ext = file_path.suffix if file_path.suffix else '.pdf'
                
                # Check if original file exists in raw_docs_dir
                original_path = Path(settings.raw_docs_dir) / doc_id / f"original{file_ext}"
                if not original_path.exists():
                    # Try to find any file in the doc directory
                    doc_dir = Path(settings.raw_docs_dir) / doc_id
                    if doc_dir.exists():
                        files = list(doc_dir.glob("original.*"))
                        if files:
                            original_path = files[0]
                
                # Create document entry
                documents_store[doc_id] = {
                    'doc_id': doc_id,
                    'filename': filename,
                    'file_type': file_ext,
                    'pages': max_page if max_page > 0 else 1,
                    'chunks': chunk_count,
                    'summary': None,  # Summary would need to be regenerated
                    'metadata': DocumentMetadata(owner=None, project=None, tags=[]),
                    'file_path': str(original_path) if original_path.exists() else None
                }
                
                stats['loaded'] += 1
                
            except Exception as e:
                logger.error(f"Error reconstructing document from tracker: {e}", exc_info=True)
                stats['errors'] += 1
        
        logger.info(f"Reconstructed {stats['loaded']} documents from tracker")
        
        # Persist documents_store after reconstruction
        if stats['loaded'] > 0:
            try:
                from app.api.ingest import persist_documents_store
                persist_documents_store()
            except Exception as e:
                logger.warning(f"Failed to persist documents_store after reconstruction: {e}")
        
        return stats
    
    def scan_and_process(self) -> Dict[str, int]:
        """Scan library folder for PDFs and process unprocessed ones."""
        if not self.library_dir.exists():
            logger.warning(f"Library directory does not exist: {self.library_dir}")
            return {'processed': 0, 'skipped': 0, 'errors': 0}
        
        stats = {'processed': 0, 'skipped': 0, 'errors': 0}
        
        # Find all PDF files in library directory
        pdf_files = list(self.library_dir.glob("*.pdf"))
        
        if not pdf_files:
            logger.info(f"No PDF files found in library directory: {self.library_dir}")
            return stats
        
        logger.info(f"Found {len(pdf_files)} PDF file(s) in library directory")
        
        for pdf_file in pdf_files:
            try:
                doc_id = self.process_pdf_file(pdf_file)
                if doc_id:
                    stats['processed'] += 1
                else:
                    stats['skipped'] += 1
            except Exception as e:
                logger.error(f"Error processing {pdf_file}: {e}", exc_info=True)
                stats['errors'] += 1
        
        logger.info(f"Library processing complete: {stats}")
        return stats

