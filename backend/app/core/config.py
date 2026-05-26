"""
Central configuration management.
All env vars are loaded here and accessed system-wide.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    # ─── App ──────────────────────────────────────────────────────────
    APP_NAME: str = "HealthcareAI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production-use-256bit-random"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 h

    # ─── Database ─────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://healthuser:healthpass@localhost:5432/healthcareai"
    DATABASE_SYNC_URL: str = "postgresql://healthuser:healthpass@localhost:5432/healthcareai"

    # ─── Groq ─────────────────────────────────────────────────────────
    # Get from https://console.groq.com → API Keys
    # Used by ALL agents and the intent classifier.
    GROQ_API_KEY: str = ""
    # Full agents (medical, appointment, reputation, content, notification)
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    # Fast/cheap tasks: intent classification, rolling memory summaries
    GROQ_MODEL_FAST: str = "llama-3.1-8b-instant"

    # ─── BioBERT Embeddings (local — no API key required) ─────────────
    # dmis-lab/biobert-base-cased-v1.2 outputs 768-dim vectors.
    # Model is downloaded from HuggingFace Hub on first use (~440 MB).
    BIOBERT_MODEL: str = "dmis-lab/biobert-base-cased-v1.2"
    BIOBERT_DEVICE: str = "cpu"          # set to "cuda" if GPU is available
    BIOBERT_BATCH_SIZE: int = 32         # batch size for bulk upserts

    # ─── Pinecone ─────────────────────────────────────────────────────
    PINECONE_API_KEY: str = ""
    PINECONE_ENVIRONMENT: str = "us-east-1-aws"
    PINECONE_INDEX_NAME: str = "medical-rag"   # 483k PubMed research article vectors
    PINECONE_DIMENSION: int = 768              # BioBERT hidden size

    # ─── AWS DynamoDB ─────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"

    # ─── Email ────────────────────────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    ALERT_EMAIL: str = ""           # hospital owner email

    # ─── Razorpay ─────────────────────────────────────────────────────
    # Get from https://dashboard.razorpay.com → Settings → API Keys
    # Use rzp_test_* keys for development (no real charges)
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    # ─── News API ─────────────────────────────────────────────────────
    NEWS_API_KEY: str = ""           # https://newsapi.org — free tier works

    # ─── Google OAuth (optional) ──────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # ─── Google Places API ────────────────────────────────────────────
    # Enables real Google review syncing for the hospital.
    # Get from Google Cloud Console → APIs & Services → Credentials
    # Enable "Places API" in your Google Cloud project.
    GOOGLE_PLACES_API_KEY: str = ""
    # Hospital name used in Places text-search (change to your hospital)
    HOSPITAL_NAME: str = "Regional Hospital Una"

    # ─── Facebook Graph API ───────────────────────────────────────────
    # Enables direct publishing of social posts to a Facebook Page.
    # 1. Create a Facebook App at https://developers.facebook.com
    # 2. Add "Pages" product → generate a Page Access Token
    # 3. Your page ID is in the page's About section or via Graph Explorer
    FACEBOOK_PAGE_ID: str = ""
    FACEBOOK_PAGE_ACCESS_TOKEN: str = ""

    # ─── CORS ─────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: List[str] = ["*"]

    # ─── Memory ───────────────────────────────────────────────────────
    ROLLING_SUMMARY_DAYS: int = 5
    MAX_CONVERSATION_TOKENS: int = 4096

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
