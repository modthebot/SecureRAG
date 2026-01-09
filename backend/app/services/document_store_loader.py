"""Document store loader for restoring documents_store on startup."""
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional

from app.config import settings
from app.services.vector_store import VectorStore
from app.schemas import DocumentMetadata, DocumentSummary

logger = logging.getLogger(__name__)


def load_documents_store_from_json() -> Optional[Dict[str, Any]]:
    """
    Load documents_store from persisted JSON file.
    
    Returns:
        Dictionary of doc_id -> document metadata, or None if file doesn't exist or is invalid
    """
    json_path = Path(settings.data_dir) / "documents_store.json"
    
    if not json_path.exists():
        logger.info("documents_store.json not found, skipping JSON load")
        return None
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)
        
        if not isinstance(raw_data, dict):
            logger.warning("documents_store.json contains invalid data format")
            return None

        # Convert and lightly clean data
        data: Dict[str, Any] = {}
        for doc_id, doc_data in raw_data.items():
            if not isinstance(doc_data, dict):
                # Skip completely invalid entries
                logger.warning(f"Skipping invalid document entry for {doc_id} in documents_store.json")
                continue

            # Normalise summary
            if 'summary' in doc_data:
                summary_val = doc_data['summary']
                if isinstance(summary_val, dict):
                    try:
                        doc_data['summary'] = DocumentSummary(**summary_val)
                    except Exception as e:  # pragma: no cover - defensive
                        logger.warning(f"Failed to parse summary for {doc_id}: {e}")
                        doc_data['summary'] = None
                elif isinstance(summary_val, DocumentSummary) or summary_val is None:
                    # already OK
                    pass
                else:
                    # Legacy / malformed value (often a long string repr) – drop it
                    logger.info(
                        "Dropping malformed summary value for %s of type %s during JSON load",
                        doc_id,
                        type(summary_val),
                    )
                    doc_data['summary'] = None

            # Normalise metadata
            if 'metadata' in doc_data:
                metadata_val = doc_data['metadata']
                if isinstance(metadata_val, dict):
                    try:
                        doc_data['metadata'] = DocumentMetadata(**metadata_val)
                    except Exception as e:  # pragma: no cover - defensive
                        logger.warning(f"Failed to parse metadata for {doc_id}: {e}")
                        doc_data['metadata'] = DocumentMetadata()
                elif isinstance(metadata_val, DocumentMetadata):
                    # already OK
                    pass
                elif metadata_val is None:
                    doc_data['metadata'] = DocumentMetadata()
                else:
                    # Legacy string repr like 'owner=None project=None tags=[]'
                    logger.info(
                        "Dropping malformed metadata value for %s of type %s during JSON load",
                        doc_id,
                        type(metadata_val),
                    )
                    doc_data['metadata'] = DocumentMetadata()

            data[doc_id] = doc_data

        # Clean up "ghost" documents that have no chunks, no file_path and no backing vectors
        # (e.g. previously deleted test docs that still linger in JSON)
        try:
            from app.services.vector_store import VectorStore  # deferred import
            vector_store = VectorStore()
            doc_info_from_vector = vector_store.get_all_document_ids()
            valid_doc_ids = set(doc_info_from_vector.keys())

            cleaned_data: Dict[str, Any] = {}
            removed_count = 0
            for doc_id, doc_data in data.items():
                chunks = doc_data.get('chunks', 0) or 0
                file_path = doc_data.get('file_path')

                if (
                    doc_id not in valid_doc_ids
                    and chunks == 0
                    and not file_path
                ):
                    # This looks like an orphan / ghost entry – skip it
                    logger.info(f"Skipping orphan document entry {doc_id} ({doc_data.get('filename')}) from documents_store.json")
                    removed_count += 1
                    continue

                cleaned_data[doc_id] = doc_data

            if removed_count:
                logger.info(f"Cleaned {removed_count} orphan document entries from documents_store.json load")

            data = cleaned_data
        except Exception as e:
            # If anything goes wrong here, just fall back to raw data without cleaning
            logger.warning(f"Failed to clean orphan documents from JSON load: {e}", exc_info=True)

        logger.info(f"Loaded {len(data)} documents from documents_store.json")
        return data
        
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse documents_store.json: {e}")
        return None
    except Exception as e:
        logger.error(f"Error loading documents_store.json: {e}", exc_info=True)
        return None


