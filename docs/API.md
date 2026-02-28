# API Reference

Base URL: `http://localhost:3000`

## Upload

### POST /api/upload
Upload a CSV file to trigger the autonomous agent workflow.

**Content-Type:** `multipart/form-data`
**Body:** `file` — CSV file (required)

**Response:**
```json
{
  "success": true,
  "message": "Workflow completed successfully.",
  "summary": {
    "traceId": "tr_m2abc_1f2e3a4b",
    "totalRows": 20,
    "validLeads": 20,
    "duplicatesSkipped": 0,
    "insertedLeads": 20,
    "analyzedLeads": 20,
    "analysisErrors": 0,
    "validationErrors": [],
    "duration": 1250
  }
}
```

---

## Leads

### GET /api/leads
Paginated lead list with optional filters.

| Param | Type | Description |
|-------|------|-------------|
| page | int | Page number (default: 1) |
| limit | int | Items per page (default: 20) |
| intent | string | Filter: high, medium, low, not_interested |
| source | string | Filter by lead_source |
| state | string | Filter: pending, message_sent, replied, ignored, opted_out |
| dateFrom | date | Filter: last_interaction_date >= |
| dateTo | date | Filter: last_interaction_date <= |

### GET /api/leads/:id
Single lead with full message history.

---

## Analytics

### GET /api/analytics
Aggregated KPIs: totalLeads, messagesSent, replies, ignored, optedOut, replyRate, intentBreakdown, stateBreakdown, sourceBreakdown.

### GET /api/analytics/reply-times
Reply time distribution in hours.

### GET /api/sources
Distinct lead sources for filter dropdowns.

---

## Observability

### GET /api/metrics
Returns counters, histograms with percentiles (p50/p95/p99), and the 20 most recent trace records including spans.

---

## Export

### GET /api/export
Downloads all leads as a CSV file.

---

## Webhooks

### POST /api/webhooks/twilio/inbound
Receives inbound SMS from Twilio. Auto-detects opt-out keywords.

### POST /api/webhooks/twilio/status
Receives delivery status callbacks from Twilio.
