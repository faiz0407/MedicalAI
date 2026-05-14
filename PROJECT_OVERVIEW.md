# HealthcareAI — Complete Application Overview
> End-to-end technical reference: how every feature works, where data travels, which file handles what.

---

## 1. How the Application Starts

**File: `docker-compose.yml`**

When you run `docker-compose up --build`, Docker starts 4 containers in dependency order:

```
postgres (starts first)
    ↓
redis (starts second)
    ↓
backend :8000 (waits for postgres + redis healthchecks)
    ↓
frontend :3000 (waits for backend healthcheck)
```

**File: `backend/app/main.py`** — the FastAPI startup sequence runs in this order:

```
1. init_db()                     → SQLAlchemy creates all PostgreSQL tables
2. dynamo_chat.initialize()       → boto3 creates DynamoDB tables if missing
3. medical_vector_store.initialize() → connects to Pinecone 'medical-rag' index
4. MasterAgent singleton created  → Anthropic Haiku (intent) + Sonnet (general)
                                    clients initialised
```

---

## 2. Database Tables — Where They Live and What They Store

### PostgreSQL (relational data — everything except chat)
**File: `backend/app/db/models.py`**

```
┌─────────────────────────────────────────────────────────────────────┐
│  TABLE: users                                                        │
│  id, username, email, hashed_password, full_name, age, gender,      │
│  phone, role (patient/doctor/admin), is_active, created_at          │
├─────────────────────────────────────────────────────────────────────┤
│  TABLE: symptoms                                                     │
│  id, user_id → users, session_id, symptoms_list (JSON array),       │
│  raw_text, severity, is_emergency, ai_response, created_at          │
├─────────────────────────────────────────────────────────────────────┤
│  TABLE: appointments                                                 │
│  id, patient_id → users, doctor_id → users, department,             │
│  appointment_time, symptoms_summary, status, payment_status,        │
│  payment_reference, feedback, feedback_rating, created_at           │
├─────────────────────────────────────────────────────────────────────┤
│  TABLE: reviews                                                      │
│  id, platform, reviewer_name, rating, review_text, review_date,     │
│  category (good/moderate/high_risk), ai_reply, reply_approved,      │
│  reply_posted, flagged_keywords (JSON)                               │
├─────────────────────────────────────────────────────────────────────┤
│  TABLE: blog_posts                                                   │
│  id, title, content, post_type, platform, status, approved_by,      │
│  approved_at, published_at, tags (JSON), created_at                 │
├─────────────────────────────────────────────────────────────────────┤
│  TABLE: notification_campaigns                                       │
│  id, disease_name, treatment_title, treatment_details,              │
│  email_template, status (pending/approved/sent/failed),             │
│  approved_by, sent_count, created_at                                │
├─────────────────────────────────────────────────────────────────────┤
│  TABLE: notification_logs                                            │
│  id, campaign_id → notification_campaigns, patient_id → users,      │
│  email, status, sent_at, error_msg                                  │
├─────────────────────────────────────────────────────────────────────┤
│  TABLE: daily_summaries  (memory system)                             │
│  id, user_id → users, summary_date, summary_text,                   │
│  interaction_count, agents_used (JSON)                               │
├─────────────────────────────────────────────────────────────────────┤
│  TABLE: audit_logs                                                   │
│  id, user_id → users, action, resource, resource_id, details (JSON),│
│  ip_address, created_at                                              │
└─────────────────────────────────────────────────────────────────────┘
```

**File: `backend/app/db/database.py`** — creates the SQLAlchemy async engine with connection pool (size=10, max_overflow=20). All tables are created automatically via `init_db()` which calls `Base.metadata.create_all()`.

### DynamoDB (chat sessions + messages only)
**File: `backend/app/db/dynamo_chat.py`**

```
TABLE: healthcare_chat_sessions
  PK: user_id (String)
  SK: session_id (String)
  Attributes: title, created_at, last_active, message_count

TABLE: healthcare_chat_messages
  PK: session_id (String)
  SK: created_at (ISO string — sorts chronologically)
  Attributes: message_id, role, content, agent_used, metadata{rag_sources}
```

