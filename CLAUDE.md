# HealthcareAI — Unified Agentic System
## Project Architecture & Developer Guide

---

## 1. System Overview

A full-stack AI healthcare assistant with 5 specialised agents, a RAG medical knowledge base, and multi-session chat management.

```
Browser (Next.js 14)
    │
    ▼ REST / JWT
FastAPI Backend (:8000)
    │
    ├── MasterAgent ──────────────────────────────────────────────────────┐
    │       │                                                              │
    │       ├── Intent Classifier (Groq llama-3.1-8b-instant — fast)     │
    │       │                                                              │
    │       ├── Agent 1 — Medical Guidance                                │
    │       │       ├── BioBERT embed (768-dim, local)                    │
    │       │       ├── Pinecone 'medical-rag' (483k PubMed chunks)       │
    │       │       ├── Cross-encoder reranker → top-5 chunks             │
    │       │       └── Groq llama-3.3-70b → citation-grounded response   │
    │       │                                                              │
    │       ├── Agent 2 — Appointment Booking                             │
    │       ├── Agent 3 — Reputation (reviews)                            │
    │       ├── Agent 4 — Content Generation (blog)                       │
    │       └── Agent 5 — Drug Notifications (email)                      │
    │                                                                      │
    ├── Memory Layer                                                       │
    │       ├── In-process session dict (fast, per-request)               │
    │       └── PostgreSQL daily summaries (5-day rolling)                │
    │                                                                      │
    └── Storage Layer                                                      │
            ├── PostgreSQL — users, appointments, blog, audit, summaries  │
            └── DynamoDB   — chat sessions + messages (free tier)         │
```

---

## 2. Repository Structure

```
AI In Healthcare/
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── master_agent.py         ← intent classify + route (Haiku + Sonnet)
│   │   │   ├── agent1_medical.py       ← RAG pipeline + chunk visibility
│   │   │   ├── agent2_appointment.py   ← booking flow + payment mock
│   │   │   ├── agent3_reputation.py    ← review fetch + AI reply + email alert
│   │   │   ├── agent4_content.py       ← blog + social media generation
│   │   │   └── agent5_notification.py  ← drug/treatment patient notifications
│   │   ├── core/
│   │   │   ├── config.py               ← all env-var settings
│   │   │   └── security.py             ← JWT auth
│   │   ├── db/
│   │   │   ├── database.py             ← SQLAlchemy async engine
│   │   │   ├── models.py               ← ORM models (users, appointments …)
│   │   │   ├── crud.py                 ← DB operations (NO direct agent access)
│   │   │   └── dynamo_chat.py          ← DynamoDB chat sessions + messages
│   │   ├── memory/
│   │   │   ├── session_memory.py       ← in-process session dict
│   │   │   └── rolling_summary.py      ← 5-day LLM summaries (PostgreSQL)
│   │   ├── routers/
│   │   │   ├── chat.py                 ← main chat API + sessions endpoints
│   │   │   ├── auth.py
│   │   │   ├── appointments.py
│   │   │   ├── blog.py
│   │   │   ├── doctors.py
│   │   │   ├── admin.py
│   │   │   └── analytics.py
│   │   ├── tools/
│   │   │   ├── medical_tools.py        ← LangChain tools for Agent 1
│   │   │   ├── appointment_tools.py    ← LangChain tools for Agent 2
│   │   │   ├── reputation_tools.py     ← LangChain tools for Agent 3
│   │   │   ├── content_tools.py        ← LangChain tools for Agent 4
│   │   │   └── notification_tools.py   ← LangChain tools for Agent 5
│   │   ├── vector_store/
│   │   │   └── pinecone_store.py       ← BioBERT + Pinecone + cross-encoder
│   │   └── main.py                     ← FastAPI app + lifespan startup
│   ├── requirements.txt
│   └── alembic/                        ← DB migrations
│
├── frontend-next/
│   ├── app/
│   │   ├── dashboard/chat/page.tsx
│   │   ├── dashboard/layout.tsx
│   │   ├── (auth)/login/page.tsx
│   │   └── (auth)/register/page.tsx
│   ├── components/
│   │   └── dashboard/
│   │       ├── ChatInterface.tsx       ← sessions sidebar + RAG panel
│   │       └── DashboardSidebar.tsx
│   ├── lib/
│   │   └── api.ts                      ← all API calls
│   ├── types/index.ts                  ← TypeScript types
│   └── store/useAuthStore.ts
│
├── .env                                ← your local env (git-ignored)
├── .env.example                        ← template with all required keys
├── docker-compose.yml
└── CLAUDE.md                           ← this file
```

