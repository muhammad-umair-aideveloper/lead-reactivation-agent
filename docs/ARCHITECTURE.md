# System Architecture

## Overview

The Lead Reactivation Agent is a modular, autonomous AI system that processes dormant leads through a multi-stage pipeline: **Ingest → Analyze → Message → Track → Visualize**.

```mermaid
graph TB
    subgraph Input
        CSV[CSV Upload] --> ING[Ingestion Pipeline]
    end

    subgraph Processing
        ING --> VAL[Validator] --> DB[(SQLite)]
        DB --> AI[Gemini AI Engine]
        AI --> |Intent + SMS| DB
    end

    subgraph Messaging
        SCHED[Scheduler Cron] --> |Business Hours| TWILIO[Twilio SMS API]
        DB --> SCHED
        TWILIO --> |Status Callback| WH[Webhook Handler]
        WH --> SM[State Machine]
        SM --> DB
    end

    subgraph Observability
        TRACE[Tracing Module] --> METRICS[/api/metrics/]
        TRACE -.-> ING
        TRACE -.-> AI
        TRACE -.-> SCHED
    end

    subgraph Dashboard
        API[REST API] --> UI[Web Dashboard]
        DB --> API
    end
```

## Agent Workflow Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant API as Express API
    participant ORC as Orchestrator
    participant CSV as CSV Parser
    participant VAL as Validator
    participant DB as SQLite
    participant AI as Gemini AI
    participant SCH as Scheduler
    participant TW as Twilio

    U->>API: POST /api/upload (CSV)
    API->>ORC: executeWorkflow(csvData)
    ORC->>CSV: parseCSV()
    CSV->>VAL: validateLead() per row
    VAL-->>ORC: { leads, errors }
    ORC->>DB: insertLeadsBatch()
    loop For each lead (concurrency=5)
        ORC->>AI: analyzeLead(lead)
        AI-->>ORC: { intent, sms_body, tone }
        ORC->>DB: updateLeadAI()
    end
    ORC-->>API: summary + traceId

    Note over SCH: Cron: every minute
    SCH->>DB: getPendingAnalyzedLeads()
    loop Each lead (rate-limited)
        SCH->>TW: sendSMS()
        TW-->>SCH: { sid, status }
        SCH->>DB: insertMessageLog()
        SCH->>DB: updateState → message_sent
    end

    TW->>API: POST /webhooks/twilio/inbound
    API->>DB: updateState → replied/opted_out
```

## Lead State Machine

```mermaid
stateDiagram-v2
    [*] --> pending: CSV Uploaded
    pending --> message_sent: SMS Sent
    message_sent --> replied: Inbound Reply
    message_sent --> ignored: Timeout (72h)
    message_sent --> opted_out: STOP keyword
    replied --> [*]
    ignored --> [*]
    opted_out --> [*]
```

## Data Model

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `leads` | lead_id (PK), full_name, phone_number, intent_category, sms_body, state | Lead lifecycle |
| `message_log` | id (PK), lead_id (FK), twilio_sid, direction, body, intent_score | Audit trail |

## Observability

- **Trace Contexts**: Each workflow run gets a unique `traceId` with nested spans per stage
- **Spans**: `csv_parse`, `deduplication`, `db_insert`, `ai_analysis`, `ai_batch`, `ai_lead_analysis`
- **Counters**: `workflow.started`, `workflow.completed`, `ai.intent.*`, `http.requests.*`
- **Histograms**: `workflow.duration_ms`, `ai.analysis.duration_ms`, `http.request.duration_ms`
- **Endpoint**: `GET /api/metrics` returns counters, histograms (with p50/p95/p99), and recent traces

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/upload | CSV upload → triggers workflow |
| GET | /api/leads | Paginated lead list with filters |
| GET | /api/leads/:id | Lead detail + message history |
| GET | /api/analytics | Aggregated KPIs |
| GET | /api/analytics/reply-times | Reply time distribution |
| GET | /api/sources | Distinct lead sources |
| GET | /api/metrics | Observability: counters, histograms, traces |
| GET | /api/export | CSV export of all leads |
| POST | /api/webhooks/twilio/inbound | Inbound SMS webhook |
| POST | /api/webhooks/twilio/status | Delivery status callback |
