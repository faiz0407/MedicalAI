"""
Async SQLAlchemy engine + session factory.
Sync session also exposed for Alembic migrations.
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy import create_engine, text
from app.core.config import settings


class Base(DeclarativeBase):
    pass


# ─── Async engine (FastAPI) ───────────────────────────────────────────────────
async_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ─── Sync engine (Alembic / tools that run in thread executors) ──────────────
sync_engine = create_engine(settings.DATABASE_SYNC_URL, echo=False)

SyncSessionLocal = sessionmaker(bind=sync_engine, autoflush=False, autocommit=False)


async def get_db() -> AsyncSession:
    """FastAPI dependency: yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables and seed admin user (called at startup)."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add columns introduced after initial create_all (idempotent on PostgreSQL)
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization VARCHAR(200)"
        ))

    # Seed admin user after tables exist
    # Pre-computed bcrypt hash of "Admin@123" — avoids passlib/bcrypt version issues at startup
    _ADMIN_HASH = "$2b$12$hgEgUmN.ZG3W5Q2DsvUI3.Ccpqu38aN5if5d5Wk0Z.TIuu7eT4CvW"
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM users WHERE username = 'admin' LIMIT 1")
        )
        if result.scalar_one_or_none() is None:
            await session.execute(
                text("""
                    INSERT INTO users (username, email, hashed_password, full_name, role, is_active, created_at)
                    VALUES ('admin', 'admin@healthcareai.com', :pw, 'System Administrator', 'admin', true, NOW())
                """),
                {"pw": _ADMIN_HASH}
            )
            await session.commit()
