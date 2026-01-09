"""Main FastAPI application."""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path

from app.config import settings
from app.api import health, ingest, chat, documents, export
from app.api.ingest import documents_store, persist_documents_store
from app.services.library_processor import LibraryProcessor
from app.services.document_store_loader import load_documents_store
from app.database import init_db

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="SecureRAG API",
    description="Privacy-first local RAG system for document ingestion, chat, and security-focused guardrails.",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://frontend:3000",  # Docker service name
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(ingest.router, tags=["Ingestion"])
app.include_router(chat.router, tags=["Chat"])
app.include_router(documents.router, tags=["Documents"])
app.include_router(export.router, tags=["Export"])

# Import remaining routers
from app.api import tools
app.include_router(tools.router, prefix="/tools", tags=["Tools"])


@app.on_event("startup")
async def startup_event():
    """Load documents_store and process library folder on application startup."""
    import asyncio
    
    logger.info("Starting application startup sequence...")
    
    # Initialize database
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing database: {e}", exc_info=True)
    
    # Run blocking operations in executor to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    
    # Step 1: Load documents_store from persisted sources
    logger.info("Loading documents_store from persisted sources...")
    try:
        loaded_docs = await loop.run_in_executor(None, load_documents_store)
        if loaded_docs:
            documents_store.update(loaded_docs)
            logger.info(f"Loaded {len(loaded_docs)} documents into documents_store")
        else:
            logger.info("No documents found in persisted sources")
    except Exception as e:
        logger.error(f"Error loading documents_store: {e}", exc_info=True)
        # Don't fail startup if document loading fails
        pass
    
    # Step 2: Reconstruct any missing documents from tracker
    logger.info("Reconstructing documents from processed files tracker...")
    try:
        processor = LibraryProcessor()
        recon_stats = await loop.run_in_executor(
            None, 
            processor.reconstruct_documents_store_from_tracker
        )
        if recon_stats['loaded'] > 0:
            logger.info(f"Reconstructed {recon_stats['loaded']} documents from tracker")
    except Exception as e:
        logger.warning(f"Error reconstructing documents from tracker: {e}", exc_info=True)
        # Don't fail startup if reconstruction fails
        pass
    
    # Step 3: Process library folder for new/unprocessed files
    logger.info("Processing library folder for new files...")
    try:
        processor = LibraryProcessor()
        stats = await loop.run_in_executor(None, processor.scan_and_process)
        logger.info(f"Library processing complete: {stats}")
    except Exception as e:
        logger.error(f"Error during library processing on startup: {e}", exc_info=True)
        # Don't fail startup if library processing fails
        pass

    # Step 4: Persist cleaned / reconstructed documents_store back to JSON
    # This ensures any orphan/ghost docs removed during load are
    # also removed from the on-disk snapshot in both local and Docker runs.
    try:
        await loop.run_in_executor(None, persist_documents_store)
        logger.info("Persisted documents_store snapshot after startup initialisation")
    except Exception as e:
        logger.warning(f"Failed to persist documents_store after startup: {e}", exc_info=True)
    
    logger.info(f"Startup complete. Total documents in store: {len(documents_store)}")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "SecureRAG API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True
    )
