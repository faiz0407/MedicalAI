"""
Pinecone vector store for medical knowledge RAG.

Connects to the 'medical-rag' index which holds 483k PubMed / research-article
chunks embedded with BioBERT (768-dim, cosine metric).

Namespaces:
  rag_docs     — medical research article chunks (read-only for this app)
  chat_context — per-session conversation history (written by memory module)

Pipeline:
  1. Embed query with BioBERT  (dmis-lab/biobert-base-cased-v1.2)
  2. Retrieve top-20 chunks from Pinecone (rag_docs namespace)
  3. Rerank with cross-encoder (cross-encoder/ms-marco-MiniLM-L-6-v2)
  4. Return top-5 chunks with text + DOI + PMCID metadata
"""
from __future__ import annotations

from typing import List, Dict, Optional
import logging
import math
import threading

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Lazy Pinecone import ──────────────────────────────────────────────────────
try:
    from pinecone import Pinecone, ServerlessSpec
    PINECONE_AVAILABLE = True
except ImportError:
    PINECONE_AVAILABLE = False
    logger.warning("pinecone-client not installed; vector search disabled.")


# ── BioBERT singleton loader ──────────────────────────────────────────────────
class _BioBERTEmbedder:
    """Thread-safe lazy loader for the BioBERT sentence-transformer model."""

    _model = None
    _lock  = threading.Lock()

    @classmethod
    def _load(cls) -> None:
        if cls._model is not None:
            return
        with cls._lock:
            if cls._model is not None:
                return
            try:
                from sentence_transformers import SentenceTransformer
                logger.info(
                    "Loading BioBERT embedding model: %s (device=%s) …",
                    settings.BIOBERT_MODEL, settings.BIOBERT_DEVICE,
                )
                cls._model = SentenceTransformer(
                    settings.BIOBERT_MODEL,
                    device=settings.BIOBERT_DEVICE,
                )
                logger.info(
                    "BioBERT ready — embedding dim: %d",
                    cls._model.get_sentence_embedding_dimension(),
                )
            except Exception as exc:
                logger.error("BioBERT load failed: %s", exc)
                cls._model = None

    @classmethod
    def encode(cls, texts: List[str]) -> List[List[float]]:
        cls._load()
        if cls._model is None:
            logger.warning("BioBERT unavailable — returning zero vectors.")
            return [[0.0] * settings.PINECONE_DIMENSION for _ in texts]
        vectors = cls._model.encode(
            texts,
            batch_size=settings.BIOBERT_BATCH_SIZE,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vectors.tolist()

    @classmethod
    def encode_one(cls, text: str) -> List[float]:
        return cls.encode([text])[0]


# ── Cross-encoder reranker ────────────────────────────────────────────────────
class _CrossEncoderReranker:
    """
    Lazy-loaded cross-encoder for re-ranking BioBERT retrieval results.
    Model: cross-encoder/ms-marco-MiniLM-L-6-v2
    """

    MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    _model = None
    _lock  = threading.Lock()

    @classmethod
    def _load(cls) -> None:
        if cls._model is not None:
            return
        with cls._lock:
            if cls._model is not None:
                return
            try:
                from sentence_transformers import CrossEncoder
                logger.info("Loading CrossEncoder reranker: %s …", cls.MODEL_NAME)
                cls._model = CrossEncoder(cls.MODEL_NAME)
                logger.info("CrossEncoder reranker ready.")
            except Exception as exc:
                logger.error("CrossEncoder load failed: %s", exc)
                cls._model = None

    @classmethod
    def rerank(cls, query: str, chunks: List[Dict], top_k: int = 5) -> List[Dict]:
        """
        Rerank chunks using the cross-encoder.
        Raw logit scores are converted via sigmoid to [0, 1] probabilities.
        Returns the top_k chunks sorted by cross_score — no hard threshold,
        so the LLM always has research context and can judge relevance itself.
        """
        cls._load()
        if cls._model is None or not chunks:
            return chunks[:top_k]

        pairs = [(query, c["text"]) for c in chunks]
        raw_scores = cls._model.predict(pairs)

        for chunk, raw in zip(chunks, raw_scores):
            chunk["cross_score"] = round(1.0 / (1.0 + math.exp(-float(raw))), 4)

        chunks.sort(key=lambda x: x.get("cross_score", 0.0), reverse=True)
        logger.info(
            "CrossEncoder: returning top %d of %d chunks (top score=%.3f)",
            min(top_k, len(chunks)), len(chunks),
            chunks[0].get("cross_score", 0) if chunks else 0,
        )
        return chunks[:top_k]


# ─────────────────────────────────────────────────────────────────────────────
class MedicalVectorStore:
    """
    Singleton Pinecone index (medical-rag) backed by BioBERT embeddings
    and cross-encoder reranking.
    """

    _instance: Optional["MedicalVectorStore"] = None
    _index = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    # ── Index management ─────────────────────────────────────────────────────

    def initialize(self) -> None:
        """Connect to the existing Pinecone index (does NOT create or seed)."""
        if not PINECONE_AVAILABLE or not settings.PINECONE_API_KEY:
            logger.warning("Pinecone not configured — RAG will use mock results.")
            return

        pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        existing = pc.list_indexes().names()

        if settings.PINECONE_INDEX_NAME not in existing:
            logger.error(
                "Pinecone index '%s' not found. Available: %s",
                settings.PINECONE_INDEX_NAME, existing,
            )
            return

        # Verify dimension
        info = pc.describe_index(settings.PINECONE_INDEX_NAME)
        if info.dimension != settings.PINECONE_DIMENSION:
            raise RuntimeError(
                f"Pinecone index '{settings.PINECONE_INDEX_NAME}' has "
                f"dimension={info.dimension} but BioBERT requires "
                f"dimension={settings.PINECONE_DIMENSION}."
            )

        self._index = pc.Index(settings.PINECONE_INDEX_NAME)
        stats = self._index.describe_index_stats()
        rag_count = stats.namespaces.get("rag_docs", {})
        logger.info(
            "Pinecone index ready: %s | rag_docs vectors: %s",
            settings.PINECONE_INDEX_NAME, rag_count,
        )

    # ── Primary RAG query (BioBERT + cross-encoder rerank) ───────────────────

    def query_with_rerank(
        self,
        query_text: str,
        top_k_retrieve: int = 20,
        top_k_rerank: int = 5,
    ) -> List[Dict]:
        """
        Full RAG pipeline:
          1. Embed query with BioBERT
          2. Retrieve top_k_retrieve chunks from rag_docs namespace
          3. Rerank with cross-encoder
          4. Return top_k_rerank chunks

        Each returned dict has:
          text, score (cosine), cross_score, doi, pmc_id, source
        """
        if self._index is None:
            return self._mock_results(query_text)

        vector = _BioBERTEmbedder.encode_one(query_text)
        result = self._index.query(
            vector=vector,
            top_k=top_k_retrieve,
            include_metadata=True,
            namespace="rag_docs",
        )

        chunks = [
            {
                "score":   match.score,
                "text":    match.metadata.get("text", ""),
                "doi":     match.metadata.get("doi", ""),
                "pmc_id":  match.metadata.get("pmc_id", ""),
                "source":  "PubMed/biobert-medical-kb",
            }
            for match in result.matches
            if match.metadata.get("text", "").strip()
        ]

        if not chunks:
            return self._mock_results(query_text)

        # Cross-encoder reranking
        return _CrossEncoderReranker.rerank(query_text, chunks, top_k=top_k_rerank)

    def query(self, symptoms_text: str, top_k: int = 5) -> List[Dict]:
        """
        Convenience wrapper — calls query_with_rerank and returns top_k.
        """
        return self.query_with_rerank(symptoms_text, top_k_retrieve=20, top_k_rerank=top_k)

    # ── Chat-context helpers (for rolling memory module) ─────────────────────

    def store_chat_turn(
        self,
        session_id: str,
        query: str,
        answer: str,
    ) -> None:
        """Store a query/answer pair in the chat_context namespace."""
        if self._index is None:
            return
        import uuid
        from datetime import datetime

        text      = f"[User]: {query}\n[Assistant]: {answer}"
        vector    = _BioBERTEmbedder.encode_one(text)
        timestamp = datetime.utcnow().isoformat()

        self._index.upsert(
            vectors=[{
                "id":     str(uuid.uuid4()),
                "values": vector,
                "metadata": {
                    "session_id": session_id,
                    "query":      query,
                    "answer":     answer,
                    "text":       text,
                    "token_count": len(text.split()),
                    "timestamp":  timestamp,
                    "source":     "chat_history",
                },
            }],
            namespace="chat_context",
        )

    def retrieve_chat_history(
        self,
        session_id: str,
        latest_query: str,
        recent_k: int = 5,
    ) -> str:
        """Retrieve the last recent_k chat turns for this session."""
        if self._index is None:
            return ""

        vector = _BioBERTEmbedder.encode_one(f"User: {latest_query}")
        result = self._index.query(
            vector=vector,
            namespace="chat_context",
            top_k=50,
            filter={
                "session_id": {"$eq": session_id},
                "source":     {"$eq": "chat_history"},
            },
            include_metadata=True,
        )
        matches = sorted(
            result.matches,
            key=lambda x: x.metadata.get("timestamp", ""),
        )
        last_k = matches[-recent_k:]
        return "\n".join(m.metadata.get("text", "") for m in last_k)

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _mock_results(self, symptoms_text: str) -> List[Dict]:
        """Fallback results when Pinecone / BioBERT is unavailable."""
        return [
            {
                "score":      0.90,
                "cross_score": 0.0,
                "text": (
                    f"General care for '{symptoms_text}': rest, adequate hydration, "
                    "and symptom monitoring. Consult a healthcare professional if "
                    "symptoms worsen or persist beyond 48 hours."
                ),
                "doi":    "",
                "pmc_id": "",
                "source": "mock-fallback",
            }
        ]

    # ── Legacy seeding (no-op — index already has 483k vectors) ─────────────

    def seed_medical_knowledge(self) -> None:
        """No-op: the medical-rag index is pre-populated with 483k PubMed vectors."""
        logger.info(
            "seed_medical_knowledge() skipped — "
            "'medical-rag' index already populated (483k vectors)."
        )

    def upsert_knowledge(self, doc_id: str, text: str, metadata: Dict) -> None:
        if self._index is None:
            return
        vector = _BioBERTEmbedder.encode_one(text)
        self._index.upsert(vectors=[{
            "id":     doc_id,
            "values": vector,
            "metadata": {"text": text, **metadata},
        }], namespace="rag_docs")

    def upsert_batch(self, documents: List[Dict]) -> None:
        if self._index is None or not documents:
            return
        texts   = [d["text"] for d in documents]
        vectors = _BioBERTEmbedder.encode(texts)
        records = [
            {
                "id":     doc["id"],
                "values": vec,
                "metadata": {"text": doc["text"], **doc.get("metadata", {})},
            }
            for doc, vec in zip(documents, vectors)
        ]
        for i in range(0, len(records), 100):
            self._index.upsert(vectors=records[i:i + 100], namespace="rag_docs")
        logger.info("Upserted %d BioBERT-embedded documents.", len(records))


# Module-level singleton
medical_vector_store = MedicalVectorStore()
