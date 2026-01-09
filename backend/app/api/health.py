"""Health check endpoint."""
from fastapi import APIRouter
from app.schemas import HealthResponse
from app.services.model_adapter import get_model_adapter
from app.services.vector_store import VectorStore
from app.config import settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    model_adapter = get_model_adapter()
    model_available = model_adapter.health_check()
    
    vector_store_available = False
    try:
        vs = VectorStore()
        vector_store_available = True
    except Exception:
        pass
    
    return HealthResponse(
        status="healthy" if (model_available and vector_store_available) else "degraded",
        model_provider=settings.model_provider,
        model_available=model_available,
        vector_store=settings.vector_store,
        vector_store_available=vector_store_available
    )
