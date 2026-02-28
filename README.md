<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Gemini_AI-2.0_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/Claude-Sonnet_4-CC785C?style=for-the-badge&logo=anthropic&logoColor=white" />
  <img src="https://img.shields.io/badge/Twilio-SMS-F22F46?style=for-the-badge&logo=twilio&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" />
</p>

# 🤖 Lead Reactivation Agent — Autonomous AI

> **Enterprise-grade autonomous AI agent** that reactivates dormant sales leads using multi-LLM reasoning (Gemini + Claude failover), Twilio SMS, human-in-the-loop escalation, and a real-time analytics dashboard.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🧠 **Multi-LLM AI Engine** | Google Gemini 2.0 Flash (primary) + Anthropic Claude (failover) with circuit breaker pattern |
| 📱 **Twilio SMS Integration** | Automated outbound messaging, inbound reply handling, opt-out detection, delivery status tracking |
| 📊 **Real-Time Dashboard** | Enterprise-grade 6-tab dashboard with KPIs, charts, filters, and CSV export |
| 🔄 **Lead State Machine** | Full lifecycle tracking: `idle → pending → message_sent → replied/ignored/opted_out` |
| 🛡️ **Human-in-the-Loop (HITL)** | Low-confidence AI decisions are escalated for human review |
| 💰 **Cost Analytics** | Per-lead and per-conversion cost tracking for SMS and AI calls |
| 🧪 **LLM-as-a-Judge Eval Suite** | Automated evaluation of intent accuracy, message quality, tone, and prompt injection resistance |
| 📡 **Observability & Tracing** | Full request tracing with spans, counters, histograms (p50/p95/p99), and a metrics endpoint |
| 📋 **RAG Context Injection** | Business context retrieval for personalized message generation |
| ⏰ **Business Hours Enforcement** | SMS scheduling respects configured business hours |

---

## 🏗️ Architecture

```
lead-reactivation-agent/
├── server.js                    # Bootstrap entry point
├── config.js                    # Centralized configuration
├── public/                      # Dashboard UI (HTML/CSS/JS)
│   ├── index.html               # Main dashboard page
│   ├── styles.css               # Dashboard styles (dark theme, glassmorphism)
│   └── app.js                   # Dashboard logic (Chart.js, real-time updates)
├── src/
│   ├── ai/                      # LLM providers & orchestration
│   │   ├── providers/           # GeminiProvider, ClaudeProvider
│   │   └── AIRouter.js          # Multi-LLM routing with circuit breaker
│   ├── controllers/             # Express route handlers
│   │   ├── LeadController.js
│   │   ├── AnalyticsController.js
│   │   ├── EscalationController.js
│   │   ├── EvalController.js
│   │   └── WebhookController.js
│   ├── data/                    # Database setup & migrations
│   ├── eval/                    # LLM-as-a-Judge evaluation suite
│   ├── ingestion/               # CSV parsing & validation
│   ├── messaging/               # Twilio SMS, scheduler, webhooks
│   ├── orchestrator/            # End-to-end workflow orchestration
│   ├── queues/                  # BullMQ job queue (Redis-backed)
│   ├── repositories/            # Data access layer (SQLite)
│   ├── services/                # Business logic layer
│   ├── state/                   # Lead state machine
│   └── utils/                   # Logger, tracing, helpers
├── data/
│   ├── sample_leads.csv         # Sample dataset (20 leads)
│   ├── business_context.json    # RAG knowledge base
│   └── goldenDataset.json       # Eval suite test cases
└── docs/
    ├── ARCHITECTURE.md          # System design & diagrams
    └── API.md                   # REST API reference
```

### Agent Pipeline

```
CSV Upload → Parse & Validate → Deduplicate → Store in SQLite
    → AI Analysis (Intent + SMS Generation) → Schedule SMS
    → Send via Twilio → Track Delivery → Handle Replies
    → Update State Machine → Dashboard Analytics
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ 
- **npm** 9+

### 1. Clone & Install

```bash
git clone https://github.com/muhammad-umair-aideveloper/lead-reactivation-agent.git
cd lead-reactivation-agent
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | For AI | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Optional | Claude failover key |
| `TWILIO_ACCOUNT_SID` | For SMS | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | For SMS | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | For SMS | Twilio phone number |
| `DRY_RUN` | — | Set `true` for safe testing (no real SMS/AI) |

> **💡 Tip:** Start with `DRY_RUN=true` to explore the full system without any API keys.

### 3. Start the Agent

```bash
npm start
```

### 4. Open the Dashboard

Navigate to **http://localhost:3000** in your browser.

