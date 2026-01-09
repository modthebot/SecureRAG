"""Configuration settings for SecureRAG."""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Model Provider
    model_provider: str = "OLLAMA"
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama2"
    ollama_agent_model: Optional[str] = None
    
    # Vector Store
    vector_store: str = "CHROMA"
    chroma_db_path: str = "./data/chroma"
    
    # Chunking
    max_chunk_tokens: int = 700
    chunk_overlap_tokens: int = 100
    top_k: int = 5
    
    # Data Directories
    data_dir: str = "./data"
    raw_docs_dir: str = "./data/raw"
    library_dir: str = "./data/library"
    processed_files_tracker: str = "./data/processed_files_tracker.json"
    
    # Logging
    log_level: str = "INFO"
    
    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    frontend_url: str = "http://localhost:3000"
    
    # Guardrails
    guardrails_enabled: bool = True
    guardrails_config_path: str = "./app/guardrails"
    guardrails_mode: str = "strict"
    
    # RAG Settings
    max_context_tokens: int = 4000
    early_exit_confidence: float = 0.0
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Create a singleton instance
settings = Settings()
