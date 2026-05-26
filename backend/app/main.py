"""
FastAPI application entry point.
Initialises DB, vector store, and mounts all routers.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.db.database import init_db
from app.db.dynamo_chat import dynamo_chat
from app.vector_store.pinecone_store import medical_vector_store
from app.routers import auth, chat, admin, analytics, appointments, blog, doctors

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _warm_ml_models() -> None:
    """Load BioBERT and cross-encoder into memory at startup (runs in a thread)."""
    try:
        from app.vector_store.pinecone_store import _BioBERTEmbedder, _CrossEncoderReranker
        _BioBERTEmbedder.encode(["warm-up query"])
        _CrossEncoderReranker._load()
        logger.info("BioBERT and cross-encoder pre-warmed")
    except Exception as exc:
        logger.warning("ML model warm-up failed (non-fatal): %s", exc)


# ─── Lifespan (startup / shutdown) ───────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting HealthcareAI backend...")
    # 1. Create DB tables
    await init_db()
    logger.info("Database initialised")
    # 2. Initialise DynamoDB chat storage
    await dynamo_chat.initialize()
    # 3. Connect to Pinecone 'medical-rag' index (483k PubMed vectors, pre-populated)
    medical_vector_store.initialize()
    logger.info("Medical knowledge base ready (medical-rag, 483k vectors)")
    # 4. BioBERT/cross-encoder warm-up skipped — using mock RAG fallback for now
    # 5. Pre-build all agent executors (singletons — avoids cold-build on first request)
    from app.agents.agent1_medical import _get_executor as _med_exec
    from app.agents.agent2_appointment import _get_executor as _appt_exec
    from app.agents.agent3_reputation import _get_executor as _rep_exec
    from app.agents.agent4_content import _get_executor as _cont_exec
    from app.agents.agent5_notification import _get_executor as _notif_exec
    _med_exec(); _appt_exec(); _rep_exec(); _cont_exec(); _notif_exec()
    logger.info("All agent executors pre-built")
    # 6. Initialise MasterAgent (lazy — just imports it)
    from app.agents.master_agent import master_agent
    logger.info("MasterAgent ready")
    yield
    logger.info("Shutting down HealthcareAI backend...")


# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="HealthcareAI — Unified Agentic System",
    version=settings.APP_VERSION,
    description=(
        "A unified AI chatbot with 5 specialised internal agents: "
        "Medical Guidance, Appointment, Reputation, Content Generation, "
        "and Drug Notifications."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://medical-ai-indol.vercel.app",  # replace if your Vercel URL differs
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Global error handler ─────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Please try again."},
    )


# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(admin.router)
app.include_router(analytics.router)
app.include_router(appointments.router)
app.include_router(blog.router)
app.include_router(doctors.router)


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "HealthcareAI Unified Agentic System",
        "docs": "/docs",
        "version": settings.APP_VERSION,
    }
