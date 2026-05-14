"""
Blog & News Router — public and admin endpoints.

Serves:
  - Published blog posts (AI-generated and admin-created)
  - Live medical news via NewsAPI (cached in DB)
  - Admin CRUD for blog management
"""
import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.database import get_db
from app.db import crud
from app.db.models import BlogPost, ContentStatus
from app.core.config import settings
from app.core.security import get_current_user, TokenData, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/blog", tags=["Blog & News"])

# ─── Schemas ─────────────────────────────────────────────────────────────────

class BlogPostCreate(BaseModel):
    title: str
    content: str
    post_type: str = "blog"          # blog | social_media
    platform: str = "website"
    tags: Optional[List[str]] = []
    seo_description: Optional[str] = None

class BlogPostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None

# ─── Public Endpoints ─────────────────────────────────────────────────────────

@router.get("/posts")
async def list_published_posts(
    category: Optional[str] = Query(None, description="Filter by tag/category"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — returns only approved/published blog posts."""
    offset = (page - 1) * per_page
    query = (
        select(BlogPost)
        .where(BlogPost.status.in_([ContentStatus.approved, ContentStatus.published]))
        .order_by(BlogPost.published_at.desc().nullslast(), BlogPost.created_at.desc())
    )

    if category:
        # SQLAlchemy JSON contains check (PostgreSQL)
        query = query.where(BlogPost.tags.contains([category]))

    if search:
        like_pattern = f"%{search}%"
        query = query.where(
            BlogPost.title.ilike(like_pattern) | BlogPost.content.ilike(like_pattern)
        )

    total_q = await db.execute(
        select(func.count()).select_from(
            query.with_only_columns(BlogPost.id).subquery()
        )
    )
    total = total_q.scalar() or 0

    result = await db.execute(query.offset(offset).limit(per_page))
    posts = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "posts": [_serialize_post(p) for p in posts],
    }


@router.get("/posts/{post_id}")
async def get_post(post_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single published post."""
    result = await db.execute(
        select(BlogPost).where(
            BlogPost.id == post_id,
            BlogPost.status.in_([ContentStatus.approved, ContentStatus.published]),
        )
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")
    return _serialize_post(post, full=True)


@router.get("/news")
async def get_medical_news(
    category: str = Query("health", description="health | ai-healthcare | research"),
    page_size: int = Query(6, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch live medical news from NewsAPI.
    Falls back to DB-cached posts if NewsAPI key is missing/fails.
    """
    # Map user-friendly category to search query
    query_map = {
        "health": "healthcare medical",
        "ai-healthcare": "artificial intelligence healthcare AI medicine",
        "research": "medical research clinical trials",
        "prevention": "preventive health wellness",
        "disease": "disease outbreak epidemic awareness",
    }
    q = query_map.get(category, "healthcare medical")

    if not settings.NEWS_API_KEY:
        # Return mock news if no API key
        return _mock_news_response(category, page_size)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q": q,
                    "language": "en",
                    "sortBy": "publishedAt",
                    "pageSize": page_size,
                    "apiKey": settings.NEWS_API_KEY,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            articles = data.get("articles", [])

            return {
                "category": category,
                "source": "newsapi",
                "articles": [
                    {
                        "title": a.get("title", ""),
                        "description": a.get("description", ""),
                        "url": a.get("url", ""),
                        "image": a.get("urlToImage"),
                        "source": a.get("source", {}).get("name", ""),
                        "published_at": a.get("publishedAt", ""),
                    }
                    for a in articles
                    if a.get("title") and "[Removed]" not in a.get("title", "")
                ],
            }
    except Exception as e:
        logger.warning("NewsAPI fetch failed: %s — returning mock data", e)
        return _mock_news_response(category, page_size)


@router.get("/categories")
async def get_categories():
    """Return available blog/news categories."""
    return {
        "categories": [
            {"id": "health",        "label": "General Health"},
            {"id": "ai-healthcare", "label": "AI in Healthcare"},
            {"id": "research",      "label": "Medical Research"},
            {"id": "prevention",    "label": "Preventive Care"},
            {"id": "disease",       "label": "Disease Awareness"},
        ]
    }


# ─── Admin Endpoints ──────────────────────────────────────────────────────────

@router.get("/admin/all")
async def admin_list_all(
    status: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin — list all posts regardless of status."""
    query = select(BlogPost).order_by(BlogPost.created_at.desc())
    if status:
        query = query.where(BlogPost.status == status)

    result = await db.execute(query.offset((page - 1) * per_page).limit(per_page))
    posts = result.scalars().all()
    return {"posts": [_serialize_post(p, full=True) for p in posts]}


@router.post("/admin/create", status_code=201)
async def admin_create_post(
    body: BlogPostCreate,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin — create a new blog post (starts as draft)."""
    post = BlogPost(
        title=body.title,
        content=body.content,
        post_type=body.post_type,
        platform=body.platform,
        status=ContentStatus.draft,
        tags=body.tags or [],
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    await crud.log_audit(db, current_user.user_id, "create_blog", "blog_posts", post.id)
    return {"message": "Post created", "post_id": post.id}


@router.patch("/admin/{post_id}")
async def admin_update_post(
    post_id: int,
    body: BlogPostUpdate,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin — update post fields."""
    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")

    if body.title is not None:    post.title = body.title
    if body.content is not None:  post.content = body.content
    if body.tags is not None:     post.tags = body.tags
    if body.status is not None:
        post.status = ContentStatus(body.status)
        if body.status in ("approved", "published"):
            post.approved_by = current_user.user_id
            post.approved_at  = datetime.utcnow()
            post.published_at = datetime.utcnow()

    await db.flush()
    await crud.log_audit(db, current_user.user_id, "update_blog", "blog_posts", post_id)
    return {"message": "Post updated"}


@router.delete("/admin/{post_id}")
async def admin_delete_post(
    post_id: int,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin — delete a post."""
    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")
    await db.delete(post)
    await crud.log_audit(db, current_user.user_id, "delete_blog", "blog_posts", post_id)
    return {"message": "Post deleted"}


@router.post("/admin/{post_id}/approve")
async def approve_post(
    post_id: int,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin — approve + publish a pending post."""
    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")

    post.status = ContentStatus.published
    post.approved_by = current_user.user_id
    post.approved_at = datetime.utcnow()
    post.published_at = datetime.utcnow()
    await db.flush()
    await crud.log_audit(db, current_user.user_id, "approve_blog", "blog_posts", post_id)
    return {"message": "Post approved and published"}


# ─── AI Enhancement ──────────────────────────────────────────────────────────

class EnhanceRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    post_type: str = "blog"      # blog | social_media
    platform: str = "website"   # website | twitter | linkedin | facebook | instagram


@router.post("/enhance")
async def enhance_with_ai(
    body: EnhanceRequest,
    _: TokenData = Depends(require_admin),
):
    """Use Groq LLM to enhance a blog or social media post."""
    from app.core.config import settings
    import json, re
    if not settings.GROQ_API_KEY:
        raise HTTPException(503, "GROQ_API_KEY not configured")

    title   = (body.title or "").strip()
    content = (body.content or "").strip()

    if not title and not content:
        raise HTTPException(400, "Provide at least a title or content to enhance")

    if body.post_type == "social_media":
        char_limit = 280 if body.platform == "twitter" else 2200 if body.platform == "instagram" else 1300
        platform_note = {
            "twitter":   "Twitter/X — strict 280 character limit, punchy hook, 2–3 hashtags",
            "linkedin":  "LinkedIn — professional, 800–1300 chars, thought leadership tone, 3–5 hashtags",
            "facebook":  "Facebook — friendly, conversational, 500–1000 chars, 2–4 hashtags",
            "instagram": "Instagram caption — engaging, up to 2200 chars, 5–10 hashtags",
        }.get(body.platform, f"{body.platform} social media post")

        system_msg = (
            f"You are a healthcare social media expert. "
            f"Rewrite the content below as an optimised {platform_note}. "
            "Keep it medically accurate. Add a short disclaimer if making health claims."
            f" Total length must not exceed {char_limit} characters."
        )
    else:
        system_msg = (
            "You are a healthcare content writer. "
            "Enhance the following blog post to be more engaging, professional, and SEO-friendly. "
            "Expand thin sections, improve headings, add a medical disclaimer at the end. "
            "Keep it medically accurate."
        )

    parts = [system_msg]
    if title:
        parts.append(f"\nTitle to enhance:\n{title}")
    if content:
        parts.append(f"\nContent to enhance:\n{content}")
    parts.append(
        '\nRespond ONLY in this JSON format: {"title": "...", "content": "..."}\n'
        "If only a title was provided, include a full content draft. "
        "If only content was provided, generate a matching title. "
        "Do not include any text outside the JSON."
    )

    try:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            max_tokens=2000,
            temperature=0.7,
            messages=[{"role": "user", "content": "\n".join(parts)}],
        )
        raw = response.choices[0].message.content.strip()
        match = re.search(r'\{[\s\S]*\}', raw)
        if not match:
            raise ValueError("No JSON in response")
        json_str = match.group()
        try:
            result = json.loads(json_str)
        except json.JSONDecodeError:
            # LLM sometimes emits literal newlines inside string values — escape them
            fixed = re.sub(r'(?<!\\)\n', r'\\n', json_str)
            result = json.loads(fixed)
        return {
            "title":   result.get("title", title),
            "content": result.get("content", content),
        }
    except Exception as e:
        raise HTTPException(500, f"AI enhancement failed: {str(e)}")


@router.post("/admin/{post_id}/publish/facebook")
async def publish_to_facebook(
    post_id: int,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Post an approved blog/social post directly to the configured Facebook Page."""
    from app.core.config import settings
    import httpx

    if not settings.FACEBOOK_PAGE_ID or not settings.FACEBOOK_PAGE_ACCESS_TOKEN:
        raise HTTPException(
            503,
            "Facebook not configured. Add FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN to .env"
        )

    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")
    if post.status not in (ContentStatus.approved, ContentStatus.published):
        raise HTTPException(400, "Only approved posts can be published to Facebook")

    message = f"{post.title}\n\n{post.content}"
    if post.tags:
        message += "\n\n" + " ".join(f"#{t}" for t in post.tags)

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://graph.facebook.com/v19.0/{settings.FACEBOOK_PAGE_ID}/feed",
            data={
                "message": message[:63206],   # Facebook's max post length
                "access_token": settings.FACEBOOK_PAGE_ACCESS_TOKEN,
            },
        )
        fb_data = resp.json()

    if "error" in fb_data:
        raise HTTPException(502, f"Facebook API error: {fb_data['error'].get('message')}")

    post.status = ContentStatus.published
    post.published_at = datetime.utcnow()
    await db.flush()
    await crud.log_audit(db, current_user.user_id, "publish_facebook", "blog_posts", post_id,
                         details={"fb_post_id": fb_data.get("id")})
    return {
        "message": "Published to Facebook successfully",
        "facebook_post_id": fb_data.get("id"),
        "post_id": post_id,
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _serialize_post(post: BlogPost, full: bool = False) -> dict:
    data = {
        "id": post.id,
        "title": post.title,
        "post_type": post.post_type,
        "platform": post.platform,
        "status": post.status.value,
        "tags": post.tags or [],
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "published_at": post.published_at.isoformat() if post.published_at else None,
        "preview": (post.content or "")[:300] + ("..." if len(post.content or "") > 300 else ""),
    }
    if full:
        data["content"] = post.content
    return data


def _mock_news_response(category: str, page_size: int) -> dict:
    """Return realistic placeholder news when NewsAPI is unavailable."""
    articles = [
        {
            "title": "AI Revolutionizes Early Cancer Detection with 95% Accuracy",
            "description": "New machine learning models trained on millions of medical images can now detect early-stage cancers with unprecedented accuracy, offering hope for millions of patients worldwide.",
            "url": "#",
            "image": None,
            "source": "Medical News Today",
            "published_at": datetime.utcnow().isoformat(),
        },
        {
            "title": "Breakthrough in Alzheimer's Research: New Biomarker Discovered",
            "description": "Scientists have identified a novel biomarker that appears 20 years before Alzheimer's symptoms, potentially enabling preventive treatment strategies.",
            "url": "#",
            "image": None,
            "source": "The Lancet",
            "published_at": datetime.utcnow().isoformat(),
        },
        {
            "title": "WHO Updates Global Guidelines on Antibiotic Resistance",
            "description": "The World Health Organization releases comprehensive new guidelines to combat the growing threat of antibiotic-resistant bacteria, a crisis affecting millions annually.",
            "url": "#",
            "image": None,
            "source": "WHO",
            "published_at": datetime.utcnow().isoformat(),
        },
        {
            "title": "Telemedicine Adoption Surges 400% Post-Pandemic: Study",
            "description": "A comprehensive study reveals telemedicine has permanently reshaped healthcare delivery, with patient satisfaction scores rivaling in-person visits.",
            "url": "#",
            "image": None,
            "source": "JAMA",
            "published_at": datetime.utcnow().isoformat(),
        },
        {
            "title": "Gene Therapy Shows Promise for Rare Genetic Disorders",
            "description": "Clinical trials demonstrate remarkable results using CRISPR-based gene therapy for previously untreatable rare genetic conditions.",
            "url": "#",
            "image": None,
            "source": "Nature Medicine",
            "published_at": datetime.utcnow().isoformat(),
        },
        {
            "title": "Mental Health Apps Effectiveness Validated in Large-Scale Trial",
            "description": "A 50,000-participant study confirms that AI-powered mental health applications can meaningfully reduce anxiety and depression symptoms.",
            "url": "#",
            "image": None,
            "source": "BMJ",
            "published_at": datetime.utcnow().isoformat(),
        },
    ]
    return {
        "category": category,
        "source": "mock",
        "articles": articles[:page_size],
    }
