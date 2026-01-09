"""Document ingestion endpoint."""
import os
import uuid
import logging
import re
import shutil
import json
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
import requests
from weasyprint import HTML
from bs4 import BeautifulSoup

from app.schemas import IngestionResponse, DocumentMetadata, DocumentSummary
from app.services.parser import DocumentParser
from app.services.chunker import TextChunker
from app.services.embedder import Embedder
from app.services.vector_store import VectorStore
from app.services.rag import RAGService
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory document store (in production, use a database)
documents_store = {}


def persist_documents_store():
    """Persist documents_store to JSON file."""
    json_path = Path(settings.data_dir) / "documents_store.json"
    json_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        # Convert Pydantic models to dicts for JSON serialization
        serializable_store = {}
        for doc_id, doc_data in documents_store.items():
            summary = doc_data.get('summary')
            metadata = doc_data.get('metadata')
            
            # Handle Pydantic v1 (dict()) and v2 (model_dump()) compatibility
            if summary and hasattr(summary, 'model_dump'):
                summary_dict = summary.model_dump()
            elif summary and hasattr(summary, 'dict'):
                summary_dict = summary.dict()
            else:
                summary_dict = summary
            
            if metadata and hasattr(metadata, 'model_dump'):
                metadata_dict = metadata.model_dump()
            elif metadata and hasattr(metadata, 'dict'):
                metadata_dict = metadata.dict()
            else:
                metadata_dict = metadata
            
            serializable_store[doc_id] = {
                'doc_id': doc_data.get('doc_id'),
                'filename': doc_data.get('filename'),
                'file_type': doc_data.get('file_type'),
                'pages': doc_data.get('pages'),
                'chunks': doc_data.get('chunks'),
                'file_path': doc_data.get('file_path'),
                'summary': summary_dict,
                'metadata': metadata_dict
            }
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(serializable_store, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Persisted {len(serializable_store)} documents to {json_path}")
    except Exception as e:
        logger.error(f"Error persisting documents_store: {e}", exc_info=True)


@router.post("/ingest", response_model=IngestionResponse)
async def ingest_document(
    file: UploadFile = File(...),
    document_name: Optional[str] = Form(None),
    owner: Optional[str] = Form(None),
    project: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    generate_summary: bool = Form(True),
):
    """Ingest a document (PDF, DOCX, or image)."""
    try:
        # Normalize boolean flag from form-data
        if isinstance(generate_summary, str):
            generate_summary_flag = generate_summary.lower() in ("true", "1", "yes", "on")
        else:
            generate_summary_flag = bool(generate_summary)

        # Use provided document_name or fallback to filename (without extension)
        final_document_name = document_name.strip() if document_name and document_name.strip() else get_filename_without_extension(file.filename)
        
        # Generate document ID
        doc_id = str(uuid.uuid4())
        
        # Create document directory
        doc_dir = Path(settings.raw_docs_dir) / doc_id
        doc_dir.mkdir(parents=True, exist_ok=True)
        
        # Save original file
        file_ext = Path(file.filename).suffix
        original_path = doc_dir / f"original{file_ext}"
        
        with open(original_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Parse document
        parser = DocumentParser()
        text, page_count, image_paths = parser.parse(str(original_path), doc_id)
        text = parser.clean_text(text)
        
        if not text or len(text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Document contains too little text")
        
        # Chunk text
        chunker = TextChunker()
        metadata = {
            'owner': owner,
            'project': project,
            'tags': tags.split(',') if tags else [],
            'filename': final_document_name
        }
        
        # For multi-page documents, chunk per page
        chunks = []
        if page_count > 1:
            # Simple page splitting (in production, use page markers from parser)
            pages = text.split("--- Page")
            for page_num, page_text in enumerate(pages[1:], 1):
                page_chunks = chunker.chunk_text(page_text, doc_id, page_num, metadata)
                chunks.extend(page_chunks)
        else:
            chunks = chunker.chunk_text(text, doc_id, 1, metadata)
        
        # Add filename to chunks
        for chunk in chunks:
            chunk['filename'] = final_document_name
        
        if not chunks:
            raise HTTPException(
                status_code=400,
                detail="Document content was too small to create searchable chunks. Please provide a document with more detailed text."
            )
        
        # Generate embeddings
        embedder = Embedder()
        chunk_texts = [chunk['text'] for chunk in chunks]
        embeddings = embedder.get_embeddings_batch(chunk_texts)
        
        # Store in vector DB
        vector_store = VectorStore()
        vector_store.add_chunks(chunks, embeddings)
        
        # Optionally generate summary using RAG
        summary: Optional[DocumentSummary] = None
        if generate_summary_flag:
            rag_service = RAGService()
            
            # Enhanced prompt for pentester-focused summaries with test cases
            summary_query = (
                "Analyze this document and provide:\n"
                "1. A 3-4 sentence summary of the application/system architecture\n"
                "2. Key technologies and their versions (if mentioned)\n"
                "3. Critical focus areas for penetration testing with specific components/endpoints\n"
                "4. Actionable test cases that guide pentesters on where to focus (component:focus_area:testing_steps)\n\n"
                "IMPORTANT:\n"
                "- Only include information explicitly mentioned in the document\n"
                "- If information is missing, state 'Not specified' rather than making assumptions\n"
                "- Test cases must reference specific components, services, or endpoints from the document\n"
                "- Each test case should include: (1) target component, (2) focus area, (3) specific testing steps\n"
                "- Avoid generic or placeholder test cases"
            )
            
            # Use first few chunks for summary (retrieve more relevant chunks instead of just first N)
            try:
                retrieved_summary_chunks = rag_service.retrieve(
                    query="application architecture components services endpoints authentication",
                    top_k=min(8, len(chunks)),
                    doc_ids=[doc_id]
                )
                # Fallback to first chunks if retrieval fails
                if not retrieved_summary_chunks:
                    retrieved_summary_chunks = chunks[:min(5, len(chunks))]
                summary_chunks = retrieved_summary_chunks
            except Exception as e:
                logger.warning(f"Failed to retrieve summary chunks: {e}, using first chunks")
                summary_chunks = chunks[:min(5, len(chunks))]
            
            summary_context = "\n\n".join([
                f"[Source: {c.get('filename', 'unknown')}, Page {c.get('page', 0)}]\n{c.get('text', '')}"
                for c in summary_chunks
            ])
            
            # Enhanced system prompt for accurate, citation-based summaries
            summary_system_prompt = (
                "You are a security analyst specializing in penetration testing preparation. "
                "Generate summaries that are:\n"
                "1. ACCURATE: Only use information from the provided context\n"
                "2. ACTIONABLE: Test cases must reference specific components mentioned in the document\n"
                "3. FOCUSED: Guide pentesters to the most critical areas (authentication, APIs, network services, etc.)\n"
                "4. CITATION-AWARE: Reference specific pages/sections when mentioning components\n\n"
                "If information is missing, explicitly state 'Not specified' or 'Additional information required'. "
                "DO NOT make assumptions or add generic information not in the source document."
            )
            
            try:
                summary_text = rag_service.model_adapter.generate_text(
                    prompt=f"Document content:\n{summary_context}\n\n{summary_query}",
                    system=summary_system_prompt,
                    max_tokens=1000,  # Increased for more detailed summaries
                    temperature=0.3  # Lower temperature for more accurate, less creative output
                )
                
                # Basic hallucination detection: check if summary references components not in context
                summary_text_lower = summary_text.lower()
                context_lower = summary_context.lower()
                
                # Extract potential component names from summary (simple heuristic)
                # This is a basic check - full hallucination detection would require more sophisticated NLP
                if "not specified" not in summary_text_lower and "additional information" not in summary_text_lower:
                    # Check if summary mentions common technologies that might not be in context
                    generic_patterns = ["example.com", "example system", "sample application"]
                    if any(pattern in summary_text_lower for pattern in generic_patterns):
                        logger.warning("Summary may contain generic/placeholder content")
                
            except Exception as e:
                logger.warning(f"Failed to generate summary: {e}")
                summary_text = "Summary generation failed."
            
            # Extract technologies
            technologies = rag_service.extract_technologies(text)
            
            # Extract focus areas from summary text (simple parsing)
            focus_areas = []
            focus_keywords = ["authentication", "authorization", "network", "api", "database", "encryption", 
                            "session management", "input validation", "access control", "data protection"]
            summary_lower = summary_text.lower()
            for keyword in focus_keywords:
                if keyword in summary_lower:
                    focus_areas.append(keyword.title())
            
            # Default focus areas if none found
            if not focus_areas:
                focus_areas = ["Authentication", "Network Security", "Data Protection"]
            
            # Create document summary
            summary = DocumentSummary(
                summary=summary_text,
                technologies=technologies,
                focus_areas=focus_areas[:5],  # Limit to top 5
                use_cases=["Penetration Testing", "Security Audit"]
            )
        
        # Store document metadata
        documents_store[doc_id] = {
            'doc_id': doc_id,
            'filename': final_document_name,
            'file_type': file_ext,
            'pages': page_count,
            'chunks': len(chunks),
            'summary': summary if generate_summary_flag else None,
            'metadata': DocumentMetadata(owner=owner, project=project, tags=tags.split(',') if tags else []),
            'file_path': str(original_path)
        }
        
        # Save to library folder
        try:
            save_to_library(original_path, final_document_name)
        except Exception as e:
            logger.warning(f"Failed to save file to library folder: {e}")
            # Don't fail the ingestion if library save fails
        
        # Persist documents_store to JSON
        try:
            persist_documents_store()
        except Exception as e:
            logger.warning(f"Failed to persist documents_store: {e}")
            # Don't fail the ingestion if persistence fails
        
        return IngestionResponse(
            doc_id=doc_id,
            filename=final_document_name,
            status="success",
            pages=page_count,
            chunks=len(chunks),
            summary=summary if generate_summary_flag else None,
            message=f"Document ingested successfully. Created {len(chunks)} chunks."
        )
        
    except HTTPException as exc:
        logger.error(f"Ingestion failed: {exc.detail}", exc_info=True)
        raise
    except Exception as e:
        logger.error(f"Unexpected error ingesting document: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error ingesting document: {str(e)}")


def sanitize_filename(filename: str) -> str:
    """Sanitize filename by removing invalid characters."""
    # Remove invalid characters for filenames
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
    # Remove leading/trailing spaces and dots
    filename = filename.strip('. ')
    # Ensure it's not empty
    if not filename:
        filename = "document"
    return filename


def extract_html_title(html_content: str, max_length: int = 100) -> Optional[str]:
    """Extract title from HTML content."""
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        title_tag = soup.find('title')
        
        if title_tag and title_tag.string:
            title = title_tag.string.strip()
            # Clean up title
            title = re.sub(r'\s+', ' ', title)  # Replace multiple spaces with single space
            # Limit length
            if len(title) > max_length:
                title = title[:max_length].rsplit(' ', 1)[0]  # Cut at word boundary
            return title if title else None
        return None
    except Exception as e:
        logger.warning(f"Error extracting HTML title: {e}")
        return None


def get_filename_without_extension(filename: str) -> str:
    """Get filename without extension."""
    path = Path(filename)
    return path.stem if path.stem else "document"


def save_to_library(file_path: Path, filename: str) -> Path:
    """Save a file to the library folder with conflict handling."""
    library_dir = Path(settings.library_dir)
    library_dir.mkdir(parents=True, exist_ok=True)
    
    # Sanitize filename
    safe_filename = sanitize_filename(filename)
    
    # Ensure .pdf extension
    if not safe_filename.lower().endswith('.pdf'):
        safe_filename += '.pdf'
    
    library_path = library_dir / safe_filename
    
    # Handle filename conflicts
    counter = 1
    while library_path.exists():
        name_part = safe_filename.rsplit('.pdf', 1)[0]
        library_path = library_dir / f"{name_part}_{counter}.pdf"
        counter += 1
    
    # Copy file to library
    shutil.copy2(file_path, library_path)
    logger.info(f"Saved file to library: {library_path}")
    return library_path


@router.post("/ingest/url", response_model=IngestionResponse)
async def ingest_from_url(
    url: str = Form(...),
    document_name: Optional[str] = Form(None),
    owner: Optional[str] = Form(None),
    project: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    generate_summary: bool = Form(True),
):
    """Ingest a document from a URL by fetching HTML and converting to PDF."""
    try:
        # Normalize boolean flag from form-data
        if isinstance(generate_summary, str):
            generate_summary_flag = generate_summary.lower() in ("true", "1", "yes", "on")
        else:
            generate_summary_flag = bool(generate_summary)

        # Validate URL
        if not url.startswith(('http://', 'https://')):
            raise HTTPException(status_code=400, detail="Invalid URL. Must start with http:// or https://")
        
        logger.info(f"Fetching HTML from URL: {url}")
        
        # Fetch HTML content
        try:
            # Use more complete browser headers to avoid bot detection
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            }
            response = requests.get(url, timeout=30, headers=headers, allow_redirects=True)
            response.raise_for_status()
            html_content = response.text
        except requests.HTTPError as e:
            # Check if it's a 403 error (common for sites like Medium with bot protection)
            if hasattr(e.response, 'status_code') and e.response.status_code == 403:
                logger.error(f"403 Forbidden error fetching URL: {url}")
                error_msg = (
                    f"Failed to fetch URL: The website returned 403 Forbidden. "
                    f"This often happens with sites like Medium.com that use bot protection. "
                    f"Try using a publicly accessible URL or use an archive service like archive.today or web.archive.org"
                )
                raise HTTPException(status_code=400, detail=error_msg)
            logger.error(f"HTTP error fetching URL: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {str(e)}")
        except requests.RequestException as e:
            logger.error(f"Error fetching URL: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {str(e)}")
        
        if not html_content or len(html_content.strip()) < 50:
            raise HTTPException(status_code=400, detail="URL returned empty or insufficient content")
        
        # Extract document name: use provided name, or extract from HTML title, or use URL-based name
        if document_name and document_name.strip():
            final_document_name = document_name.strip()
        else:
            # Try to extract title from HTML
            extracted_title = extract_html_title(html_content)
            if extracted_title:
                final_document_name = extracted_title
                logger.info(f"Extracted title from HTML: {final_document_name}")
            else:
                # Fallback to URL-based name
                try:
                    from urllib.parse import urlparse
                    parsed_url = urlparse(url)
                    final_document_name = parsed_url.path.strip('/').split('/')[-1] or parsed_url.netloc
                    # Clean up the name
                    final_document_name = re.sub(r'[^a-zA-Z0-9_-]', '_', final_document_name)
                    if not final_document_name or len(final_document_name) < 3:
                        final_document_name = "web_document"
                    logger.info(f"Using URL-based name: {final_document_name}")
                except Exception as e:
                    logger.warning(f"Error generating URL-based name: {e}")
                    final_document_name = "web_document"
        
        # Convert HTML to PDF
        logger.info(f"Converting HTML to PDF for: {final_document_name}")
        try:
            pdf_bytes = HTML(string=html_content).write_pdf()
        except Exception as e:
            logger.error(f"Error converting HTML to PDF: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to convert HTML to PDF: {str(e)}")
        
        # Generate document ID
        doc_id = str(uuid.uuid4())
        
        # Create document directory
        doc_dir = Path(settings.raw_docs_dir) / doc_id
        doc_dir.mkdir(parents=True, exist_ok=True)
        
        # Save PDF
        pdf_path = doc_dir / "original.pdf"
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
        
        # Save to library folder
        library_path = save_to_library(pdf_path, final_document_name)
        
        # Parse document
        parser = DocumentParser()
        text, page_count, image_paths = parser.parse(str(pdf_path), doc_id)
        text = parser.clean_text(text)
        
        if not text or len(text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Document contains too little text")
        
        # Chunk text
        chunker = TextChunker()
        metadata = {
            'owner': owner,
            'project': project,
            'tags': tags.split(',') if tags else [],
            'filename': final_document_name
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
            chunk['filename'] = final_document_name
        
        if not chunks:
            raise HTTPException(
                status_code=400,
                detail="Document content was too small to create searchable chunks. Please provide a document with more detailed text."
            )
        
        # Generate embeddings
        embedder = Embedder()
        chunk_texts = [chunk['text'] for chunk in chunks]
        embeddings = embedder.get_embeddings_batch(chunk_texts)
        
        # Store in vector DB
        vector_store = VectorStore()
        vector_store.add_chunks(chunks, embeddings)
        
        # Optionally generate summary using RAG
        summary: Optional[DocumentSummary] = None
        if generate_summary_flag:
            rag_service = RAGService()
            
            # Enhanced prompt for pentester-focused summaries with test cases
            summary_query = (
                "Analyze this document and provide:\n"
                "1. A 3-4 sentence summary of the application/system architecture\n"
                "2. Key technologies and their versions (if mentioned)\n"
                "3. Critical focus areas for penetration testing with specific components/endpoints\n"
                "4. Actionable test cases that guide pentesters on where to focus (component:focus_area:testing_steps)\n\n"
                "IMPORTANT:\n"
                "- Only include information explicitly mentioned in the document\n"
                "- If information is missing, state 'Not specified' rather than making assumptions\n"
                "- Test cases must reference specific components, services, or endpoints from the document\n"
                "- Each test case should include: (1) target component, (2) focus area, (3) specific testing steps\n"
                "- Avoid generic or placeholder test cases"
            )
            
            # Retrieve relevant chunks for summary
            try:
                retrieved_summary_chunks = rag_service.retrieve(
                    query="application architecture components services endpoints authentication",
                    top_k=min(8, len(chunks)),
                    doc_ids=[doc_id]
                )
                if not retrieved_summary_chunks:
                    retrieved_summary_chunks = chunks[:min(5, len(chunks))]
                summary_chunks = retrieved_summary_chunks
            except Exception as e:
                logger.warning(f"Failed to retrieve summary chunks: {e}, using first chunks")
                summary_chunks = chunks[:min(5, len(chunks))]
            
            summary_context = "\n\n".join([
                f"[Source: {c.get('filename', 'unknown')}, Page {c.get('page', 0)}]\n{c.get('text', '')}"
                for c in summary_chunks
            ])
            
            # Enhanced system prompt
            summary_system_prompt = (
                "You are a security analyst specializing in penetration testing preparation. "
                "Generate summaries that are:\n"
                "1. ACCURATE: Only use information from the provided context\n"
                "2. ACTIONABLE: Test cases must reference specific components mentioned in the document\n"
                "3. FOCUSED: Guide pentesters to the most critical areas (authentication, APIs, network services, etc.)\n"
                "4. CITATION-AWARE: Reference specific pages/sections when mentioning components\n\n"
                "If information is missing, explicitly state 'Not specified' or 'Additional information required'. "
                "DO NOT make assumptions or add generic information not in the source document."
            )
            
            try:
                summary_text = rag_service.model_adapter.generate_text(
                    prompt=f"Document content:\n{summary_context}\n\n{summary_query}",
                    system=summary_system_prompt,
                    max_tokens=1000,
                    temperature=0.3
                )
            except Exception as e:
                logger.warning(f"Failed to generate summary: {e}")
                summary_text = "Summary generation failed."
            
            # Extract technologies
            technologies = rag_service.extract_technologies(text)
            
            # Extract focus areas from summary text
            focus_areas = []
            focus_keywords = ["authentication", "authorization", "network", "api", "database", "encryption", 
                            "session management", "input validation", "access control", "data protection"]
            summary_lower = summary_text.lower()
            for keyword in focus_keywords:
                if keyword in summary_lower:
                    focus_areas.append(keyword.title())
            
            if not focus_areas:
                focus_areas = ["Authentication", "Network Security", "Data Protection"]
            
            # Create document summary
            summary = DocumentSummary(
                summary=summary_text,
                technologies=technologies,
                focus_areas=focus_areas[:5],
                use_cases=["Penetration Testing", "Security Audit"]
            )
        
        # Store document metadata
        documents_store[doc_id] = {
            'doc_id': doc_id,
            'filename': final_document_name,
            'file_type': '.pdf',
            'pages': page_count,
            'chunks': len(chunks),
            'summary': summary if generate_summary_flag else None,
            'metadata': DocumentMetadata(owner=owner, project=project, tags=tags.split(',') if tags else []),
            'file_path': str(pdf_path)
        }
        
        # Persist documents_store to JSON
        try:
            persist_documents_store()
        except Exception as e:
            logger.warning(f"Failed to persist documents_store: {e}")
            # Don't fail the ingestion if persistence fails
        
        return IngestionResponse(
            doc_id=doc_id,
            filename=final_document_name,
            status="success",
            pages=page_count,
            chunks=len(chunks),
            summary=summary if generate_summary_flag else None,
            message=f"Document ingested successfully from URL. Created {len(chunks)} chunks."
        )
        
    except HTTPException as exc:
        logger.error(f"URL ingestion failed: {exc.detail}", exc_info=True)
        raise
    except Exception as e:
        logger.error(f"Unexpected error ingesting document from URL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error ingesting document from URL: {str(e)}")

