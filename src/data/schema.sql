-- Lead Reactivation Agent v2 — Enterprise Schema
-- States: idle → contacted → replied → escalated

CREATE TABLE IF NOT EXISTS leads (
  lead_id           TEXT PRIMARY KEY,
  full_name         TEXT NOT NULL,
  phone_number      TEXT NOT NULL,
  email             TEXT,
  last_interaction_date TEXT NOT NULL,
  lead_source       TEXT NOT NULL,
  notes             TEXT,
  intent_category   TEXT CHECK(intent_category IN ('high','medium','low','not_interested')),
  intent_rationale  TEXT,
  recommended_angle TEXT,
  sms_body          TEXT,
  tone              TEXT,
  confidence_score  REAL,
  llm_provider      TEXT,
  state             TEXT NOT NULL DEFAULT 'idle'
                    CHECK(state IN ('idle','contacted','replied','escalated')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id           TEXT NOT NULL REFERENCES leads(lead_id),
  twilio_sid        TEXT,
  direction         TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
  body              TEXT,
  intent_score      TEXT,
  message_variant   TEXT,
  sent_at           TEXT NOT NULL DEFAULT (datetime('now')),
  status            TEXT DEFAULT 'queued'
);

CREATE TABLE IF NOT EXISTS escalation_tasks (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id           TEXT NOT NULL REFERENCES leads(lead_id),
  reason            TEXT NOT NULL,
  confidence_score  REAL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','resolved','dismissed')),
  resolution_notes  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at       TEXT
);

CREATE TABLE IF NOT EXISTS cost_tracking (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id           TEXT REFERENCES leads(lead_id),
  event_type        TEXT NOT NULL,
  provider          TEXT,
  cost_cents        REAL NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eval_results (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id            TEXT NOT NULL,
  dataset_index     INTEGER,
  scenario_name     TEXT,
  expected_intent   TEXT,
  actual_intent     TEXT,
  confidence_score  REAL,
  tone_score        REAL,
  injection_resistant INTEGER DEFAULT 1,
  quality_score     REAL,
  judge_reasoning   TEXT,
  sms_generated     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reasoning_traces (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id          TEXT NOT NULL UNIQUE,
  lead_id           TEXT REFERENCES leads(lead_id),
  provider          TEXT,
  prompt_hash       TEXT,
  raw_response      TEXT,
  parsed_intent     TEXT,
  confidence_score  REAL,
  decision          TEXT,
  duration_ms       INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS state_audit_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id           TEXT NOT NULL REFERENCES leads(lead_id),
  from_state        TEXT NOT NULL,
  to_state          TEXT NOT NULL,
  trigger_event     TEXT,
  metadata          TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_intent ON leads(intent_category);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_message_log_lead ON message_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_escalation_status ON escalation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_cost_lead ON cost_tracking(lead_id);
CREATE INDEX IF NOT EXISTS idx_eval_run ON eval_results(run_id);
CREATE INDEX IF NOT EXISTS idx_traces_lead ON reasoning_traces(lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_lead ON state_audit_log(lead_id);
