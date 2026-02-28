require('dotenv').config();

const config = {
  // ── Server ──────────────────────────────────
  port: parseInt(process.env.PORT, 10) || 3000,

  // ── Gemini AI ───────────────────────────────
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  },

  // ── Claude (Backup LLM) ────────────────────
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  },

  // ── LLM Provider Strategy ──────────────────
  llm: {
    primary: process.env.LLM_PRIMARY || 'gemini',
    failoverEnabled: (process.env.LLM_FAILOVER_ENABLED || 'true').toLowerCase() === 'true',
    circuitBreaker: {
      failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD, 10) || 5,
      resetTimeoutMs: parseInt(process.env.CB_RESET_TIMEOUT_MS, 10) || 60000,
    },
  },

  // ── Twilio ──────────────────────────────────
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },

  // ── Webhooks ────────────────────────────────
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL || 'http://localhost:3000',

  // ── Redis / BullMQ ─────────────────────────
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    maxRetriesPerRequest: null,
  },

  // ── Safety ──────────────────────────────────
  dryRun: (process.env.DRY_RUN || 'true').toLowerCase() === 'true',

  // ── Business Hours ──────────────────────────
  businessHours: {
    start: parseInt(process.env.BUSINESS_HOURS_START, 10) || 9,
    end: parseInt(process.env.BUSINESS_HOURS_END, 10) || 17,
  },

  // ── Lead Timeout ────────────────────────────
  leadTimeoutHours: parseInt(process.env.LEAD_TIMEOUT_HOURS, 10) || 72,

  // ── AI Concurrency ─────────────────────────
  aiConcurrency: parseInt(process.env.AI_CONCURRENCY, 10) || 5,

  // ── Retry Settings ─────────────────────────
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1000,
  },

  // ── HITL Escalation ────────────────────────
  hitl: {
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.8,
    autoEscalateIntents: ['not_interested'],
  },

  // ── Cost Tracking ──────────────────────────
  cost: {
    perSmsCents: parseFloat(process.env.COST_PER_SMS_CENTS) || 0.79,
    perAiCallCents: parseFloat(process.env.COST_PER_AI_CALL_CENTS) || 0.10,
  },

  // ── RAG / Vector Memory ────────────────────
  rag: {
    contextFile: process.env.RAG_CONTEXT_FILE || 'data/business_context.json',
    topK: parseInt(process.env.RAG_TOP_K, 10) || 3,
    similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD) || 0.3,
  },
};

// ── Validation ──────────────────────────────
function validateConfig() {
  const warnings = [];

  if (!config.gemini.apiKey) {
    warnings.push('GEMINI_API_KEY is not set — AI analysis will use mock responses in DRY_RUN mode.');
  }
  if (!config.claude.apiKey) {
    warnings.push('ANTHROPIC_API_KEY is not set — Claude failover is disabled.');
  }
  if (!config.twilio.accountSid || !config.twilio.authToken) {
    warnings.push('Twilio credentials are not set — SMS sending will use DRY_RUN mode.');
  }
  if (!config.twilio.phoneNumber) {
    warnings.push('TWILIO_PHONE_NUMBER is not set.');
  }

  return warnings;
}

config.validate = validateConfig;

module.exports = config;