### Pinecone (medical knowledge — read only)
**File: `backend/app/vector_store/pinecone_store.py`**

```
INDEX: medical-rag
  Namespace: rag_docs     → 483,000 PubMed article chunks (pre-loaded, never written by app)
  Namespace: chat_context → per-session conversation vectors (written by memory module)
  Vector dimension: 768 (BioBERT)
  Metric: cosine similarity
```

---

## 3. Authentication Flow

**Files:** `backend/app/routers/auth.py`, `backend/app/core/security.py`,
`frontend-next/store/useAuthStore.ts`, `frontend-next/app/(auth)/login/page.tsx`

### Registration
```
User fills form at /register
    ↓
POST /api/auth/register  (auth.py line 74)
    ↓
crud.get_user_by_username() — check no duplicate  (crud.py line 41)
crud.get_user_by_email()    — check no duplicate  (crud.py line 51)
    ↓
crud.create_user()  →  INSERT INTO users (password hashed with bcrypt)  (crud.py line 25)
    ↓
crud.log_audit()  →  INSERT INTO audit_logs  (crud.py line 373)
    ↓
create_access_token()  →  JWT signed with SECRET_KEY, 24h expiry  (security.py line 33)
    ↓
Returns: { access_token, user: {id, username, email, role} }
    ↓
Frontend stores token in localStorage + user in Zustand useAuthStore
    ↓
Redirected based on role:
  patient → /dashboard/chat
  doctor  → /doctor
  admin   → /admin
```

### Login
```
POST /api/auth/token  (auth.py line 104)
    ↓
crud.get_user_by_username()  →  SELECT FROM users WHERE username=?
verify_password()  →  bcrypt.checkpw()  (security.py line 29)
    ↓
create_access_token()  →  JWT payload: {user_id, role, username}
    ↓
Same response + role-based redirect as registration
```

### Every Protected Request
```
Frontend sends:  Authorization: Bearer <jwt_token>
    ↓
FastAPI dependency: get_current_user()  (security.py line 55)
    ↓
decode_token()  →  jwt.decode() with SECRET_KEY
    ↓
Returns TokenData {user_id, role, username}
    ↓
Role-based guards:
  require_admin   → only role=admin
  require_doctor  → role=doctor or admin
  require_patient → any role
```

### Google OAuth (optional)
```
GET /api/auth/google  →  redirect to Google consent screen
Google redirects back to /api/auth/google/callback
    ↓
Exchange code for Google access token
Fetch user profile from Google (email, name)
    ↓
Find existing user by email OR create new patient account
Issue our own JWT
    ↓
Redirect to /auth/google/success?token=<jwt>
Frontend stores token same as normal login
```

---

## 4. Patient Chat Flow — Complete End to End

**Files:** `frontend-next/components/dashboard/ChatInterface.tsx`,
`backend/app/routers/chat.py`, `backend/app/agents/master_agent.py`,
`backend/app/agents/agent1_medical.py`, `backend/app/memory/session_memory.py`,
`backend/app/memory/rolling_summary.py`, `backend/app/db/dynamo_chat.py`

### When a patient sends "I have chest pain and fever"