def load_documents_store_from_tracker() -> Dict[str, Any]:
    """
    Reconstruct documents_store from processed files tracker.
    
    Returns:
        Dictionary of doc_id -> document metadata
    """
    # Import here to avoid circular import
    from app.services.library_processor import LibraryProcessor
    
    documents = {}
    processor = LibraryProcessor()
    processed_files = processor.get_processed_files()
    
    if not processed_files:
        logger.info("No processed files in tracker")
        return documents
    
    vector_store = VectorStore()
    doc_info_from_vector = vector_store.get_all_document_ids()
    
    for file_path_str, file_info in processed_files.items():
        doc_id = file_info.get('doc_id')
        if not doc_id:
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
        
        # Create basic document entry
        documents[doc_id] = {
            'doc_id': doc_id,
            'filename': filename,
            'file_type': file_ext,
            'pages': max_page if max_page > 0 else 1,
            'chunks': chunk_count,
            'summary': None,  # Summary not stored in tracker
            'metadata': DocumentMetadata(owner=None, project=None, tags=[]),
            'file_path': str(file_path)
        }
    
    logger.info(f"Reconstructed {len(documents)} documents from processed files tracker")
    return documents


def load_documents_store_from_vector_store() -> Dict[str, Any]:
    """
    Reconstruct documents_store from vector store by querying all document IDs.
    
    Returns:
        Dictionary of doc_id -> document metadata
    """
    documents = {}
    
    try:
        vector_store = VectorStore()
        doc_info = vector_store.get_all_document_ids()
        
        for doc_id, info in doc_info.items():
            filename = info.get('filename', 'unknown')
            chunk_count = info.get('chunk_count', 0)
            max_page = info.get('max_page', 0)
            
            # Try to infer file type from filename
            file_ext = Path(filename).suffix if filename else '.pdf'
            if not file_ext:
                file_ext = '.pdf'
            
            documents[doc_id] = {
                'doc_id': doc_id,
                'filename': filename,
                'file_type': file_ext,
                'pages': max_page if max_page > 0 else 1,
                'chunks': chunk_count,
                'summary': None,  # Summary not available from vector store
                'metadata': DocumentMetadata(owner=None, project=None, tags=[]),
                'file_path': None  # Original path not stored in vector store
            }
        
        logger.info(f"Reconstructed {len(documents)} documents from vector store")
        return documents
        
    except Exception as e:
        logger.error(f"Error loading documents from vector store: {e}", exc_info=True)
        return {}


def load_documents_store() -> Dict[str, Any]:
    """
    Load documents_store from multiple sources in priority order:
    1. documents_store.json (if exists and valid)
    2. Processed files tracker
    3. Vector store
    
    Returns:
        Dictionary of doc_id -> document metadata
    """
    # Try method 1: Load from JSON
    documents = load_documents_store_from_json()
    if documents:
        logger.info(f"Successfully loaded {len(documents)} documents from JSON")
        return documents
    
    # Try method 2: Reconstruct from tracker
    documents = load_documents_store_from_tracker()
    if documents:
        logger.info(f"Successfully reconstructed {len(documents)} documents from tracker")
        return documents
    
    # Try method 3: Reconstruct from vector store
    documents = load_documents_store_from_vector_store()
    if documents:
        logger.info(f"Successfully reconstructed {len(documents)} documents from vector store")
        return documents
    
    logger.warning("No documents could be loaded from any source")
    return {}

