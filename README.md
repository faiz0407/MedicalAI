# HealthcareAI — Unified Agentic AI Healthcare SaaS Platform

A production-ready, fully-featured healthcare AI platform with a **Next.js App Router** frontend, **FastAPI** backend, 5 specialised AI agents, Pinecone RAG, and complete patient/doctor/admin dashboards.

## System Overview

```
User sees ONE chatbot → MasterAgent routes internally to:
  Agent 1 — Medical Guidance      (RAG + Emergency Detection)
  Agent 2 — Appointment Booking   (Scheduling + Payment)
  Agent 3 — Reputation Management (Reviews + AI Replies)
  Agent 4 — Content Generation    (Blogs + Social Media)
  Agent 5 — Drug Notifications    (Patient Alerts)
```

## Tech Stack

| Layer         | Technology                                            |
| ------------- | ----------------------------------------------------- |
| LLM           | Groq API (llama-3.3-70b-versatile)                    |
| Orchestration | LangChain Agents + Tool Calling                       |
| Backend       | FastAPI (Python 3.12) + asyncio                       |
| Database      | PostgreSQL 16 (SQLAlchemy async)                      |
| Vector Store  | Pinecone (medical knowledge RAG)                      |
| Embeddings    | BioBERT (dmis-lab/biobert-base-cased-v1.2, local)     |
| Frontend      | **Next.js 14 App Router** + TypeScript + Tailwind CSS |
| State         | Zustand                                               |
| Auth          | JWT (HS256) + BCrypt                                  |
| News          | NewsAPI.org (health/AI/research categories)           |
| Containers    | Docker + Docker Compose                               |

---

## Quick Start

### Prerequisites

- Docker + Docker Compose
- Groq API key (free at console.groq.com)
- Pinecone API key (free tier at pinecone.io)
- OpenAI API key (optional, for embeddings)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 2. Start all services

```bash
docker-compose up --build
```

Services started:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Database: localhost:5432

### 3. First login

Default admin credentials (change immediately):

- Username: `admin`
- Password: `Admin@123`

Or register a new account at http://localhost:3000

---

## Local Development (without Docker)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and fill in environment variables
cp ../.env.example .env

# Start PostgreSQL (via Docker)
docker run -d \
  --name healthcare_db \
  -e POSTGRES_USER=healthuser \
  -e POSTGRES_PASSWORD=healthpass \
  -e POSTGRES_DB=healthcareai \
  -p 5432:5432 \
  postgres:16-alpine

# Run the backend
uvicorn app.main:app --reload --port 8000

# (Optional) Seed medical knowledge base
python ../scripts/seed_medical_kb.py
```

### Frontend (Next.js)

```bash
cd frontend-next

# Install dependencies
npm install

# Copy env example (optional — API URL defaults to localhost:8000)
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# Start dev server
npm run dev
# → http://localhost:3000
```

---

## Project Structure

```
AI In Healthcare/
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── master_agent.py      # Central orchestrator
│   │   │   ├── agent1_medical.py    # Medical Guidance Agent
│   │   │   ├── agent2_appointment.py
│   │   │   ├── agent3_reputation.py
│   │   │   ├── agent4_content.py
│   │   │   └── agent5_notification.py
│   │   ├── tools/
│   │   │   ├── medical_tools.py     # LangChain tool definitions
│   │   │   ├── appointment_tools.py
│   │   │   ├── reputation_tools.py
│   │   │   ├── content_tools.py
│   │   │   └── notification_tools.py
│   │   ├── db/
│   │   │   ├── database.py          # Async SQLAlchemy engine
│   │   │   ├── models.py            # All ORM models (11 tables)
│   │   │   └── crud.py              # All DB operations
│   │   ├── memory/
│   │   │   ├── session_memory.py    # In-process session store
│   │   │   └── rolling_summary.py  # 5-day rolling summary
│   │   ├── vector_store/
│   │   │   └── pinecone_store.py    # Medical knowledge RAG
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── chat.py              # Main chat endpoint
│   │   │   ├── admin.py
│   │   │   ├── appointments.py
│   │   │   ├── analytics.py
│   │   │   ├── blog.py              # Blog posts + NewsAPI fetch
│   │   │   └── doctors.py           # Doctor list + availability slots
│   │   ├── services/
│   │   │   ├── email_service.py
│   │   │   └── payment_service.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── security.py
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend-next/                   # Next.js 14 App Router frontend
│   ├── app/
│   │   ├── layout.tsx               # Root layout
│   │   ├── page.tsx                 # Landing page (animated, medical-themed)
│   │   ├── (auth)/login/            # Login page
│   │   ├── (auth)/register/         # Register page
│   │   ├── dashboard/               # Patient dashboard
│   │   │   ├── chat/                # AI chat interface
│   │   │   ├── appointments/        # Book + view appointments
│   │   │   ├── history/             # Medical history + AI summaries
│   │   │   └── notifications/       # Patient notifications
│   │   ├── admin/                   # Admin dashboard
│   │   │   ├── page.tsx             # Overview + analytics
│   │   │   ├── users/               # User management
│   │   │   ├── reviews/             # Reputation management
│   │   │   ├── blog/                # Content management
│   │   │   └── notifications/       # Campaign management
│   │   ├── doctor/                  # Doctor dashboard
│   │   └── blog/                    # Public blog + news
│   ├── components/
│   │   ├── landing/                 # Hero, AnimatedBg, Sections
│   │   ├── shared/                  # Navbar, Footer
│   │   ├── dashboard/               # ChatInterface, Sidebar
│   │   └── ui/                      # Reusable UI components
│   ├── lib/api.ts                   # Centralized API client
│   ├── store/useAuthStore.ts        # Zustand auth
│   ├── types/index.ts               # All TypeScript types
│   ├── middleware.ts                # Auth route protection
│   └── Dockerfile
├── scripts/
│   ├── init.sql                     # DB initialisation
│   └── seed_medical_kb.py           # Pinecone seeder
├── docs/
│   └── ARCHITECTURE.md
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Key Design Decisions