```
FRONTEND
─────────────────────────────────────────────────────────
ChatInterface.tsx — sendMessage()
    ↓
chatApi.send({ message, session_id })  →  POST /api/chat/message
JWT token attached by axios interceptor  (lib/api.ts line 17)

BACKEND — chat.py POST /api/chat/message
─────────────────────────────────────────────────────────
1. session_id = body.session_id  OR  generate new UUID

2. crud.get_user_by_id()
   → SELECT FROM users WHERE id={user_id}
   → Gets: name, age, gender, role

3. init_session()  (session_memory.py)
   → Creates in-memory Python dict:
     { user_id, user_context:{name,age,gender}, messages:[], agents_used:[] }

4. load_rolling_summaries()  (rolling_summary.py)
   → SELECT FROM daily_summaries WHERE user_id=X AND last 5 days
   → Builds memory_context string: "Previously you discussed..."

5. get_messages(session_id, last_n=20)  (session_memory.py)
   → Returns last 20 messages from in-memory dict

6. add_message(session_id, "user", message)
   → Appends to in-memory messages list

7. _sanitise_input()
   → Blocks prompt injection patterns, caps at 2000 chars

8. master_agent.process()  ← THE BRAIN  (see Section 5)

9. add_message(session_id, "assistant", ai_response)
   → Appends AI response to in-memory store

10. BackgroundTask: _persist_messages()
    → dynamo_chat.get_or_create_session()  → DynamoDB GET/PUT
    → dynamo_chat.save_message("user", ...)          → DynamoDB PUT
    → dynamo_chat.save_message("assistant", ...,
        metadata={rag_sources})                      → DynamoDB PUT
    → dynamo_chat.update_session(title=first_60_chars, delta=2)

11. crud.log_audit()
    → INSERT INTO audit_logs

12. Returns ChatResponse:
    { session_id, response, agent_used, intent_detected,
      is_emergency, suggest_booking, rag_sources }

FRONTEND
─────────────────────────────────────────────────────────
ChatInterface.tsx receives response
    ↓
Appends AI message to messages[] state
    ↓
If rag_sources present → RagSourcesPanel renders
   (collapsible "Sources (N PubMed chunks)" under the message)
    ↓
Calls loadSessions() → GET /api/chat/sessions
   → Updates sessions sidebar with new title + last_active
```

---

## 5. The MasterAgent — How the AI Brain Works

**File: `backend/app/agents/master_agent.py`**

```
master_agent.process(message, user_id, session_id, chat_history, memory_context)
    ↓
STEP 1: Intent Classification
──────────────────────────────────────────────────────
ChatAnthropic Haiku (temperature=0.0, max_tokens=20)
Prompt: INTENT_CLASSIFIER_PROMPT + last 4 messages + new message
Returns one of:
  medical_guidance | appointment | reputation |
  content_generation | notification | general

STEP 2: Route to Sub-Agent
──────────────────────────────────────────────────────
medical_guidance    → agent1_medical.run_medical_agent()
appointment         → agent2_appointment.run_appointment_agent()
reputation          → agent3_reputation.run_reputation_agent()
content_generation  → agent4_content.run_content_agent()
notification        → agent5_notification.run_notification_agent()
general             → MasterAgent answers directly (greeting / help)

STEP 3: Cross-Agent Transition
──────────────────────────────────────────────────────
If agent1 returns route_to_agent2=True:
  → Sets suggest_booking=True in response
  → Frontend stores forcedIntent='appointment'
  → Next message the user sends goes straight to agent2
    without re-classifying intent
```

---

## 6. Agent 1 — Medical Guidance + RAG Pipeline

**Files:** `backend/app/agents/agent1_medical.py`,
`backend/app/tools/medical_tools.py`,
`backend/app/vector_store/pinecone_store.py`

> **LLM changed:** now uses **Anthropic claude-sonnet-4-6** (was Groq LLaMA).
> Groq is still used by the MasterAgent intent classifier and Agents 2–5.

