"""Adapter for different LLM providers (Ollama, llama.cpp, etc.)."""
import os
import logging
import requests
from typing import List, Optional
from abc import ABC, abstractmethod

from app.config import settings

logger = logging.getLogger(__name__)


class ModelAdapter(ABC):
    """Abstract base class for model adapters."""
    
    @abstractmethod
    def get_embedding(self, text: str) -> List[float]:
        """Get embedding vector for text."""
        pass
    
    @abstractmethod
    def generate_text(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> str:
        """Generate text from prompt."""
        pass
    
    @abstractmethod
    def health_check(self) -> bool:
        """Check if model is available."""
        pass


class OllamaAdapter(ModelAdapter):
    """Adapter for Ollama local LLM."""
    
    def __init__(self, host: str = None, model: str = None):
        self.host = host or settings.ollama_host
        self.model = model or settings.ollama_model
        self.embedding_model = f"{self.model}"  # Ollama uses same model for embeddings
    
    def get_embedding(self, text: str) -> List[float]:
        """Get embedding from Ollama."""
        try:
            url = f"{self.host}/api/embeddings"
            payload = {
                "model": self.embedding_model,
                "prompt": text
            }
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            return data.get("embedding", [])
        except Exception as e:
            logger.error(f"Error getting embedding from Ollama: {e}")
            raise
    
    def generate_text(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> str:
        """Generate text from Ollama."""
        try:
            url = f"{self.host}/api/generate"
            payload = {
                "model": self.model,
                "prompt": prompt,
                "system": system or "",
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens
                },
                "stream": False
            }
            response = requests.post(url, json=payload, timeout=120)
            response.raise_for_status()
            data = response.json()
            return data.get("response", "")
        except Exception as e:
            logger.error(f"Error generating text from Ollama: {e}")
            raise
    
    def health_check(self) -> bool:
        """Check if Ollama is available."""
        try:
            url = f"{self.host}/api/tags"
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            return True
        except Exception as e:
            logger.warning(f"Ollama health check failed: {e}")
            return False


class LlamaCppAdapter(ModelAdapter):
    """Adapter for llama.cpp (fallback option)."""
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path
        # This would require llama-cpp-python
        # For now, raise NotImplementedError
        raise NotImplementedError("llama.cpp adapter not yet implemented")
    
    def get_embedding(self, text: str) -> List[float]:
        raise NotImplementedError
    
    def generate_text(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> str:
        raise NotImplementedError
    
    def health_check(self) -> bool:
        return False


def get_model_adapter() -> ModelAdapter:
    """Factory function to get the appropriate model adapter."""
    provider = settings.model_provider.upper()
    
    if provider == "OLLAMA":
        return OllamaAdapter()
    elif provider == "LLAMA_CPP":
        return LlamaCppAdapter()
    else:
        logger.warning(f"Unknown model provider: {provider}, defaulting to Ollama")
        return OllamaAdapter()