---

## 3. How to Start the Project

```bash
# 1. Copy env template and fill in the required keys
cp .env.example .env
# edit .env — fill ANTHROPIC_API_KEY, PINECONE_API_KEY, SECRET_KEY, AWS_* keys

# 2. Start everything with Docker
docker-compose up --build

# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# API docs:  http://localhost:8000/docs
```

Default admin login: `admin` / `Admin@123`

---

## 4. Agent Roles

### Agent 1 — Medical Guidance
The primary patient-facing agent. Handles all symptom and health queries.

- Runs emergency keyword check first — if matched, shows emergency advisory and stops
- Embeds the query with BioBERT and retrieves top-20 PubMed chunks from Pinecone
- Cross-encoder reranks chunks and keeps top-5; passes them as citations to Claude
- Claude generates a response grounded in both its own medical training and the PubMed chunks
- Calls home-remedy and doctor-consultation-trigger tools for additional context
- Always offers to route to Agent 2 for booking at the end
- RAG chunks are surfaced in the frontend as a collapsible "Sources" panel

### Agent 2 — Appointment Booking
Guides the patient through a full step-by-step booking flow.

- Shows available departments; recommends one based on symptoms from context
- Checks slot availability for the chosen department and date
- Creates the booking record and initiates a mock $50 consultation payment
- Confirms the appointment after payment and provides a confirmation link
- Also handles post-visit feedback collection and no-show rescheduling
- Today's date is injected into every request so "tomorrow" / "next week" resolves correctly

### Agent 3 — Reputation Management
Admin-only. Monitors and manages patient reviews.

- Fetches reviews from Google and other platforms
- Categorises each review: GOOD / MODERATE / HIGH RISK
- For HIGH RISK reviews (negligence, malpractice, rude staff): auto-generates an empathetic AI reply and sends an email alert to the hospital owner
- All generated replies require explicit admin approval before being posted

### Agent 4 — Content Generation
Admin-only. Creates healthcare content for publishing.

- Generates blog posts (500–1000 words) on healthcare topics with appropriate medical disclaimers
- Creates platform-optimised social media posts (Twitter, LinkedIn, Facebook) with hashtags
- Holds all generated content in a pending-approval queue — nothing publishes automatically
- Supports scheduling and CMS website section updates

### Agent 5 — Drug / Treatment Notifications
Doctor/admin-only. Sends targeted patient notifications.

- Accepts a disease name and new treatment details from a doctor or admin
- Queries the database to find patients with matching conditions
- Generates personalised email content for each patient
- Shows a campaign preview to the admin before sending anything
- Has a hard safety rule: **never sends emails without explicit human approval**

---

## 5. Setting Up AWS DynamoDB (Free Tier)

### Step-by-step guide