```
run_medical_agent("I have chest pain and fever")
    ↓
build_medical_agent() → LangChain AgentExecutor (ChatAnthropic) with 5 tools:
  1. check_emergency
  2. query_medical_knowledge   ← uses Pinecone + BioBERT
  3. generate_home_remedies
  4. suggest_videos
  5. get_doctor_consultation_triggers

AgentExecutor.ainvoke() — LLM decides which tools to call:

TOOL 1: check_emergency  (medical_tools.py)
──────────────────────────────────────────────────────
Checks symptoms against EMERGENCY_KEYWORDS set
"chest pain" → MATCH
Returns: { is_emergency: true, advisory: "Call 911 immediately" }

TOOL 2: query_medical_knowledge  (medical_tools.py)
──────────────────────────────────────────────────────
pinecone_store.query_with_rerank("chest pain and fever")
    ↓
  A. BioBERT encode  (pinecone_store.py)
     Model: dmis-lab/biobert-base-cased-v1.2  (local, ~440 MB)
     "chest pain and fever" → 768-dimensional float vector

  B. Pinecone query  (pinecone_store.py)
     Search rag_docs namespace (483k PubMed chunks)
     Retrieves top-20 candidates by cosine similarity

  C. Cross-encoder rerank  (pinecone_store.py)
     Model: cross-encoder/ms-marco-MiniLM-L-6-v2
     Re-scores all 20 (query, chunk) pairs
     Raw logit scores converted via sigmoid → [0, 1] probability
     Filters: keeps ONLY chunks with cross_score ≥ 0.90 (90% threshold)
     Returns up to 5 passing chunks

  D. Two outcomes:
     ┌─ Chunks found (≥ 1 passed threshold) ─────────────────────────┐
     │  Returns: [{text, doi, pmc_id, score, cross_score≥0.90}]      │
     │  no_relevant_chunks: false                                      │
     │  instruction: "Use ONLY knowledge_chunks, cite every claim"    │
     └────────────────────────────────────────────────────────────────┘
     ┌─ No chunks passed threshold ──────────────────────────────────┐
     │  Returns: knowledge_chunks: []                                 │
     │  no_relevant_chunks: true                                      │
     │  instruction: "Answer from own medical training knowledge,     │
     │               no citations, add own-knowledge notice"          │
     └────────────────────────────────────────────────────────────────┘

TOOL 3: generate_home_remedies  (medical_tools.py)
──────────────────────────────────────────────────────
Keyword match on symptoms_text → supportive care list

TOOL 4: get_doctor_consultation_triggers  (medical_tools.py)
──────────────────────────────────────────────────────
"chest pain" → matches CONSULT_KEYWORDS
Returns: { should_consult: true, message: "Book appointment now" }

FINAL LLM RESPONSE (Anthropic claude-sonnet-4-6)
──────────────────────────────────────────────────────
Always begins with mandatory disclaimer:
  "⚠️ I am not a medical expert or licensed healthcare professional.
   The following information is for general educational purposes only…"

Then one of two paths:

PATH A — RAG chunks found (no_relevant_chunks=false):
  ## What the Research Says      ← every claim cited (DOI/PMCID)
  ## Supportive Care Suggestions
  ## When to Seek Medical Attention
  ## Medical Disclaimer
  ## Next Steps (booking offer)

PATH B — No chunks passed 90% threshold (no_relevant_chunks=true):
  "📚 No high-confidence research chunks were found for this topic.
   The following is based on general medical knowledge, not citations."
  [LLM answers from own training — no fabricated citations]
  ## Supportive Care Suggestions
  ## When to Seek Medical Attention
  ## Medical Disclaimer
  ## Next Steps (booking offer)

_extract_rag_chunks()  (agent1_medical.py)
→ Pulls knowledge_chunks from intermediate_steps
→ Logs N chunks passed / 0 passed at INFO level
→ Logs each chunk at DEBUG level (score, cross_score, citation, text[:300])

Returns:
{ agent: "agent1_medical", output: "...", is_emergency: true,
  suggest_booking: true,
  rag_sources: [{text, citation, score, cross_score}]  ← [] if own-knowledge }
```

---

## 7. Session Memory — How the Bot Remembers You

Two layers work together:

### Layer 1 — In-Process RAM (fast, current session only)
**File: `backend/app/memory/session_memory.py`**

```
Python dict stored in server RAM:
{
  "session-uuid-123": {
    "user_id": 42,
    "user_context": { name, age, gender, role },
    "messages": [
      { "role": "user",      "content": "...", "timestamp": "..." },
      { "role": "assistant", "content": "...", "agent": "agent1_medical" }
    ],
    "agents_used": ["agent1_medical"],
    "created_at": "...",
    "last_active": "..."
  }
}

Last 20 messages passed to every agent call as chat_history
→ Agent uses these as LangChain HumanMessage / AIMessage context
→ Lost if the server restarts (DynamoDB is the durable copy)
```

### Layer 2 — PostgreSQL rolling summaries (5-day memory)
**File: `backend/app/memory/rolling_summary.py`**

```
After each session ends / on manual trigger:
  generate_daily_summary()
  → Groq LLM summarises the entire conversation
  → INSERT INTO daily_summaries (user_id, summary_text, agents_used)

On next session start:
  load_rolling_summaries()
  → SELECT FROM daily_summaries WHERE user_id=X AND last 5 days
  → Injected into agent system prompt as "## Conversation Context"
  → LLM knows what you discussed earlier this week
```

