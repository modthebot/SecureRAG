"""Embedding service wrapper."""
import logging
from typing import List

from app.services.model_adapter import get_model_adapter

logger = logging.getLogger(__name__)


class Embedder:
    """Service for generating embeddings."""
    
    def __init__(self):
        self.model_adapter = get_model_adapter()
    
    def get_embedding(self, text: str) -> List[float]:
        """Get embedding for text."""
        # Normalize text
        text = self._normalize_text(text)
        
        if not text or len(text.strip()) < 10:
            logger.warning("Text too short for embedding")
            return []
        
        try:
            embedding = self.model_adapter.get_embedding(text)
            return embedding
        except Exception as e:
            logger.error(f"Error getting embedding: {e}")
            raise
    
    def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for multiple texts (sequential for now)."""
        embeddings = []
        for text in texts:
            try:
                embedding = self.get_embedding(text)
                embeddings.append(embedding)
            except Exception as e:
                logger.error(f"Error getting embedding for text: {e}")
                # Use zero vector as fallback
                if embeddings:
                    embeddings.append([0.0] * len(embeddings[0]))
                else:
                    # Default dimension if we can't determine
                    embeddings.append([0.0] * 4096)
        
        return embeddings
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text before embedding."""
        # Remove excessive whitespace
        import re
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        return text

