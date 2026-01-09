"""Custom actions for NeMo Guardrails."""

import re
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


class GuardrailsActions:
    """Custom actions for guardrails validation."""
    
    # Common jailbreak patterns
    JAILBREAK_PATTERNS = [
        r"ignore\s+(previous|all)\s+instructions",
        r"forget\s+(your|all)\s+(system\s+)?prompt",
        r"you\s+are\s+now\s+(a\s+)?(different|new)",
        r"act\s+as\s+if",
        r"pretend\s+you\s+are",
        r"disregard\s+(your|all)",
        r"override\s+your",
        r"what\s+are\s+your\s+instructions",
        r"show\s+me\s+your\s+prompt",
        r"reveal\s+your\s+system",
    ]
    
    # Malicious content patterns
    MALICIOUS_PATTERNS = [
        r"how\s+to\s+hack",
        r"exploit\s+the\s+system",
        r"bypass\s+security",
        r"create\s+malware",
        r"generate\s+malicious",
        r"sql\s+injection",
        r"xss\s+attack",
        r"command\s+injection",
    ]
    
    # Off-topic patterns
    OFF_TOPIC_PATTERNS = [
        r"what\s+is\s+the\s+weather",
        r"tell\s+me\s+a\s+joke",
        r"what\s+is\s+\d+\s*\+\s*\d+",
        r"who\s+is\s+the\s+president",
        r"what\s+time\s+is\s+it",
    ]
    
    def __init__(self, rag_service=None):
        """Initialize with optional RAG service for context retrieval."""
        self.rag_service = rag_service
        self.context_provided = False
    
    def check_jailbreak_attempt(self, user_message: str) -> bool:
        """Check if user message contains jailbreak attempt."""
        if not user_message:
            return False
        
        message_lower = user_message.lower()
        for pattern in self.JAILBREAK_PATTERNS:
            if re.search(pattern, message_lower, re.IGNORECASE):
                logger.warning(f"Jailbreak attempt detected: {pattern}")
                return True
        return False
    
    def check_malicious_content(self, user_message: str) -> bool:
        """Check if user message contains malicious intent."""
        if not user_message:
            return False
        
        message_lower = user_message.lower()
        for pattern in self.MALICIOUS_PATTERNS:
            if re.search(pattern, message_lower, re.IGNORECASE):
                logger.warning(f"Malicious content detected: {pattern}")
                return True
        return False
    
    def check_off_topic(self, user_message: str) -> bool:
        """Check if query is off-topic (not related to documents)."""
        if not user_message:
            return True
        
        message_lower = user_message.lower()
        
        # Check for off-topic patterns
        for pattern in self.OFF_TOPIC_PATTERNS:
            if re.search(pattern, message_lower, re.IGNORECASE):
                return True
        
        # Check for document-related keywords
        doc_keywords = [
            "document", "architecture", "system", "technology", "security",
            "vulnerability", "penetration", "test", "component", "service",
            "application", "network", "infrastructure"
        ]
        
        has_doc_keywords = any(keyword in message_lower for keyword in doc_keywords)
        return not has_doc_keywords
    
    def get_query_context(self, user_message: str) -> Optional[str]:
        """Get context for the query (placeholder - would use RAG service)."""
        # This would be called by guardrails to check if context exists
        if self.rag_service:
            try:
                chunks = self.rag_service.retrieve(user_message, top_k=1)
                return chunks[0].get('text', '') if chunks else None
            except Exception as e:
                logger.error(f"Error retrieving context: {e}")
        return None
    
    def retrieve_context(self, user_message: str) -> Optional[List[Dict[str, Any]]]:
        """Retrieve context chunks for the query."""
        if self.rag_service:
            try:
                chunks = self.rag_service.retrieve(user_message, top_k=5)
                self.context_provided = len(chunks) > 0
                return chunks
            except Exception as e:
                logger.error(f"Error retrieving context: {e}")
        return None
    
    def check_sources_in_response(self, bot_message: str) -> bool:
        """Check if bot response includes source citations."""
        if not bot_message:
            return False
        
        source_indicators = [
            "source", "reference", "document", "page", "chunk",
            "according to", "based on", "from the"
        ]
        
        message_lower = bot_message.lower()
        return any(indicator in message_lower for indicator in source_indicators)
    
    def check_response_relevance(self, bot_message: str, user_message: str = "") -> bool:
        """Check if bot response is relevant to user query."""
        if not bot_message:
            return False
        
        if not user_message:
            # If no user message provided, just check if response has content
            return len(bot_message.strip()) > 0
        
        # Simple keyword overlap check
        user_words = set(user_message.lower().split())
        bot_words = set(bot_message.lower().split())
        
        # Remove common stop words
        stop_words = {"the", "a", "an", "is", "are", "was", "were", "be", "been"}
        user_words -= stop_words
        bot_words -= stop_words
        
        if not user_words:
            return True
        
        overlap = len(user_words & bot_words) / len(user_words)
        return overlap > 0.2  # At least 20% keyword overlap
    
    def check_response_safety(self, bot_message: str) -> bool:
        """Check if bot response is safe (no harmful content)."""
        if not bot_message:
            return True
        
        # Check for potentially harmful content
        unsafe_patterns = [
            r"here\s+is\s+how\s+to\s+hack",
            r"i\s+can\s+help\s+you\s+exploit",
            r"bypass\s+security\s+by",
        ]
        
        message_lower = bot_message.lower()
        for pattern in unsafe_patterns:
            if re.search(pattern, message_lower, re.IGNORECASE):
                logger.warning(f"Unsafe response detected: {pattern}")
                return False
        
        return True
    
    def get_response_length(self, bot_message: str) -> int:
        """Get length of bot response."""
        return len(bot_message) if bot_message else 0
    
    def check_meaningful_content(self, bot_message: str) -> bool:
        """Check if response has meaningful content."""
        if not bot_message:
            return False
        
        # Remove common filler phrases
        meaningful_text = bot_message.lower()
        filler_phrases = [
            "i'm sorry", "i don't know", "i cannot", "i'm not sure",
            "i don't have", "unable to"
        ]
        
        for phrase in filler_phrases:
            meaningful_text = meaningful_text.replace(phrase, "")
        
        # Check if there's substantial content left
        return len(meaningful_text.strip()) > 50
    
    def check_context_usage(self, bot_message: str) -> bool:
        """Check if bot used context in response."""
        context_indicators = [
            "context", "document", "provided", "according to",
            "based on", "from the", "source"
        ]
        
        message_lower = bot_message.lower()
        return any(indicator in message_lower for indicator in context_indicators)
    
    def check_citations(self, bot_message: str) -> bool:
        """Check if response includes proper citations."""
        # Look for citation patterns like "Source: filename, page X"
        citation_patterns = [
            r"source[s]?:\s*\w+",
            r"reference[s]?:\s*\w+",
            r"page\s+\d+",
            r"chunk\s+\w+",
        ]
        
        for pattern in citation_patterns:
            if re.search(pattern, bot_message, re.IGNORECASE):
                return True
        
        return False