---

## 8. Patient Session Switching

**Files:** `frontend-next/components/dashboard/ChatInterface.tsx`,
`backend/app/routers/chat.py`, `backend/app/db/dynamo_chat.py`

```
Patient opens /dashboard/chat
    ↓
ChatInterface mounts → chatApi.sessions() → GET /api/chat/sessions
    ↓
dynamo_chat.list_sessions(user_id)
→ DynamoDB Query: PK=user_id, returns all sessions
→ Sorted by last_active DESC
    ↓
Sessions sidebar renders: title + relative time + message count
Auto-selects most recent session
    ↓
chatApi.history(session_id) → GET /api/chat/history/{session_id}
→ dynamo_chat.get_messages(session_id)
→ DynamoDB Query: PK=session_id, sorted by created_at ASC
    ↓
Messages render in chat area
RAG sources show as collapsible panel under AI messages
    ↓
Patient clicks "New Chat"
→ generateSessionId() → new UUID
→ No DB write yet (lazy — written only on first message)
    ↓
Patient clicks a different session
→ setActiveSessionId(session_id)
→ useEffect fires → loads that session's messages from DynamoDB
```

---

## 9. Appointment Booking + Razorpay Payment Flow

**Files:** `backend/app/agents/agent2_appointment.py`,
`backend/app/routers/appointments.py`,
`backend/app/services/payment_service.py`,
`frontend-next/app/dashboard/appointments/page.tsx`

### UI Booking Flow (5-step wizard at /dashboard/appointments)

```
Step 1 — Department
  Patient picks from 9 departments (Cardiology, Neurology, etc.)
      ↓
Step 2 — Doctor
  GET /api/doctors/list?department=Cardiology
  → SELECT FROM users WHERE role='doctor' AND specialization=X

Step 3 — Date & Time Slot
  GET /api/doctors/{id}/slots?date=2025-05-01
  → Generates 9am-5pm slots, marks booked ones unavailable

Step 4 — Confirm
  Patient reviews: department, doctor, time, fee = ₹1.00
  POST /api/appointments/book
  → INSERT INTO appointments (status='pending', payment_status='pending')
  → Returns appointment_id

Step 5 — Payment (Razorpay)
  See full payment flow below
```

### Razorpay Payment Flow (₹1 consultation fee)

```
FRONTEND — handleRazorpayPayment()  (appointments/page.tsx)
──────────────────────────────────────────────────────────────
1. POST /api/appointments/razorpay/create-order
   Body: { appointment_id }
       ↓
BACKEND — razorpay_create_order()  (appointments.py)
   payment_service.create_razorpay_order(amount_paise=100, receipt="appt_42")
       ↓
   IF RAZORPAY_KEY_ID is set:
     razorpay.Client.order.create({amount:100, currency:"INR"})
     → Razorpay creates order, returns order_id
   ELSE (mock mode — no key configured):
     Returns synthetic order_id: "order_MOCK_<random>"
       ↓
   Returns: { order_id, amount:100, currency:"INR",
              key_id, mock:true/false }

──────────────────────────────────────────────────────────────
2. FRONTEND — open payment UI
   IF mock=true:
     → Skip modal, call /verify directly with pay_MOCK_ ID
     → "Appointment confirmed! (dev mode)"

   IF mock=false:
     → Load checkout.js from https://checkout.razorpay.com/v1/checkout.js
     → new window.Razorpay({ key, amount, order_id, ... }).open()
     → Razorpay modal appears in browser
     → Patient pays ₹1 (test card: 4111 1111 1111 1111)
     → Razorpay calls handler({razorpay_payment_id,
                               razorpay_order_id,
                               razorpay_signature})

──────────────────────────────────────────────────────────────
3. POST /api/appointments/razorpay/verify
   Body: { appointment_id, order_id, payment_id, signature }
       ↓
BACKEND — razorpay_verify_payment()  (appointments.py)
   payment_service.verify_razorpay_signature(order_id, payment_id, signature)
   → HMAC-SHA256: expected = HMAC(KEY_SECRET, "{order_id}|{payment_id}")
   → compare_digest(expected, signature)
   → If mismatch → HTTP 400

   crud.update_appointment_payment(db, appointment_id,
     payment_status="paid",
     payment_reference=payment_id,
     confirmation_link="https://dashboard.razorpay.com/…")
   → UPDATE appointments SET
       status='confirmed',          ← appointment CONFIRMED
       payment_status='paid',
       payment_reference=<rzp_pay_id>,
       confirmation_link=<url>

   BackgroundTask: send_appointment_confirmation(email, name, dept, time, link)
   crud.log_audit(user_id, "payment_verified", "appointments", id)
   → Returns: { message: "Payment verified. Appointment confirmed!" }

──────────────────────────────────────────────────────────────
4. FRONTEND
   toast.success("Payment successful! Appointment confirmed.")
   setStep('list') → back to appointments list
   Appointment now shows: status=confirmed · payment_status=paid
```

