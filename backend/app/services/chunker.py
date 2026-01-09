"""Text chunking with token-aware splitting."""
import logging
from typing import List, Dict, Any
import re

try:
    import tiktoken
    HAS_TIKTOKEN = True
except ImportError:
    HAS_TIKTOKEN = False
    logging.warning("tiktoken not available, using simple tokenizer")

from app.config import settings

logger = logging.getLogger(__name__)


class TextChunker:
    """Token-aware text chunker."""
    
    def __init__(self):
        self.max_tokens = settings.max_chunk_tokens
        self.overlap_tokens = settings.chunk_overlap_tokens
        
        if HAS_TIKTOKEN:
            try:
                # Use cl100k_base (GPT-3.5/GPT-4 tokenizer)
                self.encoder = tiktoken.get_encoding("cl100k_base")
            except Exception as e:
                logger.warning(f"Failed to load tiktoken: {e}, using simple tokenizer")
                self.encoder = None
        else:
            self.encoder = None
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        if self.encoder:
            return len(self.encoder.encode(text))
        else:
            # Simple approximation: ~4 characters per token
            return len(text) // 4
    
    def chunk_text(
        self,
        text: str,
        doc_id: str,
        page: int = 1,
        metadata: Dict[str, Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Chunk text into overlapping segments.
        
        Returns:
            List of chunk dictionaries with text, metadata, and chunk_id
        """
        chunks = []
        
        # Split by paragraphs first
        paragraphs = self._split_paragraphs(text)
        
        current_chunk = []
        current_tokens = 0
        chunk_index = 0
        char_start = 0
        
        for para in paragraphs:
            para_tokens = self.count_tokens(para)
            
            # If paragraph itself is too large, split it
            if para_tokens > self.max_tokens:
                # Save current chunk if any
                if current_chunk:
                    chunk_text = '\n\n'.join(current_chunk)
                    chunk_data = self._create_chunk(
                        chunk_text, doc_id, page, chunk_index,
                        char_start, char_start + len(chunk_text), metadata
                    )
                    chunks.append(chunk_data)
                    chunk_index += 1
                    char_start += len(chunk_text)
                    current_chunk = []
                    current_tokens = 0
                
                # Split large paragraph
                sub_chunks = self._split_large_text(para, doc_id, page, chunk_index, char_start, metadata)
                chunks.extend(sub_chunks)
                chunk_index += len(sub_chunks)
                if sub_chunks:
                    char_start = sub_chunks[-1]['char_end']
                continue
            
            # Check if adding this paragraph would exceed max_tokens
            if current_tokens + para_tokens > self.max_tokens and current_chunk:
                # Save current chunk
                chunk_text = '\n\n'.join(current_chunk)
                chunk_data = self._create_chunk(
                    chunk_text, doc_id, page, chunk_index,
                    char_start, char_start + len(chunk_text), metadata
                )
                chunks.append(chunk_data)
                chunk_index += 1
                char_start += len(chunk_text)
                
                # Start new chunk with overlap
                if self.overlap_tokens > 0 and chunks:
                    overlap_text = self._get_overlap_text(chunks[-1]['text'])
                    current_chunk = [overlap_text] if overlap_text else []
                    current_tokens = self.count_tokens(overlap_text)
                else:
                    current_chunk = []
                    current_tokens = 0
            
            current_chunk.append(para)
            current_tokens += para_tokens
        
        # Add final chunk
        if current_chunk:
            chunk_text = '\n\n'.join(current_chunk)
            chunk_data = self._create_chunk(
                chunk_text, doc_id, page, chunk_index,
                char_start, char_start + len(chunk_text), metadata
            )
            chunks.append(chunk_data)
        
        # Filter out very short chunks
        chunks = [c for c in chunks if len(c['text'].strip()) >= 50]
        
        return chunks
    
    def _split_paragraphs(self, text: str) -> List[str]:
        """Split text into paragraphs."""
        # Split by double newlines or single newline after sentence
        paragraphs = re.split(r'\n\s*\n', text)
        
        # Also split very long paragraphs
        result = []
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            # If paragraph is very long, try to split by sentences
            if len(para) > 2000:
                sentences = re.split(r'(?<=[.!?])\s+', para)
                current = []
                for sent in sentences:
                    if len(' '.join(current + [sent])) > 1500:
                        if current:
                            result.append(' '.join(current))
                        current = [sent]
                    else:
                        current.append(sent)
                if current:
                    result.append(' '.join(current))
            else:
                result.append(para)
        
        return result
    
    def _split_large_text(
        self,
        text: str,
        doc_id: str,
        page: int,
        start_chunk_index: int,
        char_start: int,
        metadata: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Split text that's too large for a single chunk."""
        chunks = []
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        current_chunk = []
        current_tokens = 0
        chunk_index = start_chunk_index
        current_char_start = char_start
        
        for sentence in sentences:
            sent_tokens = self.count_tokens(sentence)
            
            if current_tokens + sent_tokens > self.max_tokens and current_chunk:
                chunk_text = ' '.join(current_chunk)
                chunk_data = self._create_chunk(
                    chunk_text, doc_id, page, chunk_index,
                    current_char_start, current_char_start + len(chunk_text), metadata
                )
                chunks.append(chunk_data)
                chunk_index += 1
                current_char_start += len(chunk_text)
                
                # Overlap
                if self.overlap_tokens > 0 and chunks:
                    overlap_text = self._get_overlap_text(chunks[-1]['text'])
                    current_chunk = [overlap_text] if overlap_text else []
                    current_tokens = self.count_tokens(overlap_text)
                else:
                    current_chunk = []
                    current_tokens = 0
            
            current_chunk.append(sentence)
            current_tokens += sent_tokens
        
        if current_chunk:
            chunk_text = ' '.join(current_chunk)
            chunk_data = self._create_chunk(
                chunk_text, doc_id, page, chunk_index,
                current_char_start, current_char_start + len(chunk_text), metadata
            )
            chunks.append(chunk_data)
        
        return chunks
    
    def _get_overlap_text(self, text: str) -> str:
        """Get overlap text from the end of previous chunk."""
        tokens = text.split() if not self.encoder else self.encoder.encode(text)
        overlap_size = min(self.overlap_tokens, len(tokens))
        
        if overlap_size == 0:
            return ""
        
        if self.encoder:
            overlap_tokens = tokens[-overlap_size:]
            return self.encoder.decode(overlap_tokens)
        else:
            words = text.split()
            return ' '.join(words[-overlap_size:])
    
    def _create_chunk(
        self,
        text: str,
        doc_id: str,
        page: int,
        chunk_index: int,
        char_start: int,
        char_end: int,
        metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a chunk dictionary."""
        chunk_id = f"{doc_id}_p{page}_c{chunk_index}"
        
        return {
            'chunk_id': chunk_id,
            'doc_id': doc_id,
            'page': page,
            'chunk_index': chunk_index,
            'text': text,
            'char_start': char_start,
            'char_end': char_end,
            'metadata': metadata or {}
        }

