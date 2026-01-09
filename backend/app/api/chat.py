"""Chat endpoint for RAG queries."""
import logging
import asyncio
from fastapi import APIRouter, HTTPException
from typing import Optional

from app.schemas import ChatRequest, ChatResponse, SourceCitation
from app.services.rag import RAGService
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

rag_service = RAGService()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat with RAG context."""
    try:
        # Wrap entire chat processing in timeout
        async def _process_chat():
            use_system_prompt = request.use_system_prompt if request.use_system_prompt is not None else True
            use_guardrails = request.use_guardrails if request.use_guardrails is not None else True
            
            # Validate input with guardrails if enabled
            guardrails_warnings = []
            guardrails_applied = False
            
            if use_guardrails and rag_service.guardrails_service:
                input_valid, input_message = rag_service.guardrails_service.validate_input(request.query)
                if not input_valid:
                    # Input was rejected by guardrails
                    return ChatResponse(
                        answer=input_message,
                        answer_type="general",
                        sources=[],
                        session_id=request.session_id,
                        confidence=0.0,
                        used_system_prompt=use_system_prompt,
                        guardrails_applied=True,
                        guardrails_warnings=[input_message]
                    )
            
            # Retrieve relevant chunks
            top_k = request.top_k or settings.top_k
            retrieved_chunks = rag_service.retrieve(
                query=request.query,
                top_k=top_k,
                doc_ids=request.doc_ids
            )
            
            if not retrieved_chunks:
                return ChatResponse(
                    answer="No relevant documents found. Please upload documents first.",
                    answer_type="general",
                    sources=[],
                    session_id=request.session_id,
                    confidence=0.0,
                    guardrails_applied=guardrails_applied,
                    guardrails_warnings=guardrails_warnings if guardrails_warnings else None
                )
            
            # Generate answer with guardrails if enabled
            answer = rag_service.generate(
                query=request.query,
                retrieved_chunks=retrieved_chunks,
                use_system_prompt=use_system_prompt,
                custom_system_prompt=request.system_prompt,
                general_mode=not use_system_prompt,
                use_guardrails=use_guardrails,
            )
            
            # Get guardrails metadata if available
            if use_guardrails and rag_service.guardrails_service:
                guardrails_applied = True
                # Check if there are any warnings from the generation
                # This would be set by the guardrails service during generation
            
            # Classify answer type
            answer_type = rag_service.classify_answer_type(request.query, answer)
            
            # Build source citations
            sources = []
            for chunk in retrieved_chunks:
                sources.append(SourceCitation(
                    doc_id=chunk.get('doc_id', ''),
                    filename=chunk.get('filename', 'unknown'),
                    page=chunk.get('page', 0),
                    chunk_id=chunk.get('chunk_id', ''),
                    score=chunk.get('score', 0.0),
                    excerpt=chunk.get('text', '')[:200] + "..." if len(chunk.get('text', '')) > 200 else chunk.get('text', '')
                ))
            
            # Calculate average confidence
            confidence = sum(s.score for s in sources) / len(sources) if sources else 0.0
            
            return ChatResponse(
                answer=answer,
                answer_type=answer_type,
                sources=sources,
                session_id=request.session_id,
                confidence=confidence,
                used_system_prompt=use_system_prompt,
                guardrails_applied=guardrails_applied if use_guardrails else None,
                guardrails_warnings=guardrails_warnings if guardrails_warnings else None
            )
        
        # Execute with timeout
        try:
            response = await asyncio.wait_for(
                _process_chat(),
                timeout=settings.chat_timeout
            )
            return response
        except asyncio.TimeoutError:
            logger.warning(f"Chat request timed out after {settings.chat_timeout}s")
            raise HTTPException(
                status_code=504,
                detail=f"Request timed out after {settings.chat_timeout} seconds. Please try a simpler query or check your documents."
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing chat request: {str(e)}")

