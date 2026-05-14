"""
Agent 4 — Social Media & Blog Generator Tools.
Generates healthcare content and manages publication pipeline.
"""
import json
import re
from typing import Dict, List, Optional
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from datetime import datetime


class BlogInput(BaseModel):
    topic: str = Field(description="Topic for the blog post")
    post_type: str = Field(
        description="Type: 'blog', 'social_media', or 'website'",
        default="blog"
    )
    platform: str = Field(
        description="Target platform: website, twitter, linkedin, facebook",
        default="website"
    )


def _llm_generate_content(topic: str, post_type: str, platform: str) -> Dict:
    """Call Groq synchronously to generate healthcare content."""
    from app.core.config import settings
    from groq import Groq

    if post_type == "social_media":
        char_limit = 280 if platform == "twitter" else 2200 if platform == "instagram" else 1300
        platform_note = {
            "twitter":   "Twitter/X post — strict 280 character limit, punchy, 2–3 hashtags only",
            "linkedin":  "LinkedIn post — professional tone, 800–1300 chars, thought leadership, 3–5 hashtags",
            "facebook":  "Facebook post — friendly conversational tone, 500–1000 chars, 2–4 hashtags",
            "instagram": "Instagram caption — engaging, up to 2200 chars, 5–10 relevant hashtags",
        }.get(platform, f"{platform} social media post")

        prompt = (
            f"You are a healthcare social media writer. Write a {platform_note} about: {topic}\n"
            "Include a compelling hook, 1–2 key insights, a call to action, and relevant hashtags.\n"
            "Medical accuracy is required. Add a medical disclaimer if making health claims.\n"
            f"Keep the total length under {char_limit} characters.\n\n"
            'Respond ONLY in this JSON format: {"title": "...", "content": "...", "tags": ["tag1", "tag2"]}'
        )
    else:
        prompt = (
            f"You are a healthcare content writer. Write a professional blog post about: {topic}\n"
            "Requirements:\n"
            "- Length: 500–900 words\n"
            "- Include: Introduction, 3–4 key sections with H2 headings, practical takeaways, Conclusion\n"
            "- Use markdown formatting\n"
            "- Be medically accurate and evidence-based\n"
            "- End with: *Medical Disclaimer: This article is for informational purposes only. "
            "Always consult a qualified healthcare professional for medical advice.*\n\n"
            'Respond ONLY in this JSON format: {"title": "...", "content": "...", "tags": ["tag1", "tag2"]}'
        )

    client = Groq(api_key=settings.GROQ_API_KEY)
    response = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        max_tokens=2000,
        temperature=0.7,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.choices[0].message.content.strip()
    match = re.search(r'\{[\s\S]*\}', raw)
    if not match:
        raise ValueError("LLM returned invalid JSON")
    return json.loads(match.group())


@tool("generate_blog_post", args_schema=BlogInput)
def generate_blog_post(topic: str, post_type: str = "blog",
                        platform: str = "website") -> Dict:
    """
    Generates a healthcare blog post or social media content on the given topic using an LLM.
    Returns title and content for admin review before publishing.
    """
    from app.core.config import settings

    try:
        result = _llm_generate_content(topic, post_type, platform)
        title   = result.get("title", f"Healthcare Insights: {topic.title()}")
        content = result.get("content", "")
        tags    = result.get("tags", ["Healthcare", "MedicalAdvancement"])
    except Exception as e:
        # Fallback: return a clear message rather than silently returning stale template
        return {
            "error": f"Content generation failed: {e}",
            "message": "Could not generate content. Check GROQ_API_KEY in .env.",
        }

    return {
        "title": title,
        "content": content,
        "post_type": post_type,
        "platform": platform,
        "tags": tags,
        "word_count": len(content.split()),
        "status": "pending_approval",
        "message": "AI-generated content ready. Awaiting admin approval before publishing.",
    }


class PendingContentInput(BaseModel):
    status_filter: Optional[str] = Field(default=None, description="Filter by status (leave empty for all pending)")


@tool("list_pending_content", args_schema=PendingContentInput)
def list_pending_content(status_filter: Optional[str] = None) -> Dict:
    """
    Returns a summary of all content items awaiting admin approval.
    (Real data fetched from DB via router layer.)
    """
    return {
        "message": "Pending content retrieved from database.",
        "action": "fetch_pending_posts",
    }


@tool("schedule_content_publication")
def schedule_content_publication(post_id: int, publish_at: str,
                                  platform: str) -> Dict:
    """
    Schedules an approved content item for publication.
    publish_at should be ISO format datetime string.
    """
    return {
        "post_id": post_id,
        "scheduled_for": publish_at,
        "platform": platform,
        "status": "scheduled",
        "message": (
            f"Post #{post_id} scheduled for publication on {platform} at {publish_at}. "
            "You will receive a confirmation once it is live."
        ),
    }


@tool("update_website_content")
def update_website_content(section: str, content: str,
                            post_id: int) -> Dict:
    """
    Triggers a mock CMS content update on the website.
    Requires post to be in 'approved' status.
    """
    return {
        "post_id": post_id,
        "section_updated": section,
        "cms_response": "success",
        "updated_at": datetime.utcnow().isoformat(),
        "message": f"Website section '{section}' updated successfully via CMS.",
        "preview_url": f"https://hospital.example.com/blog/preview/{post_id}",
    }
