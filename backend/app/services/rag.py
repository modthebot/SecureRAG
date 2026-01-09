"""RAG (Retrieval-Augmented Generation) service."""
import logging
from typing import List, Dict, Any, Optional, Tuple

from app.services.vector_store import VectorStore
from app.services.embedder import Embedder
from app.services.model_adapter import get_model_adapter
from app.config import settings

logger = logging.getLogger(__name__)


class RAGService:
    """RAG service for retrieval and generation."""
    
    def __init__(self):
        self.vector_store = VectorStore()
        self.embedder = Embedder()
        self.model_adapter = get_model_adapter()
        self._guardrails_service = None
    
    @property
    def guardrails_service(self):
        """Lazy initialization of guardrails service."""
        if self._guardrails_service is None:
            try:
                from app.services.guardrails_service import GuardrailsService
                service = GuardrailsService(
                    model_adapter=self.model_adapter,
                    rag_service=self
                )
                # Only set if service is properly initialized
                if service and service.health_check():
                    self._guardrails_service = service
                else:
                    self._guardrails_service = False  # Mark as unavailable
            except Exception as e:
                logger.debug(f"Could not initialize guardrails service: {e}")
                self._guardrails_service = False  # Mark as unavailable
        
        # Return service if it's a valid object, None otherwise
        if self._guardrails_service and self._guardrails_service is not False:
            return self._guardrails_service
        return None
    
    def retrieve(
        self,
        query: str,
        top_k: int = None,
        doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Retrieve relevant chunks for a query with optimizations."""
        top_k = top_k or settings.top_k
        
        # Limit top_k to reasonable maximum to prevent slow searches
        top_k = min(top_k, 10)
        
        # Get query embedding
        query_embedding = self.embedder.get_embedding(query)
        
        if not query_embedding:
            logger.warning("Failed to get query embedding")
            return []
        
        # Search vector store
        results = self.vector_store.search(
            query_embedding=query_embedding,
            top_k=top_k,
            doc_ids=doc_ids
        )
        
        # Early exit if we have high confidence results
        if results and settings.early_exit_confidence > 0:
            top_score = results[0].get('score', 0.0) if results else 0.0
            if top_score >= settings.early_exit_confidence:
                # Return only top results if confidence is very high
                logger.debug(f"Early exit: top confidence {top_score:.3f} >= {settings.early_exit_confidence}")
                return results[:min(3, len(results))]
        
        return results
    
    def generate(
        self,
        query: str,
        retrieved_chunks: List[Dict[str, Any]],
        use_system_prompt: bool = True,
        custom_system_prompt: Optional[str] = None,
        general_mode: bool = False,
        use_guardrails: bool = True,
    ) -> str:
        """
        Generate answer using RAG.
        
        Args:
            query: User query
            retrieved_chunks: Retrieved document chunks
            use_system_prompt: Whether to use system prompt
            custom_system_prompt: Custom system prompt
            general_mode: Whether to use general mode
            use_guardrails: Whether to apply guardrails (default: True)
        
        Returns:
            Generated response
        """
        # Build context from retrieved chunks with size limit
        context_parts = []
        total_length = 0
        max_length = settings.max_context_tokens * 4  # Rough estimate: 4 chars per token
        
        for chunk in retrieved_chunks:
            chunk_text = f"[Source: {chunk.get('filename', 'unknown')}, Page {chunk.get('page', 0)}, "
            chunk_text += f"Chunk {chunk.get('chunk_id', 'unknown')}]\n{chunk.get('text', '')}"
            
            # Limit context size to prevent slow generation
            if total_length + len(chunk_text) > max_length:
                logger.debug(f"Context limit reached, truncating at {len(context_parts)} chunks")
                break
            
            context_parts.append(chunk_text)
            total_length += len(chunk_text)
        
        context = "\n\n".join(context_parts)
        
        system_prompt = ""
        if use_system_prompt and not general_mode:
            if custom_system_prompt and custom_system_prompt.strip():
                system_prompt = custom_system_prompt.strip()
            else:
                system_prompt = self._get_default_system_prompt()
        elif custom_system_prompt and custom_system_prompt.strip():
            system_prompt = custom_system_prompt.strip()
        
        # Build user prompt
        user_prompt = self._build_user_prompt(query, context)
        
        # Generate response with or without guardrails
        try:
            if use_guardrails and self.guardrails_service:
                # Use guardrails for generation
                response, metadata = self.guardrails_service.generate_with_guardrails(
                    query=user_prompt,
                    context=context,
                    system_prompt=system_prompt,
                    max_tokens=2000,
                    temperature=0.7
                )
                
                # Log guardrails warnings if any
                if metadata.get("guardrails_warnings"):
                    logger.info(f"Guardrails warnings: {metadata.get('guardrails_warnings')}")
                
                return response
            else:
                # Direct generation without guardrails
                response = self.model_adapter.generate_text(
                    prompt=user_prompt,
                    system=system_prompt or "",
                    max_tokens=2000,
                    temperature=0.7
                )
                return response
        except Exception as e:
            logger.error(f"Error generating response: {e}")
            raise
    
    def _get_default_system_prompt(self) -> str:
        """Get default system prompt for pen-test context."""
        return """You are an assistant specialized in reviewing system architecture and security documents for penetration testing. You MUST:

- Use only the provided context (between ===CONTEXT START=== and ===CONTEXT END===).
- If the answer is not in the context, say "Not found in provided docs." and suggest next steps.
- Output the answer with: "Summary:", "Technologies:", "Focus Areas:", "Use Cases:", "Sources:".
- Sources must list filename + page + chunk_id for each referenced chunk.
- Be concise but thorough for penetration testing teams.
- Focus on security implications and attack surfaces."""
    
    def _build_user_prompt(self, query: str, context: str) -> str:
        """Build user prompt with context."""
        return f"""User query: {query}

===CONTEXT START===
{context}
===CONTEXT END===

Answer concisely and then expand with actionable items for penetration testers."""
    
    def classify_answer_type(self, query: str, answer: str) -> str:
        """Classify the type of answer."""
        query_lower = query.lower()
        answer_lower = answer.lower()
        
        if any(word in query_lower for word in ['summary', 'summarize', 'overview']):
            return "summary"
        elif any(word in query_lower for word in ['technology', 'tech', 'stack', 'tools']):
            return "tech_list"
        elif any(word in query_lower for word in ['focus', 'area', 'priority', 'important']):
            return "focus"
        elif any(word in query_lower for word in ['step', 'how', 'process', 'procedure']):
            return "steps"
        elif any(word in query_lower for word in ['vulnerability', 'exploit', 'attack', 'security']):
            return "finding"
        else:
            return "general"
    
    def extract_technologies(self, text: str) -> List[str]:
        """Extract technology names from text (simple regex-based)."""
        import re
        
        # Common technology patterns
        tech_patterns = [
            r'\b(nginx|apache|tomcat|iis)\b',
            r'\b(aws|azure|gcp|cloud)\b',
            r'\b(docker|kubernetes|k8s|container)\b',
            r'\b(mysql|postgresql|mongodb|redis|elasticsearch)\b',
            r'\b(python|java|node\.?js|go|rust|php|ruby)\b',
            r'\b(react|vue|angular|django|flask|spring)\b',
            r'\b(ssh|ftp|http|https|tls|ssl)\b',
            r'\b(oauth|jwt|saml|ldap|kerberos)\b',
        ]
        
        technologies = set()
        text_lower = text.lower()
        
        for pattern in tech_patterns:
            matches = re.findall(pattern, text_lower, re.IGNORECASE)
            technologies.update(matches)
        
        return sorted(list(technologies))