### Mock mode (dev without Razorpay account)
Leave `RAZORPAY_KEY_ID` blank in `.env`. Clicking "Pay ₹1" auto-confirms the appointment — no modal, no real charge, useful for local development and testing.

### Chat-driven booking (Agent 2)
```
Patient types: "Book me a cardiology appointment for tomorrow"
    ↓
Intent → appointment → run_appointment_agent()
Agent guides via conversation: department → date → slot → confirm
Ends with: "Please complete payment at /dashboard/appointments"
```

---

## 10. Admin Flow — Complete Overview

**Files:** `backend/app/routers/admin.py`, `backend/app/routers/analytics.py`,
`frontend-next/app/admin/`

### Admin Dashboard (`/admin`)
```
3 parallel API calls on page load:

analyticsApi.dashboard()  →  GET /api/analytics/dashboard
→ SELECT COUNT(users WHERE role='patient')         → total_patients
→ SELECT COUNT(appointments WHERE date=today)      → appointments_today
→ crud.get_booking_conversion_rate()               → booking_conversion
→ SELECT COUNT(reviews WHERE category='high_risk') → high_risk_reviews_total
→ SELECT COUNT(blog_posts WHERE status='pending')  → pending_content_items

analyticsApi.activityTrend(7)  →  GET /api/analytics/activity
→ SELECT date, COUNT(appointments) GROUP BY date (last 7 days)
→ SELECT date, COUNT(users) GROUP BY date (last 7 days)
→ Powers the Area chart (Appointments + New Registrations per day)

analyticsApi.symptomTrends(30)  →  GET /api/analytics/symptoms/trends
→ crud.get_most_common_symptoms() (last 30 days)
→ Powers the Bar chart (Top symptoms by frequency)
```

### User Management (`/admin/users`)
```
GET /api/admin/users?role=patient  (admin.py line 20)
→ SELECT * FROM users WHERE role=? ORDER BY created_at DESC
→ Returns: id, username, email, full_name, age, gender,
           role, is_active, created_at
→ Role filter: all / patient / doctor / admin
→ Search: frontend filters by username / name / email
```

### Reviews Management (`/admin/reviews`)
```
GET /api/admin/reviews?category=high_risk  (admin.py line 57)
→ crud.get_reviews_by_category()
→ SELECT FROM reviews WHERE category=? LIMIT 50
→ Shows: reviewer, rating, text, AI reply, approve button

POST /api/admin/reviews/{id}/approve-reply
→ crud.approve_review_reply()
→ UPDATE reviews SET reply_approved=True
→ INSERT INTO audit_logs
```

### Blog Content (`/admin/blog`)
```
GET /api/blog/admin/all?status=pending
→ SELECT FROM blog_posts WHERE status=?

POST /api/blog/admin/{id}/approve
→ UPDATE blog_posts SET status='approved', approved_by, approved_at

POST /api/admin/content/{id}/reject
→ UPDATE blog_posts SET status='rejected'
→ INSERT INTO audit_logs

DELETE /api/blog/admin/{id}
→ DELETE FROM blog_posts WHERE id=?
```