---

## 📊 Dashboard

The enterprise dashboard includes **6 specialized tabs**:

| Tab | Purpose |
|-----|---------|
| **Overview** | KPIs (total leads, messages sent, reply rate), intent/state/source charts, CSV upload |
| **HITL Escalations** | Review low-confidence AI decisions, approve/dismiss escalated leads |
| **Cost Analytics** | Total spend, per-lead cost, per-conversion cost, daily spend chart |
| **Eval Suite** | Intent accuracy, message quality scores, tone analysis, injection resistance |
| **AI Traces** | LLM reasoning step-by-step logs for debugging and auditing |
| **System** | Uptime, memory/CPU usage, latency, connection status |

**Features:** Global filters (intent, source, state, date range) • CSV export • Real-time auto-refresh • Dark theme with glassmorphism

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload CSV to trigger autonomous workflow |
| `GET` | `/api/leads` | Paginated leads with filters |
| `GET` | `/api/leads/:id` | Lead detail + message history |
| `GET` | `/api/analytics` | Aggregated KPIs & breakdowns |
| `GET` | `/api/analytics/reply-times` | Reply time distribution |
| `GET` | `/api/sources` | Distinct lead sources |
| `GET` | `/api/metrics` | Observability: counters, histograms, traces |
| `GET` | `/api/export` | CSV export of all leads |
| `POST` | `/api/webhooks/twilio/inbound` | Inbound SMS webhook |
| `POST` | `/api/webhooks/twilio/status` | Delivery status callback |
| `GET` | `/api/escalations` | List HITL escalations |
| `POST` | `/api/escalations/:id/resolve` | Resolve an escalation |
| `POST` | `/api/eval/run` | Trigger LLM evaluation run |
| `GET` | `/api/eval/latest` | Latest eval results |
| `GET` | `/health` | Health check endpoint |

> 📖 Full API documentation: [docs/API.md](docs/API.md)

---

## 🧠 AI Engine

The agent uses a **multi-LLM architecture** with automatic failover:

```
Request → AIRouter → GeminiProvider (primary)
                   ↘ ClaudeProvider  (failover, circuit breaker)
```

- **Intent Classification**: `high_interest`, `medium_interest`, `low_interest`, `not_interested`
- **RAG Context**: Injects business-specific context from `data/business_context.json`
- **Confidence Scoring**: Low-confidence results trigger HITL escalation
- **DRY_RUN Mode**: Returns mock AI responses for safe development

---

## 🔄 Lead State Machine

```
┌─────────┐     CSV Upload     ┌─────────┐     SMS Sent      ┌──────────────┐
│   idle   │ ──────────────► │ pending │ ──────────────► │ message_sent │
└─────────┘                  └─────────┘                  └──────┬───────┘
                                                                  │
                                          ┌───────────────────────┼───────────────────────┐
                                          │                       │                       │
                                          ▼                       ▼                       ▼
                                   ┌──────────┐           ┌──────────┐           ┌────────────┐
                                   │ replied  │           │ ignored  │           │ opted_out  │
                                   └──────────┘           └──────────┘           └────────────┘
                                   (Inbound Reply)        (72h Timeout)          (STOP keyword)
```

---

## 🧪 Evaluation Suite

Run the LLM-as-a-Judge evaluation suite:

```bash
npm run eval
```

Or trigger via the dashboard's **Eval Suite** tab / API:

```bash
curl -X POST http://localhost:3000/api/eval/run
```

Evaluates:
- ✅ Intent classification accuracy
- ✅ Message quality scoring
- ✅ Tone appropriateness
- ✅ Prompt injection resistance

---

## 📡 Observability

### Metrics Endpoint

```bash
curl http://localhost:3000/api/metrics
```

Returns:
- **Counters**: `workflow.started`, `workflow.completed`, `ai.intent.*`, `http.requests.*`
- **Histograms**: `workflow.duration_ms`, `ai.analysis.duration_ms` with p50/p95/p99 percentiles
- **Recent Traces**: Last 20 workflow traces with nested spans

---

## 🛡️ Security

- **Helmet.js** for HTTP security headers
- **CORS** enabled
- **Content Security Policy** configured
- **DRY_RUN** mode prevents accidental production SMS
- **Business hours** enforcement
- **Opt-out detection** (STOP, UNSUBSCRIBE, etc.)

---

## 📝 License

This project is licensed under the **MIT License**.

---

<p align="center">
  <b>Built with ❤️ by <a href="https://github.com/muhammad-umair-aideveloper">Muhammad Umair</a></b>
</p>
