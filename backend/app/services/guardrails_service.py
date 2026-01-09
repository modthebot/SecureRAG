"""NeMo Guardrails service for LLM safety."""

import logging
import os
import time
import hashlib
from typing import Optional, Dict, Any, List, Tuple
from pathlib import Path
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

# Try to import NeMo Guardrails
try:
    from nemoguardrails import LLMRails, RailsConfig
    NEMO_AVAILABLE = True
except ImportError:
    NEMO_AVAILABLE = False
    LLMRails = None
    RailsConfig = None

from app.services.model_adapter import ModelAdapter
from app.config import settings

logger = logging.getLogger(__name__)


class GuardrailsService:
    """Service to wrap LLM calls with NeMo Guardrails or custom validation."""
    
    def __init__(
        self,
        model_adapter: Optional[ModelAdapter] = None,
        rag_service: Optional[Any] = None,
        config_path: Optional[str] = None
    ):
        """Initialize guardrails service."""
        self.enabled = getattr(settings, 'guardrails_enabled', True)
        self.config_path = config_path or getattr(
            settings, 
            'guardrails_config_path', 
            './app/guardrails'
        )
        
        self.model_adapter = model_adapter
        self.rag_service = rag_service
        self.rails = None
        self.actions = None
        
        # Performance optimization settings
        self.timeout = getattr(settings, 'guardrails_timeout', 2.0)
        self.cache_enabled = getattr(settings, 'guardrails_cache_enabled', True)
        self.fast_path_enabled = getattr(settings, 'guardrails_fast_path_enabled', True)
        
        # Simple in-memory cache for validation results
        self._validation_cache: Dict[str, Tuple[bool, str, float]] = {}
        self._cache_max_age = 3600  # Cache entries expire after 1 hour
        
        # Performance metrics
        self._validation_times: List[float] = []
        self._cache_hits = 0
        self._cache_misses = 0
        
        # Initialize custom actions for fallback validation
        if self.rag_service:
            try:
                from app.guardrails.actions import GuardrailsActions
                self.actions = GuardrailsActions(rag_service=self.rag_service)
            except ImportError:
                logger.warning("Could not import GuardrailsActions")
                self.actions = None
        
        if self.enabled and NEMO_AVAILABLE:
            try:
                self._initialize_guardrails()
            except Exception as e:
                logger.error(f"Failed to initialize NeMo Guardrails: {e}", exc_info=True)
                self.rails = None
                # Continue with fallback validation
        elif self.enabled and not NEMO_AVAILABLE:
            logger.info("NeMo Guardrails not available, using fallback validation")
    
    def _initialize_guardrails(self):
        """Initialize NeMo Guardrails with configuration."""
        if not NEMO_AVAILABLE:
            return
        
        config_path = Path(self.config_path)
        
        if not config_path.exists():
            logger.warning(f"Guardrails config path not found: {config_path}")
            return
        
        try:
            # Load configuration from path
            config = RailsConfig.from_path(str(config_path))
            
            # Create a custom LLM provider that uses our Ollama adapter
            # NeMo Guardrails expects an LLM that implements certain methods
            if self.model_adapter:
                # For now, we'll use a simple wrapper approach
                # The actual integration may need adjustment based on NeMo version
                llm = self._create_llm_wrapper()
                
                # Initialize rails with config and LLM
                self.rails = LLMRails(config=config, llm=llm)
                
                logger.info("NeMo Guardrails initialized successfully")
            else:
                logger.warning("No model adapter provided, cannot initialize guardrails")
                
        except Exception as e:
            logger.error(f"Error initializing NeMo Guardrails: {e}", exc_info=True)
            self.rails = None
    
    def _create_llm_wrapper(self):
        """Create an LLM wrapper compatible with NeMo Guardrails."""
        # This is a simplified wrapper - actual implementation depends on NeMo version
        class OllamaLLMWrapper:
            """Wrapper to make OllamaAdapter compatible with NeMo Guardrails."""
            
            def __init__(self, model_adapter: ModelAdapter):
                self.model_adapter = model_adapter
            
            def __call__(self, prompt: str, **kwargs) -> str:
                """Generate text using the model adapter."""
                system = kwargs.get("system_prompt", kwargs.get("system", ""))
                max_tokens = kwargs.get("max_tokens", 2000)
                temperature = kwargs.get("temperature", 0.7)
                
                return self.model_adapter.generate_text(
                    prompt=prompt,
                    system=system,
                    max_tokens=max_tokens,
                    temperature=temperature
                )
        
        return OllamaLLMWrapper(self.model_adapter) if self.model_adapter else None
    
    def _get_cache_key(self, query: str, validation_type: str = "input") -> str:
        """Generate cache key for query."""
        key_string = f"{validation_type}:{query.lower().strip()}"
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def _clean_cache(self):
        """Remove expired cache entries."""
        current_time = time.time()
        expired_keys = [
            key for key, (_, _, timestamp) in self._validation_cache.items()
            if current_time - timestamp > self._cache_max_age
        ]
        for key in expired_keys:
            del self._validation_cache[key]
    
    def _fast_path_check(self, query: str) -> Optional[Tuple[bool, str]]:
        """Fast path validation for obviously safe queries."""
        if not self.fast_path_enabled:
            return None
        
        query_lower = query.lower().strip()
        
        # Very short queries are usually safe
        if len(query) < 10:
            return True, ""
        
        # Common document analysis queries are safe
        safe_patterns = [
            "what", "how", "where", "when", "which", "who",
            "explain", "describe", "list", "show", "give",
            "summary", "architecture", "component", "technology",
            "document", "file", "page", "section"
        ]
        
        if any(pattern in query_lower for pattern in safe_patterns):
            # Quick check for obvious malicious patterns
            malicious_patterns = [
                "hack", "exploit", "bypass", "override", "ignore previous",
                "malicious", "virus", "trojan"
            ]
            
            if not any(pattern in query_lower for pattern in malicious_patterns):
                return True, ""
        
        return None
    
    def validate_input(self, query: str) -> Tuple[bool, str]:
        """
        Validate user input using guardrails or fallback validation.
        
        Returns:
            Tuple of (is_valid, message)
        """
        start_time = time.time()
        
        if not self.enabled:
            return True, ""
        
        # Check cache first
        if self.cache_enabled:
            cache_key = self._get_cache_key(query, "input")
            self._clean_cache()
            if cache_key in self._validation_cache:
                is_valid, message, _ = self._validation_cache[cache_key]
                self._cache_hits += 1
                elapsed = time.time() - start_time
                self._validation_times.append(elapsed)
                logger.debug(f"Guardrails validation (cached): {elapsed*1000:.2f}ms")
                return is_valid, message
            self._cache_misses += 1
        
        # Fast path optimization
        fast_result = self._fast_path_check(query)
        if fast_result is not None:
            is_valid, message = fast_result
            if self.cache_enabled:
                self._validation_cache[cache_key] = (is_valid, message, time.time())
            elapsed = time.time() - start_time
            self._validation_times.append(elapsed)
            logger.debug(f"Guardrails validation (fast path): {elapsed*1000:.2f}ms")
            return is_valid, message
        
        # Full validation with timeout
        def _validate():
            # Use NeMo Guardrails if available
            if self.rails and NEMO_AVAILABLE:
                try:
                    # Try to use NeMo's input validation
                    # This would trigger input rails defined in rails.co
                    messages = [{"role": "user", "content": query}]
                    # Note: Actual API may vary by NeMo version
                    # For now, we'll use fallback validation
                    pass
                except Exception as e:
                    logger.debug(f"NeMo input validation error: {e}, using fallback")
            
            # Fallback to custom validation using actions
            if self.actions:
                # Check for jailbreak attempts
                if self.actions.check_jailbreak_attempt(query):
                    return False, "I cannot override my instructions. How can I help you with your document analysis?"
                
                # Check for malicious content
                if self.actions.check_malicious_content(query):
                    return False, "That query is not appropriate for this system. I focus on analyzing system architecture and security documents."
                
                # Check if off-topic
                if self.actions.check_off_topic(query):
                    return False, "I'm designed to help with system architecture and security document analysis. Please ask questions about your uploaded documents."
            
            return True, ""
        
        try:
            # Execute validation with timeout
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_validate)
                is_valid, message = future.result(timeout=self.timeout)
        except FutureTimeoutError:
            logger.warning(f"Guardrails validation timed out after {self.timeout}s, allowing query")
            is_valid, message = True, ""  # Fail open on timeout
        except Exception as e:
            logger.error(f"Error during guardrails validation: {e}", exc_info=True)
            is_valid, message = True, ""  # Fail open on error
        
        # Cache result
        if self.cache_enabled:
            self._validation_cache[cache_key] = (is_valid, message, time.time())
        
        elapsed = time.time() - start_time
        self._validation_times.append(elapsed)
        
        # Log performance metrics
        if len(self._validation_times) > 0 and len(self._validation_times) % 100 == 0:
            avg_time = sum(self._validation_times[-100:]) / 100
            cache_hit_rate = self._cache_hits / (self._cache_hits + self._cache_misses) if (self._cache_hits + self._cache_misses) > 0 else 0
            logger.info(f"Guardrails performance: avg={avg_time*1000:.2f}ms, cache_hit_rate={cache_hit_rate*100:.1f}%")
        
        return is_valid, message
    
    def validate_output(self, response: str, query: str = "") -> Tuple[bool, str]:
        """
        Validate LLM output using guardrails or fallback validation.
        
        Returns:
            Tuple of (is_valid, message)
        """
        start_time = time.time()
        
        if not self.enabled:
            return True, ""
        
        # Check cache first (for output validation, use response hash)
        if self.cache_enabled:
            cache_key = self._get_cache_key(response[:200], "output")  # Use first 200 chars for cache key
            self._clean_cache()
            if cache_key in self._validation_cache:
                is_valid, message, _ = self._validation_cache[cache_key]
                self._cache_hits += 1
                elapsed = time.time() - start_time
                logger.debug(f"Guardrails output validation (cached): {elapsed*1000:.2f}ms")
                return is_valid, message
            self._cache_misses += 1
        
        # Full validation with timeout
        def _validate():
            # Use NeMo Guardrails if available
            if self.rails and NEMO_AVAILABLE:
                try:
                    # Try to use NeMo's output validation
                    # This would trigger output rails defined in rails.co
                    pass
                except Exception as e:
                    logger.debug(f"NeMo output validation error: {e}, using fallback")
            
            # Fallback to custom validation using actions
            if self.actions:
                # Check response safety
                if not self.actions.check_response_safety(response):
                    return False, "Response contains unsafe content and has been filtered."
                
                # Check response relevance
                if query and not self.actions.check_response_relevance(response, query):
                    logger.warning("Response may not be relevant to query")
                
                # Check response length
                length = self.actions.get_response_length(response)
                if length > 5000:
                    return False, "Response is too long."
            
            return True, ""
        
        try:
            # Execute validation with timeout
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_validate)
                is_valid, message = future.result(timeout=self.timeout)
        except FutureTimeoutError:
            logger.warning(f"Guardrails output validation timed out after {self.timeout}s, allowing response")
            is_valid, message = True, ""  # Fail open on timeout
        except Exception as e:
            logger.error(f"Error during guardrails output validation: {e}", exc_info=True)
            is_valid, message = True, ""  # Fail open on error
        
        # Cache result
        if self.cache_enabled:
            self._validation_cache[cache_key] = (is_valid, message, time.time())
        
        elapsed = time.time() - start_time
        logger.debug(f"Guardrails output validation: {elapsed*1000:.2f}ms")
        
        return is_valid, message
    
    def generate_with_guardrails(
        self,
        query: str,
        context: Optional[str] = None,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Generate response with guardrails applied.
        
        Returns:
            Tuple of (response, metadata) where metadata contains guardrails info
        """
        metadata = {
            "guardrails_applied": False,
            "guardrails_warnings": [],
            "input_validated": False,
            "output_validated": False,
            "input_rejected": False,
            "output_rejected": False
        }
        
        if not self.enabled or not self.model_adapter:
            # No guardrails, use direct model call
            logger.debug("Guardrails not enabled or no model adapter")
            response = self.model_adapter.generate_text(
                prompt=query,
                system=system_prompt or "",
                max_tokens=max_tokens,
                temperature=temperature
            ) if self.model_adapter else ""
            return response, metadata
        
        # Step 1: Validate input
        input_valid, input_message = self.validate_input(query)
        metadata["input_validated"] = True
        
        if not input_valid:
            metadata["input_rejected"] = True
            metadata["guardrails_warnings"].append(input_message)
            # Return a safe response instead of the query
            return input_message, metadata
        
        # Step 2: Generate response (with or without NeMo Guardrails)
        try:
            # For now, we disable NeMo's own generation by default to avoid
            # async/sync runtime issues. When nemo_guardrails_generation_enabled
            # is True, callers should instead use an async NeMo path.
            use_nemo_generation = (
                getattr(settings, "nemo_guardrails_generation_enabled", False)
                and self.rails is not None
                and NEMO_AVAILABLE
            )

            if use_nemo_generation:
                # NOTE: This sync path is intentionally not used by default.
                # Proper async integration should call an async helper that
                # uses rails.generate_async(...) from an async context.
                messages = [{"role": "user", "content": query}]
                if context or system_prompt:
                    system_content = f"{system_prompt or ''}\n\nContext: {context}" if context else system_prompt or ""
                    messages.insert(0, {"role": "system", "content": system_content})
                response = self.rails.generate(messages=messages)
                metadata["guardrails_applied"] = True
            else:
                # Fallback: Generate directly and validate output
                response = self.model_adapter.generate_text(
                    prompt=query,
                    system=system_prompt or "",
                    max_tokens=max_tokens,
                    temperature=temperature
                )
                metadata["guardrails_applied"] = False
                
        except Exception as e:
            logger.error(f"Error in guardrails generation: {e}", exc_info=True)
            # Fallback to direct call
            response = self.model_adapter.generate_text(
                prompt=query,
                system=system_prompt or "",
                max_tokens=max_tokens,
                temperature=temperature
            )
            metadata["guardrails_warnings"].append(f"Guardrails error: {str(e)}")
        
        # Step 3: Validate output
        output_valid, output_message = self.validate_output(response, query)
        metadata["output_validated"] = True
        
        if not output_valid:
            metadata["output_rejected"] = True
            metadata["guardrails_warnings"].append(output_message)
            # Return a safe fallback response
            response = "I cannot provide that response as it may contain unsafe content. Please try rephrasing your question."
        
        return response, metadata
    
    def health_check(self) -> bool:
        """Check if guardrails service is healthy."""
        if not self.enabled:
            return True  # Service is healthy but disabled
        
        # Check if we have either NeMo Guardrails or fallback validation
        has_nemo = self.rails is not None and NEMO_AVAILABLE
        has_fallback = self.actions is not None
        
        return has_nemo or has_fallback