### Notification Campaigns (`/admin/notifications`)
```
GET /api/admin/notifications/pending
→ SELECT FROM notification_campaigns WHERE status='pending'

POST /api/admin/notifications/{id}/approve
→ crud.approve_campaign()
→ UPDATE notification_campaigns SET status='approved'
    ↓
→ crud.get_patients_by_disease_keyword(disease_name)
  → SELECT users JOIN symptoms WHERE raw_text ILIKE '%diabetes%'
    ↓
→ Background task: _send_campaign_emails()
  → For each matching patient:
      send_patient_notification(email, name, subject, body)
      crud.log_notification() → INSERT INTO notification_logs
  → UPDATE notification_campaigns SET status='sent', sent_count=N
→ INSERT INTO audit_logs
```

---

## 11. Frontend Routing by Role

**Files:** `frontend-next/app/dashboard/layout.tsx`,
`frontend-next/components/dashboard/DashboardSidebar.tsx`

```
All routes protected by useAuthStore check in layout.tsx
If not authenticated → redirect to /login

Role-based navigation (DashboardSidebar.tsx):
  patient  → /dashboard/chat
             /dashboard/appointments
             /dashboard/history
             /dashboard/notifications

  doctor   → /dashboard/chat
             /dashboard/notifications
             /doctor

  admin    → /dashboard/chat
             + link to /admin panel

/admin routes:
  /admin                → overview + real charts from PostgreSQL
  /admin/users          → all users from PostgreSQL
  /admin/reviews        → reviews management
  /admin/blog           → content approval / rejection
  /admin/notifications  → campaign management + email send
```

---

## 12. What Goes Where — Complete Data Map

```
┌──────────────────────┬──────────────────────────────────────────────────┐
│ Storage              │ What it holds                                    │
├──────────────────────┼──────────────────────────────────────────────────┤
│ PostgreSQL           │ users, appointments (with razorpay_payment_id),  │
│                      │ reviews, blog_posts, notification_campaigns,      │
│                      │ notification_logs, symptoms, daily_summaries,     │
│                      │ audit_logs (payment_verified action logged here)  │
├──────────────────────┼──────────────────────────────────────────────────┤
│ DynamoDB             │ Chat sessions (title, timestamps, message_count) │
│                      │ Chat messages (content, role, RAG sources)       │
├──────────────────────┼──────────────────────────────────────────────────┤
│ Pinecone             │ 483k PubMed article chunks — read only           │
│                      │ Per-session chat vectors — written by memory     │
├──────────────────────┼──────────────────────────────────────────────────┤
│ Razorpay             │ Payment orders + transactions (external)         │
│                      │ Only order_id + payment_id stored locally        │
├──────────────────────┼──────────────────────────────────────────────────┤
│ RAM (Python dict)    │ Active session messages for current session      │
│                      │ (fast agent context — lost on server restart)    │
├──────────────────────┼──────────────────────────────────────────────────┤
│ localStorage         │ JWT access token (24h expiry)                   │
│ Zustand store        │ Current user object (id, role, name, email)     │
└──────────────────────┴──────────────────────────────────────────────────┘
```

## LLM Usage Map

Groq is no longer used. Everything runs on Anthropic.

```
┌──────────────────────────┬──────────────────────────────────────────────────┐
│ Purpose                  │ Model                         │ Why              │
├──────────────────────────┼───────────────────────────────┼──────────────────┤
│ Intent classification    │ claude-haiku-4-5-20251001     │ 20 tok, cheapest │
│ General responses        │ claude-sonnet-4-6             │ warm/helpful     │
│ Medical Agent (Agent 1)  │ claude-sonnet-4-6             │ complex RAG      │
│ Appointment Agent (2)    │ claude-sonnet-4-6             │ guided booking   │
│ Reputation Agent (3)     │ claude-sonnet-4-6             │ nuanced replies  │
│ Content Agent (4)        │ claude-sonnet-4-6 (temp=0.7)  │ creative writing │
│ Notification Agent (5)   │ claude-sonnet-4-6             │ email generation │
│ Rolling memory summaries │ claude-haiku-4-5-20251001     │ 300 tok, cheap   │
└──────────────────────────┴───────────────────────────────┴──────────────────┘
```

