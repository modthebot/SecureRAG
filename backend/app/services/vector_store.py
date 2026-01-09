"""Vector store adapter for Chroma/FAISS."""
import os
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# Try to import Chroma
try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
    HAS_CHROMA = True
except ImportError:
    HAS_CHROMA = False
    logger.warning("Chroma not available, install with: pip install chromadb")

# Try to import FAISS
try:
    import faiss
    import numpy as np
    HAS_FAISS = True
except ImportError:
    HAS_FAISS = False
    logger.warning("FAISS not available, install with: pip install faiss-cpu")


class VectorStore:
    """Vector store adapter supporting Chroma and FAISS."""
    
    def __init__(self):
        self.store_type = settings.vector_store.upper()
        self.db_path = Path(settings.chroma_db_path)
        self.db_path.mkdir(parents=True, exist_ok=True)
        
        if self.store_type == "CHROMA":
            if not HAS_CHROMA:
                raise ImportError("Chroma not installed. Install with: pip install chromadb")
            self._init_chroma()
        elif self.store_type == "FAISS":
            if not HAS_FAISS:
                raise ImportError("FAISS not installed. Install with: pip install faiss-cpu")
            self._init_faiss()
        else:
            raise ValueError(f"Unknown vector store type: {self.store_type}")
    
    def _init_chroma(self):
        """Initialize Chroma client."""
        try:
            self.client = chromadb.PersistentClient(
                path=str(self.db_path),
                settings=ChromaSettings(anonymized_telemetry=False)
            )
            self.collection = self.client.get_or_create_collection(
                name="documents",
                metadata={"hnsw:space": "cosine"}
            )
            logger.info("Chroma vector store initialized")
            # Note: You may see ERROR logs from `chromadb.telemetry.product.posthog`.
            # These come from Chroma's optional telemetry and are non-fatal; the
            # vector store remains fully functional even if those events fail.
        except Exception as e:
            logger.error(f"Failed to initialize Chroma: {e}")
            raise
    
    def _init_faiss(self):
        """Initialize FAISS index."""
        try:
            self.index_path = self.db_path / "faiss.index"
            self.metadata_path = self.db_path / "metadata.json"
            
            # Load or create index
            if self.index_path.exists():
                self.index = faiss.read_index(str(self.index_path))
                import json
                with open(self.metadata_path, 'r') as f:
                    self.metadata_store = json.load(f)
            else:
                # Create new index (dimension will be set on first add)
                self.index = None
                self.metadata_store = {}
            
            logger.info("FAISS vector store initialized")
        except Exception as e:
            logger.error(f"Failed to initialize FAISS: {e}")
            raise
    
    def add_chunks(
        self,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]]
    ):
        """Add chunks with embeddings to vector store."""
        if self.store_type == "CHROMA":
            self._add_chroma(chunks, embeddings)
        elif self.store_type == "FAISS":
            self._add_faiss(chunks, embeddings)
    
    def _add_chroma(self, chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
        """Add to Chroma."""
        ids = [chunk['chunk_id'] for chunk in chunks]
        texts = [chunk['text'] for chunk in chunks]
        metadatas = [
            {
                'doc_id': chunk['doc_id'],
                'page': chunk['page'],
                'chunk_index': chunk['chunk_index'],
                'filename': chunk.get('filename', ''),
            }
            for chunk in chunks
        ]
        
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas
        )
    
    def _add_faiss(self, chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
        """Add to FAISS."""
        import json
        import numpy as np
        
        embeddings_array = np.array(embeddings, dtype='float32')
        dimension = embeddings_array.shape[1]
        
        # Initialize index if needed
        if self.index is None:
            self.index = faiss.IndexFlatL2(dimension)
        
        # Add embeddings
        self.index.add(embeddings_array)
        
        # Store metadata
        start_id = len(self.metadata_store)
        for i, chunk in enumerate(chunks):
            chunk_id = chunk['chunk_id']
            self.metadata_store[str(start_id + i)] = {
                'chunk_id': chunk_id,
                'doc_id': chunk['doc_id'],
                'page': chunk['page'],
                'chunk_index': chunk['chunk_index'],
                'text': chunk['text'],
                'filename': chunk.get('filename', ''),
            }
        
        # Save index and metadata
        faiss.write_index(self.index, str(self.index_path))
        with open(self.metadata_path, 'w') as f:
            json.dump(self.metadata_store, f)
    
    def search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        doc_ids: Optional[List[str]] = None,
        filter_dict: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar chunks."""
        if self.store_type == "CHROMA":
            return self._search_chroma(query_embedding, top_k, doc_ids, filter_dict)
        elif self.store_type == "FAISS":
            return self._search_faiss(query_embedding, top_k, doc_ids, filter_dict)
    
    def _search_chroma(
        self,
        query_embedding: List[float],
        top_k: int,
        doc_ids: Optional[List[str]],
        filter_dict: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Search in Chroma."""
        where = {}
        if doc_ids:
            where['doc_id'] = {"$in": doc_ids}
        if filter_dict:
            where.update(filter_dict)
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where if where else None
        )
        
        # Format results
        formatted_results = []
        if results['ids'] and len(results['ids'][0]) > 0:
            for i in range(len(results['ids'][0])):
                formatted_results.append({
                    'chunk_id': results['ids'][0][i],
                    'doc_id': results['metadatas'][0][i].get('doc_id', ''),
                    'filename': results['metadatas'][0][i].get('filename', ''),
                    'page': results['metadatas'][0][i].get('page', 0),
                    'chunk_index': results['metadatas'][0][i].get('chunk_index', 0),
                    'text': results['documents'][0][i],
                    'score': 1.0 - results['distances'][0][i] if 'distances' in results else 0.0,
                    'distance': results['distances'][0][i] if 'distances' in results else 0.0
                })
        
        return formatted_results
    
    def _search_faiss(
        self,
        query_embedding: List[float],
        top_k: int,
        doc_ids: Optional[List[str]],
        filter_dict: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Search in FAISS."""
        import numpy as np
        
        query_array = np.array([query_embedding], dtype='float32')
        distances, indices = self.index.search(query_array, top_k * 2)  # Get more to filter
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0 or str(idx) not in self.metadata_store:
                continue
            
            metadata = self.metadata_store[str(idx)]
            
            # Filter by doc_ids if provided
            if doc_ids and metadata['doc_id'] not in doc_ids:
                continue
            
            # Convert distance to similarity score (L2 distance -> similarity)
            score = 1.0 / (1.0 + dist)
            
            results.append({
                'chunk_id': metadata['chunk_id'],
                'doc_id': metadata['doc_id'],
                'filename': metadata.get('filename', ''),
                'page': metadata.get('page', 0),
                'chunk_index': metadata.get('chunk_index', 0),
                'text': metadata.get('text', ''),
                'score': score,
                'distance': float(dist)
            })
            
            if len(results) >= top_k:
                break
        
        return results
    
    def get_all_document_ids(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all unique document IDs and their metadata from the vector store.
        
        Returns:
            Dictionary mapping doc_id to metadata (filename, chunk_count, max_page)
        """
        doc_info = {}
        
        if self.store_type == "CHROMA":
            # Get all documents from Chroma
            try:
                # Get all items (with a large limit)
                results = self.collection.get(limit=100000)  # Large limit to get all
                
                # Chroma's get() returns: {'ids': [...], 'metadatas': [...], 'documents': [...]}
                ids = results.get('ids', [])
                metadatas = results.get('metadatas', [])
                
                if ids and len(ids) > 0:
                    for i in range(len(ids)):
                        metadata = metadatas[i] if i < len(metadatas) else {}
                        if metadata and 'doc_id' in metadata:
                            doc_id_val = metadata['doc_id']
                            filename = metadata.get('filename', '')
                            page = metadata.get('page', 0)
                            
                            if doc_id_val not in doc_info:
                                doc_info[doc_id_val] = {
                                    'filename': filename,
                                    'chunk_count': 0,
                                    'max_page': 0
                                }
                            
                            doc_info[doc_id_val]['chunk_count'] += 1
                            doc_info[doc_id_val]['max_page'] = max(
                                doc_info[doc_id_val]['max_page'], 
                                page if isinstance(page, int) else 0
                            )
            except Exception as e:
                logger.error(f"Error getting document IDs from Chroma: {e}", exc_info=True)
                
        elif self.store_type == "FAISS":
            # Get all documents from FAISS metadata
            try:
                for key, metadata in self.metadata_store.items():
                    doc_id = metadata.get('doc_id')
                    if not doc_id:
                        continue
                    
                    filename = metadata.get('filename', '')
                    page = metadata.get('page', 0)
                    
                    if doc_id not in doc_info:
                        doc_info[doc_id] = {
                            'filename': filename,
                            'chunk_count': 0,
                            'max_page': 0
                        }
                    
                    doc_info[doc_id]['chunk_count'] += 1
                    doc_info[doc_id]['max_page'] = max(
                        doc_info[doc_id]['max_page'],
                        page if isinstance(page, int) else 0
                    )
            except Exception as e:
                logger.error(f"Error getting document IDs from FAISS: {e}")
        
        return doc_info
    
    def delete_document(self, doc_id: str):
        """Delete all chunks for a document."""
        if self.store_type == "CHROMA":
            # Chroma doesn't have a direct delete by metadata, so we need to query first
            results = self.collection.get(where={"doc_id": doc_id})
            if results['ids']:
                self.collection.delete(ids=results['ids'])
        elif self.store_type == "FAISS":
            # For FAISS, we mark as deleted in metadata
            import json
            to_remove = []
            for key, metadata in self.metadata_store.items():
                if metadata.get('doc_id') == doc_id:
                    to_remove.append(key)
            
            for key in to_remove:
                del self.metadata_store[key]
            
            with open(self.metadata_path, 'w') as f:
                json.dump(self.metadata_store, f)

