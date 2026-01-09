"""Pydantic schemas for request/response validation."""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


# Document Schemas
class DocumentMetadata(BaseModel):
    """Metadata for a document."""
    owner: Optional[str] = None
    project: Optional[str] = None
    tags: Optional[List[str]] = None


class DocumentSummary(BaseModel):
    """Summary information for a document."""
    summary: str
    technologies: List[str]
    focus_areas: List[str]
    use_cases: List[str]


class DocumentChunk(BaseModel):
    """A chunk of text from a document."""
    chunk_id: str
    doc_id: str
    page: int
    chunk_index: int
    text: str
    char_start: int
    char_end: int
    metadata: Optional[Dict[str, Any]] = None


class Document(BaseModel):
    """Full document information."""
    doc_id: str
    filename: str
    file_type: str
    uploaded_at: datetime
    pages: int
    chunks: int
    summary: Optional[DocumentSummary] = None
    metadata: Optional[DocumentMetadata] = None
    file_path: Optional[str] = None


# Ingestion Schemas
class IngestionRequest(BaseModel):
    """Request for document ingestion."""
    metadata: Optional[DocumentMetadata] = None


class IngestionResponse(BaseModel):
    """Response from document ingestion."""
    doc_id: str
    filename: str
    status: str
    pages: int
    chunks: int
    summary: Optional[DocumentSummary] = None
    message: str


# Chat Schemas
class ChatRequest(BaseModel):
    """Request for chat query."""
    user_id: Optional[str] = None
    query: str = Field(..., min_length=1)
    doc_ids: Optional[List[str]] = None
    top_k: Optional[int] = None
    session_id: Optional[str] = None
    use_system_prompt: bool = True
    system_prompt: Optional[str] = None
    use_guardrails: Optional[bool] = True  # Enable/disable guardrails


class SourceCitation(BaseModel):
    """Source citation for a chat response."""
    doc_id: str
    filename: str
    page: int
    chunk_id: str
    score: float
    excerpt: Optional[str] = None


class ChatResponse(BaseModel):
    """Response from chat query."""
    answer: str
    answer_type: str  # "summary", "finding", "steps", "tech_list", "general"
    sources: List[SourceCitation]
    session_id: Optional[str] = None
    confidence: Optional[float] = None
    used_system_prompt: Optional[bool] = None
    guardrails_applied: Optional[bool] = None
    guardrails_warnings: Optional[List[str]] = None


class DeleteDocumentResponse(BaseModel):
    """Response after deleting a document."""
    doc_id: str
    status: str = "deleted"
    removed_chunks: Optional[int] = None

# FAQ Schemas
class FAQItem(BaseModel):
    """A single FAQ item."""
    question: str
    answer: Optional[str] = None
    doc_ids: Optional[List[str]] = None
    custom_answer: Optional[str] = None


class FAQRequest(BaseModel):
    """Request to upload FAQs."""
    faqs: List[FAQItem]


class FAQResponse(BaseModel):
    """Response from FAQ upload."""
    count: int
    faqs: List[FAQItem]


class SummaryResponse(BaseModel):
    """Short document summary response."""
    doc_id: str
    summary: str
    technologies: Optional[List[str]] = None


# Export Schemas
class ExportRequest(BaseModel):
    """Request to export document summary."""
    doc_ids: List[str]
    format: str = "json"  # "json" or "markdown"


class ExportResponse(BaseModel):
    """Response from export."""
    content: str
    format: str
    doc_ids: List[str]


# Health Schemas
class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    model_provider: str
    model_available: bool
    vector_store: str
    vector_store_available: bool


# Security Assessment Schemas
class SecurityAssessmentRequest(BaseModel):
    """Request for security assessment."""
    url: str = Field(..., min_length=1, description="Target URL to assess")
    flags: Optional[Dict[str, Any]] = Field(default={}, description="Optional flags: post, jwt, cookie, sqlmap")
    debug: bool = Field(default=False, description="Enable debug mode")


class ScriptResult(BaseModel):
    """Result for a single security test script."""
    script: str
    status: str  # PASS, FAIL, ERROR, SKIPPED
    returncode: int
    stdout: str
    stderr: str


class SecurityAssessmentResponse(BaseModel):
    """Response from security assessment."""
    assessment_id: str
    status: str  # running, completed, failed
    results: Dict[str, int]  # total, pass, fail, error, skipped
    scripts: List[ScriptResult]
    output_file: str
    debug_output: Optional[str] = None