**Step 1 — Create a free AWS account**
1. Go to https://aws.amazon.com and click "Create a Free Account"
2. Enter email, password, and account name
3. Select "Personal" account type
4. Enter billing info (required but you won't be charged within free-tier limits)
5. Verify your phone number
6. Choose the **Free** support plan

**Free-tier limits that apply:** 25 GB storage · 25 Read Capacity Units · 25 Write Capacity Units — permanently free, no expiry.

---

**Step 2 — Create a dedicated IAM user (security best practice)**
1. Log into AWS Console → search for "IAM" → open IAM
2. Click **Users** in the left sidebar → **Create user**
3. Enter username: `healthcareai-dynamo`
4. Click **Next**
5. On Permissions page → **Attach policies directly**
6. Search for `AmazonDynamoDBFullAccess` and tick it
7. Click **Next** → **Create user**

---

**Step 3 — Generate Access Keys**
1. Click on the user you just created (`healthcareai-dynamo`)
2. Go to the **Security credentials** tab
3. Scroll to **Access keys** → click **Create access key**
4. Select **Application running outside AWS**
5. Click **Next** → **Create access key**
6. **IMPORTANT: Copy both keys now — you cannot see the Secret again**
   - Access key ID: `AKIA…`
   - Secret access key: `wJalrXUtn…`

---

**Step 4 — Add credentials to your `.env`**
```env
AWS_ACCESS_KEY_ID=AKIA...your_key...
AWS_SECRET_ACCESS_KEY=wJalrXUtn...your_secret...
AWS_REGION=us-east-1
```

---

**Step 5 — Restart the backend**
```bash
docker-compose restart backend
```

On startup, the backend will automatically create two DynamoDB tables:
- `healthcare_chat_sessions` — one row per conversation
- `healthcare_chat_messages` — one row per message

You can verify in AWS Console → DynamoDB → Tables.

---

## 6. Key Architectural Rules

1. **LLM never touches the database directly** — all DB ops go through `backend/app/db/crud.py` (PostgreSQL) or `backend/app/db/dynamo_chat.py` (DynamoDB)
2. **Each agent is a standalone LangChain AgentExecutor** — the MasterAgent only classifies intent and routes
3. **All agents use Anthropic Claude** — Haiku for intent classification (fast/cheap), Sonnet for all sub-agents
4. **BioBERT runs locally** — no API key required; downloads ~440 MB on first run to `~/.cache/huggingface`
5. **Pinecone is read-only for the app** — the `medical-rag` index (483k PubMed vectors) must be pre-populated separately
6. **In-memory session store** (`session_memory.py`) holds messages for speed; DynamoDB holds the durable copy
7. **Rolling summaries** stay in PostgreSQL — they're used by the memory system, not chat history
8. **Tool args_schema must use Pydantic v2** — never `pydantic.v1`; LangChain 0.3.x dropped v1 support
9. **Agent output may be a list** — `langchain-anthropic` with Claude 4.x returns `output` as a list of content blocks; always normalise to string before `.lower()` or string ops

---

## 7. Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic console — used by all agents + intent classifier |
| `PINECONE_API_KEY` | ✅ | Pinecone — medical knowledge base |
| `SECRET_KEY` | ✅ | JWT signing key (`openssl rand -hex 32`) |
| `AWS_ACCESS_KEY_ID` | ✅ | DynamoDB chat storage |
| `AWS_SECRET_ACCESS_KEY` | ✅ | DynamoDB chat storage |
| `AWS_REGION` | ✅ | Default: `us-east-1` |
| `DATABASE_URL` | ✅ | PostgreSQL async URL |
| `ANTHROPIC_MODEL` | optional | Default: `claude-sonnet-4-6` |
| `ANTHROPIC_MODEL_FAST` | optional | Default: `claude-haiku-4-5-20251001` (intent classifier) |
| `BIOBERT_DEVICE` | optional | `cpu` or `cuda` |
| `NEWS_API_KEY` | optional | NewsAPI for blog posts |
| `GOOGLE_CLIENT_ID/SECRET` | optional | Google OAuth |

---

## 8. Chat API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/chat/message` | Send message → MasterAgent |
| GET | `/api/chat/sessions` | List all user sessions |
| DELETE | `/api/chat/sessions/{id}` | Delete session + messages |
| GET | `/api/chat/history/{id}` | Load messages for a session |
| POST | `/api/chat/session/{id}/summarise` | Trigger daily summary |

---

## 9. RAG Pipeline (Medical Agent)

```
User message
    │
    ▼
BioBERT encode (768-dim vector, local model)
    │
    ▼
Pinecone query — rag_docs namespace — top 20 candidates (cosine similarity)
    │
    ▼
Cross-encoder reranker (ms-marco-MiniLM-L-6-v2) — rescore & pick top 5
    │
    ▼
LangChain tool result → {knowledge_chunks: [{text, citation, score, cross_score}]}
    │
    ▼
Claude generates citation-grounded response (DOI / PMCID from chunk metadata)
    │
    ▼
ChatResponse.rag_sources → frontend Sources panel
    │
    ▼
DynamoDB message.metadata.rag_sources (persisted for history)
```

**To see RAG chunks in server logs**, set `DEBUG=true` in `.env`. Chunks are logged at DEBUG level per message.

---

## 10. Known Bug Fixes Applied

### Pydantic v1 → v2 in tool schemas
`medical_tools.py` and `appointment_tools.py` were using `from pydantic.v1 import BaseModel, Field`.
LangChain 0.3.x dropped Pydantic v1 — `args_schema` must be a Pydantic v2 `BaseModel`.
Fixed to `from pydantic import BaseModel, Field` in both files.

### Internal IDs removed from tool schemas
`SymptomInput` (medical) had `user_id: int` and `session_id: str`.
`AppointmentInput` (appointment) had `patient_id: int`.
These are internal runtime values the LLM can't supply reliably. Removed from all schemas and function signatures.

### Agent output list → string normalisation
`langchain-anthropic` with Claude 4.x models returns `AgentExecutor.output` as a list of content blocks:
`[{'type': 'text', 'text': '...', 'index': 0}]` instead of a plain string.
All five agents (`agent1_medical` through `agent5_notification`) now normalise output before any string operations:
```python
if isinstance(output, list):
    output = " ".join(
        block.get("text", "") for block in output
        if isinstance(block, dict) and block.get("type") == "text"
    )
```

### Agent 2 — wrong date for "tomorrow"
The appointment agent had no knowledge of the current date, so "tomorrow" was hallucinated.
Fixed by injecting `Today's date: {date.today().isoformat()}` into the enriched input for every Agent 2 request.

### Intent classifier — booking phrases misrouted to medical agent
Short phrases like "now book", "yes book", "book it" after a medical conversation were being
classified as `medical_guidance` due to knee-pain context in the conversation history.
Added an explicit `CRITICAL BOOKING RULE` to the classifier prompt: short affirmatives following
a booking offer are always classified as `appointment`.

### langchain-anthropic version bump
`requirements.txt` updated from `langchain-anthropic==0.3.0` to `==0.3.15` for compatibility with `langchain-core==0.3.21`.

### Agent 5 — notification tools were stubs, campaigns never persisted
All four notification tools (`find_relevant_patients`, `generate_treatment_email`,
`preview_notification_campaign`, `mark_notifications_sent`) returned hardcoded dicts with no DB access.
`crud.create_notification_campaign()` was never called so the `notification_campaigns` table stayed empty,
meaning the admin approval endpoint had nothing to approve.

Fixed by mirroring the Agent 2 booking pattern:
- Added `return_intermediate_steps=True` to Agent 5's `AgentExecutor`
- Added `_extract_campaign_data()` in `agent5_notification.py` — extracts `disease_name`, `treatment_title`,
  `treatment_details` (from `tool_input`), and `email_template` from the `generate_treatment_email` result
- Agent 5 now returns `campaign_data` in its result dict
- `chat.py` step 7c: when `agent_used == "agent5_notification"` and `campaign_data` is present,
  calls `crud.create_notification_campaign()` inline before returning the response

### Symptoms never saved — notification campaigns matched 0 patients
`crud.save_symptoms()` existed but was never called from anywhere (not from `chat.py`, not from Agent 1,
no tool in `medical_tools.py`). As a result the `symptoms` table was always empty, so
`get_patients_by_disease_keyword()` (used at campaign approval time) always returned 0 patients.

Fixed in `chat.py`:
- Added `_SYMPTOM_KEYWORDS` set (~35 common conditions/symptoms) at module level
- Added `_save_symptoms()` async helper: keyword-matches the raw user message, determines severity,
  calls `crud.save_symptoms()` with `raw_text` (the full message — what the ILIKE search runs on),
  `symptoms_list` (matched keywords), `severity`, and `is_emergency`
- `chat.py` step 7b: when `agent_used == "agent1_medical"` a background task calls `_save_symptoms()`

The full end-to-end notification flow now works:
1. Admin chats with Agent 5 → `generate_treatment_email` tool called → `campaign_data` extracted →
   `NotificationCampaign` row saved to PostgreSQL
2. Admin visits `/api/admin/notifications/pending` → sees the campaign
3. Admin approves → `get_patients_by_disease_keyword()` ILIKE-searches `symptoms.raw_text` (now populated) →
   real patient list returned → emails dispatched per patient via `send_patient_notification()`

---

## 11. Session History

### DynamoDB Chat Storage
- **`backend/app/db/dynamo_chat.py`**
  - `DynamoChatDB` class wraps two DynamoDB tables
  - All boto3 (synchronous) calls wrapped in `asyncio.run_in_executor` so they don't block FastAPI's event loop
  - Tables auto-created at startup if they don't exist
  - Graceful degradation: if AWS credentials are missing, chat still works in-memory — only persistence is skipped

### Session Management
- **`GET /api/chat/sessions`** — returns all sessions for the logged-in user, sorted by `last_active`
- **`DELETE /api/chat/sessions/{id}`** — deletes session + all its messages
- **`GET /api/chat/history/{id}`** — reads from DynamoDB
- Session **title** is auto-set from the first 60 chars of the user's first message
- Sessions sidebar in the frontend: shows all conversations, click to switch, trash icon to delete, "New Chat" button

### RAG Source Visibility
- **`agent1_medical.py`**: `return_intermediate_steps=True` in AgentExecutor
  - `_extract_rag_chunks()` pulls the `knowledge_chunks` out of the `query_medical_knowledge` tool result
  - Each chunk logged at DEBUG level: score, cross_score, citation, first 300 chars
  - Chunks returned in the agent result dict as `rag_sources`
- **`chat.py`**: `ChatResponse` now includes `rag_sources` (list of `RagChunk`)
- **Frontend**: collapsible **Sources (N PubMed chunks)** panel under each AI message

### Frontend ChatInterface
- Left sidebar (256 px, collapsible) showing session list
- Sessions show relative time ("2h ago") and message count
- Switching sessions loads history from DynamoDB via API
- RAG chunks panel renders under AI responses from medical agent

---

## 12. Email / SMTP Setup

Email is sent via Gmail SMTP. The sender address is `SMTP_USER` (your Gmail).
If `SMTP_USER` or `SMTP_PASSWORD` are empty, the service logs `MOCK EMAIL` and returns `True` — nothing is sent.

Add to `.env` to enable real sending:
```env
SMTP_USER=youremail@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail App Password — NOT your Gmail login password
ALERT_EMAIL=owner@yourhospital.com  # receives high-risk review alerts
```

**Generating a Gmail App Password** (required because Gmail blocks SMTP with regular passwords):
1. Google Account → Security → enable 2-Step Verification
2. Search "App passwords" → app: Mail, device: Other → name: HealthcareAI
3. Copy the 16-character password → paste as `SMTP_PASSWORD`

Three email flows use this:
| Trigger | Recipient | Function |
|---|---|---|
| Campaign approved by admin | Matched patients | `send_patient_notification()` |
| High-risk review detected | `ALERT_EMAIL` | `send_high_risk_alert()` |
| Patient no-show | Patient | `send_no_show_notification()` |

---

## 13. TODOs

### Configuration (no code needed — just fill in `.env`)
- [ ] Set up AWS account and add credentials to `.env` (see Section 5 above)
- [ ] Verify DynamoDB tables created: AWS Console → DynamoDB → Tables
- [ ] Add `SMTP_USER`, `SMTP_PASSWORD`, `ALERT_EMAIL` to `.env` to enable real email (see Section 12)
- [ ] Set `DEBUG=true` in `.env` to see full RAG chunk logs in backend console
- [ ] (Optional) Add `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_ACCESS_TOKEN` to `.env` to enable Facebook posting (see Section 14)
- [ ] (Optional) Add `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` to `.env` for real payments (mock mode works without them)
- [ ] (Optional) Populate Pinecone `medical-rag` index with real PubMed vectors for production RAG

### Optional features (code work)
- [ ] Add DynamoDB table TTL for auto-expiry of old messages
- [ ] Add session rename functionality (`PATCH /api/chat/sessions/{id}`)
- [ ] Export session as PDF from the sessions sidebar
- [ ] Add Instagram and LinkedIn direct posting (same pattern as Facebook — Graph API for LinkedIn)

---

## 14. Facebook Direct Posting Setup

The blog admin page has a **Post to Facebook** button on approved social media posts.

### Requirements
- A Facebook Developer account and an App with the **Pages API** product
- A long-lived **Page Access Token** (valid 60 days by default; can be made permanent via token refresh)

### Step-by-step
1. Go to https://developers.facebook.com → **My Apps** → **Create App** → choose **Business**
2. Add the **"Pages"** product to your app
3. Open **Tools → Graph API Explorer**
4. Select your app, then click **Generate Access Token**
5. Grant permissions: `pages_manage_posts`, `pages_read_engagement`
6. Copy the token and your Page ID (found in your Facebook Page → About → Page ID)
7. Add to `.env`:
   ```env
   FACEBOOK_PAGE_ID=your_page_id
   FACEBOOK_PAGE_ACCESS_TOKEN=your_long_lived_token
   ```
8. Restart the backend — the **Post to Facebook** button will appear on approved social posts

---

## 15. Bug Fixes Applied (Session 2 — 2026-05-03)

### Doctor specialization stored in wrong field
`admin.py` was saving and reading doctor specialization via `User.gender` (an MVP hack).
Fixed:
- Added `specialization = Column(String(200))` to `User` model in `models.py`
- Added idempotent `ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization VARCHAR(200)` to `init_db()` in `database.py` — runs at startup, safe on existing databases
- Updated `crud.create_user()` to accept and store `specialization`
- Updated `admin.py` list/create/return to use `user.specialization` (with `or d.gender` fallback for any old rows)

### Appointment slots were fully mocked
`check_slot_availability` tool always generated all slots; booked times were never excluded.
Fixed:
- Added `SyncSessionLocal` sync session factory to `database.py` (uses `DATABASE_SYNC_URL`)
- `_get_booked_slots_sync()` helper queries `appointments` table via sync SQLAlchemy for already-booked times on the requested date/department
- Booked slots are removed from the available list before returning to the agent
- Added `GET /api/appointments/available-slots?department=X&date=Y` public endpoint for the frontend booking page
- Added double-booking guard in `POST /api/appointments/book` — returns HTTP 409 if the exact slot is already taken
- Added `appointmentsApi.availableSlots()` to `frontend-next/lib/api.ts`

### Blog content generation used hardcoded templates
`generate_blog_post` tool returned static template strings regardless of the topic.
Fixed:
- Rewrote `content_tools.py` to call **Groq synchronously** (`groq.Groq` sync client) with a topic-aware prompt
- Blog posts: structured markdown with intro, H2 sections, takeaways, medical disclaimer
- Social media: platform-specific prompts with correct character limits (Twitter 280 / LinkedIn 1300 / Facebook 1000 / Instagram 2200) and hashtag guidance
- Falls back to an error dict (never silently returns stale content) if GROQ_API_KEY is missing

### Enhance-with-AI did not distinguish post type
The `/api/blog/enhance` endpoint used a generic "blog post" prompt regardless of whether the content was for Twitter, LinkedIn, or Facebook.
Fixed:
- `EnhanceRequest` now accepts `post_type` and `platform` fields
- Prompt is rewritten per platform: Twitter gets a punchy 280-char limit, LinkedIn gets professional thought-leadership tone, Facebook gets conversational style
- `blogApi.enhance()` in `api.ts` now passes `post_type` and `platform`
- `enhanceWithAI()` in the blog admin page passes the current form's `post_type` and `platform`

### Social media had no direct posting capability
Posts could only be approved/stored; there was no way to push them to an actual platform.
Fixed:
- Added `POST /api/blog/admin/{post_id}/publish/facebook` endpoint in `blog.py`
- Uses Facebook Graph API `/{page_id}/feed` with the configured page token
- Only works on `approved` or `published` posts; returns HTTP 503 with a clear message if env vars are missing
- Added `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN` to `config.py` and `.env.example`
- **Post to Facebook** button added to blog admin page (visible only on approved/published social_media posts)
- `blogApi.publishToFacebook()` added to `api.ts`