Config vars: `ANTHROPIC_MODEL` (Sonnet) · `ANTHROPIC_MODEL_FAST` (Haiku)

---

## 13. Razorpay Setup Guide

### Step 1 — Create a free Razorpay account
1. Go to **dashboard.razorpay.com** and sign up (free, no monthly fee)
2. You do not need to complete KYC to use test mode — test keys work immediately

### Step 2 — Get your API keys
1. Log in → **Settings** (left sidebar) → **API Keys**
2. Click **Generate Test Key**
3. Copy both values shown once:
   - **Key ID**: `rzp_test_XXXXXXXXXXXX`
   - **Key Secret**: `XXXXXXXXXXXXXXXXXXXXXXXXX`

### Step 3 — Add keys to `.env`
```env
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXX
```

### Step 4 — Rebuild the backend
```bash
docker-compose up --build
```

### Step 5 — Test the payment
Use these test card details in the Razorpay modal:
| Field | Value |
|---|---|
| Card number | `4111 1111 1111 1111` |
| Expiry | Any future date (e.g. `12/28`) |
| CVV | Any 3 digits (e.g. `123`) |
| OTP | `1234` |

Payment amount is **₹1** (100 paise). Test mode — no real charge.

### Step 6 — Verify in Razorpay dashboard
After a test payment: **Razorpay Dashboard → Payments** — you will see the ₹1 transaction with status `captured`.

### Going live (when you want real payments)
1. Complete KYC in Razorpay dashboard
2. Generate **Live** keys (same Settings → API Keys page, switch to Live)
3. Replace `rzp_test_*` keys in `.env` with `rzp_live_*` keys
4. Rebuild

---

## 14. Key File Reference

| Feature | Backend File | Frontend File |
|---|---|---|
| App startup | `backend/app/main.py` | — |
| All DB table definitions | `backend/app/db/models.py` | — |
| All DB queries (CRUD) | `backend/app/db/crud.py` | — |
| DynamoDB chat storage | `backend/app/db/dynamo_chat.py` | — |
| Auth (login / register) | `backend/app/routers/auth.py` | `app/(auth)/login/page.tsx` |
| JWT + role guards | `backend/app/core/security.py` | `store/useAuthStore.ts` |
| Chat API + session persist | `backend/app/routers/chat.py` | `components/dashboard/ChatInterface.tsx` |
| Intent routing | `backend/app/agents/master_agent.py` | — |
| Medical RAG agent (Claude) | `backend/app/agents/agent1_medical.py` | — |
| Appointment agent | `backend/app/agents/agent2_appointment.py` | `app/dashboard/appointments/page.tsx` |
| Reputation agent | `backend/app/agents/agent3_reputation.py` | — |
| Content agent | `backend/app/agents/agent4_content.py` | `app/admin/blog/page.tsx` |
| Notification agent | `backend/app/agents/agent5_notification.py` | `app/admin/notifications/page.tsx` |
| Pinecone + BioBERT + reranker | `backend/app/vector_store/pinecone_store.py` | — |
| Medical LangChain tools | `backend/app/tools/medical_tools.py` | — |
| In-process memory | `backend/app/memory/session_memory.py` | — |
| Rolling 5-day memory | `backend/app/memory/rolling_summary.py` | — |
| Admin endpoints | `backend/app/routers/admin.py` | `app/admin/` |
| Analytics endpoints | `backend/app/routers/analytics.py` | `app/admin/page.tsx` |
| Appointments + Razorpay API | `backend/app/routers/appointments.py` | `app/dashboard/appointments/page.tsx` |
| Razorpay service | `backend/app/services/payment_service.py` | — |
| Blog / News API | `backend/app/routers/blog.py` | `app/blog/page.tsx` |
| Doctors API | `backend/app/routers/doctors.py` | `app/doctor/page.tsx` |
| All API calls | — | `lib/api.ts` |
| TypeScript types | — | `types/index.ts` |
| Settings / env vars | `backend/app/core/config.py` | — |
| Docker setup | `docker-compose.yml` | — |