### 1. LLM Never Touches DB Directly

All database operations are encapsulated in `crud.py` functions.
Agents call **tools** → tools return structured data → LLM generates response.

### 2. Manual Approval Gates

Critical actions require human confirmation:

- Review replies before posting
- Blog/social content before publishing
- Patient notification emails before sending

### 3. Emergency Detection

Agent 1 runs `check_emergency` tool on EVERY symptom message.
Emergency keywords trigger immediate advisory + internal audit log.

### 4. Memory Layering

- **Immediate**: In-process dict (fast, per-session)
- **Session persistence**: PostgreSQL chat_messages (async background)
- **Rolling context**: 5-day summaries injected into system prompt

### 5. Prompt Injection Protection

All user inputs pass through `_sanitise_input()` which blocks common injection patterns before reaching the LLM.

---

## Environment Variables Reference

| Variable               | Required | Description                                                  |
| ---------------------- | -------- | ------------------------------------------------------------ |
| `GROQ_API_KEY`         | ✅       | Groq API key — free at console.groq.com                      |
| `PINECONE_API_KEY`     | ✅       | Pinecone vector store — free tier at pinecone.io             |
| `PINECONE_ENVIRONMENT` | ✅       | e.g. `gcp-starter`                                           |
| `SECRET_KEY`           | ✅       | JWT signing key — `openssl rand -hex 32`                     |
| `DATABASE_URL`         | ✅       | Async PostgreSQL URL                                         |
| `NEWS_API_KEY`         | Optional | NewsAPI key — free at newsapi.org (mock data used otherwise) |
| `SMTP_USER`            | Optional | Gmail address for email alerts                               |
| `SMTP_PASSWORD`        | Optional | Gmail app password                                           |
| `ALERT_EMAIL`          | Optional | Hospital admin alert recipient                               |
| `GOOGLE_CLIENT_ID`     | Optional | Google OAuth                                                 |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth                                                 |

---

## Future Enhancements

- [ ] WebSocket real-time chat (replace polling)
- [ ] Alembic database migrations
- [ ] Redis for distributed session memory
- [ ] Stripe/Razorpay payment integration
- [ ] FHIR API integration for EHR systems
- [ ] Multi-language support
- [ ] Voice input (Whisper API)
- [ ] Mobile app (React Native)
- [ ] Kubernetes deployment manifests

What was just implemented

1. Doctor Specialization Fix  


- Added specialization = Column(String(200)) to User model
- init_db() now runs ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization on every startup — safe on existing databases
- crud.create_user() accepts and saves specialization
- admin.py list/create/response now uses user.specialization (with or d.gender fallback for old rows)

2. Real Appointment Slots from DB

- Added SyncSessionLocal to database.py for sync DB access inside LangChain tools
- check_slot_availability tool now queries existing appointments and removes booked slots from the list
- New GET /api/appointments/available-slots?department=X&date=Y endpoint for the frontend booking page
- POST /api/appointments/book now returns HTTP 409 if the exact slot is already taken
- appointmentsApi.availableSlots() added to api.ts

3. Blog Content Uses LLM

- generate_blog_post tool now calls Groq synchronously with topic-aware prompts
- Blog posts: structured markdown with H2 sections and medical disclaimer
- Social media: correct character limits per platform (Twitter 280, LinkedIn 1300, Facebook 1000, Instagram 2200)

4. Enhance-with-AI + Facebook Posting

- /api/blog/enhance now accepts post_type and platform — different prompt per platform
- Frontend passes post_type and platform when clicking Enhance
- Post to Facebook button added (visible on approved/published social posts)
- POST /api/blog/admin/{id}/publish/facebook calls Facebook Graph API
- Add FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN to .env to activate it

---

How to get SMTP (Gmail) keys

SMTP_PASSWORD is a Gmail App Password — NOT your Gmail login password.

Steps:

1. Go to https://myaccount.google.com → Security
2. Turn on 2-Step Verification (required first)
3. Back on Security page, search "App passwords" → click it
4. Choose Mail + Other (custom name) → name it HealthcareAI
5. Click Generate — you'll get a 16-character code like xxxx xxxx xxxx xxxx
6. Copy it into .env as SMTP_PASSWORD=xxxx xxxx xxxx xxxx
7. Set SMTP_USER=your.gmail@gmail.com and ALERT_EMAIL=owner@hospital.com

That's it — no other SMTP server setup needed.
