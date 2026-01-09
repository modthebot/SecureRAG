"""Documents endpoint."""
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException

from app.api.ingest import documents_store
from app.schemas import Document, DeleteDocumentResponse, DocumentSummary, DocumentMetadata
from app.services.vector_store import VectorStore
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


def _parse_summary(doc_id: str, summary_data: any) -> Optional[DocumentSummary]:
    """Helper to parse summary safely."""
    if isinstance(summary_data, dict):
        try:
            return DocumentSummary(**summary_data)
        except Exception as e:
            logger.warning(f"Failed to parse summary for {doc_id}: {e}")
            return None
    elif isinstance(summary_data, DocumentSummary):
        return summary_data
    elif summary_data is None:
        return None
    else:
        logger.warning(f"Ignoring malformed summary for {doc_id} of type {type(summary_data)}")
        return None


def _parse_metadata(doc_id: str, metadata_data: any) -> DocumentMetadata:
    """Helper to parse metadata safely."""
    if isinstance(metadata_data, dict):
        try:
            return DocumentMetadata(**metadata_data)
        except Exception as e:
            logger.warning(f"Failed to parse metadata for {doc_id}: {e}")
            return DocumentMetadata()
    elif isinstance(metadata_data, DocumentMetadata):
        return metadata_data
    elif metadata_data is None:
        return DocumentMetadata()
    else:
        logger.warning(f"Ignoring malformed metadata for {doc_id} of type {type(metadata_data)}")
        return DocumentMetadata()


@router.get("/documents", response_model=List[Document])
async def list_documents():
    """List all ingested documents - optimized for performance."""
    docs = []
    current_time = datetime.now()  # Get timestamp once instead of in loop
    
    # Process documents in batch
    for doc_id, doc_data in documents_store.items():
        try:
            # Parse summary and metadata using helper functions
            summary = _parse_summary(doc_id, doc_data.get('summary'))
            metadata = _parse_metadata(doc_id, doc_data.get('metadata'))
            
            docs.append(Document(
                doc_id=doc_data.get('doc_id', doc_id),
                filename=doc_data.get('filename', 'Unknown'),
                file_type=doc_data.get('file_type', ''),
                uploaded_at=current_time,  # Use single timestamp
                pages=doc_data.get('pages', 0),
                chunks=doc_data.get('chunks', 0),
                summary=summary,
                metadata=metadata,
                file_path=doc_data.get('file_path')
            ))
        except Exception as e:
            # Log and skip this single document rather than raising a full stack trace
            logger.error(f"Error processing document {doc_id}: {e}", exc_info=True)
            continue

    return docs


@router.get("/documents/{doc_id}", response_model=Document)
async def get_document(doc_id: str):
    """Get a specific document."""
    if doc_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found")

    doc_data = documents_store[doc_id]
    
    # Handle summary - convert dict/objects to DocumentSummary if needed and safe
    summary = doc_data.get('summary')
    if isinstance(summary, dict):
        try:
            summary = DocumentSummary(**summary)
        except Exception as e:  # pragma: no cover - defensive
            logger.warning(f"Failed to parse summary for {doc_id}: {e}")
            summary = None
    elif isinstance(summary, DocumentSummary):
        pass
    elif summary is None:
        summary = None
    else:
        logger.warning(
            "Ignoring malformed summary for %s of type %s", doc_id, type(summary)
        )
        summary = None

    # Handle metadata - convert dict/objects to DocumentMetadata if needed and safe
    metadata = doc_data.get('metadata')
    if isinstance(metadata, dict):
        try:
            metadata = DocumentMetadata(**metadata)
        except Exception as e:  # pragma: no cover - defensive
            logger.warning(f"Failed to parse metadata for {doc_id}: {e}")
            metadata = DocumentMetadata()
    elif isinstance(metadata, DocumentMetadata):
        pass
    elif metadata is None:
        metadata = DocumentMetadata()
    else:
        logger.warning(
            "Ignoring malformed metadata for %s of type %s", doc_id, type(metadata)
        )
        metadata = DocumentMetadata()

    return Document(
        doc_id=doc_data.get('doc_id', doc_id),
        filename=doc_data.get('filename', 'Unknown'),
        file_type=doc_data.get('file_type', ''),
        uploaded_at=datetime.now(),
        pages=doc_data.get('pages', 0),
        chunks=doc_data.get('chunks', 0),
        summary=summary,
        metadata=metadata,
        file_path=doc_data.get('file_path')
    )


@router.delete("/documents/{doc_id}", response_model=DeleteDocumentResponse)
async def delete_document(doc_id: str):
    """Delete a document and clean up associated resources."""
    if doc_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found")

    doc_data = documents_store.get(doc_id)
    removed_chunks = doc_data.get('chunks', 0)

    # Remove from vector store
    try:
        vector_store = VectorStore()
        vector_store.delete_document(doc_id)
    except Exception as exc:
        logger.error("Failed to remove document %s from vector store: %s", doc_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to remove document from vector store")

    # Delete stored files
    file_path = doc_data.get('file_path')
    if file_path:
        try:
            doc_dir = Path(file_path).parent
            if doc_dir.exists() and doc_dir.is_dir():
                shutil.rmtree(doc_dir)
        except Exception as exc:
            logger.warning("Failed to remove stored files for document %s: %s", doc_id, exc, exc_info=True)

    # Remove from in-memory store
    documents_store.pop(doc_id, None)
    
    # Persist the updated documents_store to JSON
    try:
        from app.api.ingest import persist_documents_store
        persist_documents_store()
    except Exception as exc:
        logger.warning("Failed to persist documents_store after deletion: %s", exc, exc_info=True)
    
    # Also remove from library folder if it exists there
    try:
        library_dir = Path(settings.library_dir)
        if library_dir.exists():
            # Try to find and remove the file from library
            filename = doc_data.get('filename', '')
            if filename:
                # Try exact match first
                library_file = library_dir / filename
                if library_file.exists():
                    library_file.unlink()
                    logger.info(f"Removed {filename} from library folder")
                else:
                    # Try with .pdf extension if not present
                    if not filename.endswith('.pdf'):
                        library_file = library_dir / f"{filename}.pdf"
                        if library_file.exists():
                            library_file.unlink()
                            logger.info(f"Removed {filename}.pdf from library folder")
    except Exception as exc:
        logger.warning("Failed to remove file from library folder: %s", exc, exc_info=True)
    
    # Remove from processed files tracker to prevent re-adding on restart
    try:
        from app.services.library_processor import LibraryProcessor
        processor = LibraryProcessor()
        processed_files = processor.get_processed_files()
        
        # Find and remove entry by doc_id
        file_path_to_remove = None
        for file_path_str, file_info in processed_files.items():
            if file_info.get('doc_id') == doc_id:
                file_path_to_remove = file_path_str
                break
        
        if file_path_to_remove:
            processed_files.pop(file_path_to_remove, None)
            # Save updated tracker
            tracker_file = Path(settings.processed_files_tracker)
            tracker_file.parent.mkdir(parents=True, exist_ok=True)
            with open(tracker_file, 'w') as f:
                import json
                json.dump(processed_files, f, indent=2)
            logger.info(f"Removed doc_id {doc_id} from processed files tracker")
    except Exception as exc:
        logger.warning("Failed to remove document from processed files tracker: %s", exc, exc_info=True)

    logger.info("Document %s deleted successfully", doc_id)
    return DeleteDocumentResponse(doc_id=doc_id, removed_chunks=removed_chunks)

