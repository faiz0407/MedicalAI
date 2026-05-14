# System Architecture — HealthcareAI Unified Agentic System

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React Frontend (Vite)                        │
│  Chat UI │ Admin Dashboard │ Review Panel │ Blog Panel │ Notif Panel│
└──────────────────────────────┬──────────────────────────────────────┘
                               │  REST API (JWT Auth)
┌──────────────────────────────▼──────────────────────────────────────┐
│                      FastAPI Backend                                 │
│  /api/auth │ /api/chat │ /api/admin │ /api/analytics │ /api/appts  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                        MasterAgent                                   │
│                                                                      │
│   User Message                                                       │
│        │                                                             │
│   Intent Classifier (Groq LLM)                                      │
│        │                                                             │
│   ┌────▼────────────────────────────────────────────────────────┐   │
│   │                    Tool Router                               │   │
│   └────┬──────┬──────┬──────┬──────┬──────────────────────────┘    │
│        │      │      │      │      │                                 │
│      Agent1 Agent2 Agent3 Agent4 Agent5                             │
│        │      │      │      │      │                                 │
│    Medical  Appt  Reputa Content Notif                               │
│   Guidance  Book  Mgmt   Gen     Alert                               │
└──────────────────────────────────────────────────────────────────────┘
                               │
         ┌─────────────────────┼──────────────────────┐
         │                     │                      │
┌────────▼──────┐   ┌──────────▼────────┐  ┌─────────▼──────┐
│  PostgreSQL   │   │     Pinecone       │  │  Session       │
│  (Main DB)    │   │  (Vector Store)    │  │  Memory        │
│               │   │   Medical RAG      │  │  5-Day Rolling │
└───────────────┘   └───────────────────┘  └────────────────┘
```

## Component Responsibilities

### MasterAgent
- Single entry point for all user messages
- Uses Groq LLM for intent classification (6 intents)
- Routes to appropriate sub-agent
- Handles cross-agent transitions (medical → appointment)
- Maintains conversation context

### Intent Detection (6 Categories)
| Intent | Trigger Examples |
|--------|-----------------|
| `medical_guidance` | "I have a headache", "symptoms", "home remedies" |
| `appointment` | "book", "schedule", "reschedule", "feedback" |
| `reputation` | "reviews", "ratings", "Google reviews" |
| `content_generation` | "write blog", "social media post", "AI in healthcare" |
| `notification` | "notify patients", "new treatment", "drug update" |
| `general` | Greetings, general questions |

### Memory Architecture
```
Short-term (In-Process):
  session_id → [message history]  (last 20 messages per session)

Medium-term (PostgreSQL):
  user_id → [DailySummary × 5 days]  (5-day rolling context)

Persistence:
  All messages saved to chat_messages table (async background task)
```

### Tool Access Control
```
Patient:  medical_tools, appointment_tools
Doctor:   medical_tools, appointment_tools, notification_tools
Admin:    ALL tools
```

## Database Schema

```sql
users              -- Authentication + profile
symptoms           -- Reported symptoms per session
appointments       -- Bookings + payment + feedback
reviews            -- Google reviews + AI replies
blog_posts         -- Generated content pending approval
notification_campaigns  -- Treatment alerts pending send
notification_logs  -- Sent email audit trail
daily_summaries    -- Rolling 5-day memory
audit_logs         -- All admin actions
chat_sessions      -- Session metadata
chat_messages      -- Full conversation history
```

## Security Model
- JWT HS256 tokens (24-hour expiry)
- BCrypt password hashing
- Role-based access control (patient/doctor/admin)
- Prompt injection filtering on all user inputs
- All LLM outputs stored for audit
- Manual approval gates for: review replies, content, notifications

## API Endpoints

### Auth
```
POST /api/auth/register    -- New user registration
POST /api/auth/token       -- Login (OAuth2 form)
GET  /api/auth/me          -- Current user profile
PUT  /api/auth/me/profile  -- Update profile
```

### Chat
```
POST /api/chat/message              -- Send message to MasterAgent
GET  /api/chat/history/{session_id} -- Get session history
POST /api/chat/session/{id}/summarise -- Trigger daily summary
```

### Appointments
```
POST /api/appointments/book              -- Book appointment
POST /api/appointments/pay               -- Process payment
GET  /api/appointments/my               -- Patient's appointments
POST /api/appointments/{id}/feedback    -- Submit feedback
PUT  /api/appointments/{id}/status      -- Doctor updates status
```

### Admin
```
GET  /api/admin/reviews                            -- List reviews by category
POST /api/admin/reviews/{id}/approve-reply         -- Approve AI reply
GET  /api/admin/content/pending                    -- List pending content
POST /api/admin/content/{id}/approve               -- Approve content
GET  /api/admin/notifications/pending              -- List pending campaigns
POST /api/admin/notifications/{id}/approve-and-send -- Approve + send
GET  /api/admin/audit-logs                         -- Audit log viewer
```

### Analytics
```
GET /api/analytics/dashboard          -- KPI summary
GET /api/analytics/symptoms/trends   -- Top symptoms chart data
GET /api/analytics/reviews/sentiment -- Sentiment breakdown
GET /api/analytics/appointments/stats -- Booking stats
```
