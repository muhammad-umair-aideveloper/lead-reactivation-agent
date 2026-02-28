/**
 * LeadRepository — All lead-related database queries
 */
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const logger = require('../utils/logger');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'agent.db');
let db;

function getDb() {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeDatabase() {
  const conn = getDb();
  const schema = fs.readFileSync(path.join(__dirname, '..', 'data', 'schema.sql'), 'utf-8');
  conn.exec(schema);
  logger.info(`SQLite database initialized at ${DB_PATH}`);
}

// ── Lead CRUD ────────────────────────────────

function insertLead(lead) {
  const conn = getDb();
  const stmt = conn.prepare(`
    INSERT OR IGNORE INTO leads (lead_id, full_name, phone_number, email, last_interaction_date, lead_source, notes, state)
    VALUES (@lead_id, @full_name, @phone_number, @email, @last_interaction_date, @lead_source, @notes, 'idle')
  `);
  return stmt.run(lead);
}

function insertLeadsBatch(leads) {
  const conn = getDb();
  const stmt = conn.prepare(`
    INSERT OR IGNORE INTO leads (lead_id, full_name, phone_number, email, last_interaction_date, lead_source, notes, state)
    VALUES (@lead_id, @full_name, @phone_number, @email, @last_interaction_date, @lead_source, @notes, 'idle')
  `);
  const tx = conn.transaction((items) => {
    let inserted = 0;
    for (const item of items) {
      const result = stmt.run(item);
      inserted += result.changes;
    }
    return inserted;
  });
  return tx(leads);
}

function updateLeadAI(leadId, aiResult) {
  const conn = getDb();
  const stmt = conn.prepare(`
    UPDATE leads SET
      intent_category = @intent_category,
      intent_rationale = @intent_rationale,
      recommended_angle = @recommended_angle,
      sms_body = @sms_body,
      tone = @tone,
      confidence_score = @confidence_score,
      llm_provider = @llm_provider,
      updated_at = datetime('now')
    WHERE lead_id = @lead_id
  `);
  return stmt.run({
    lead_id: leadId,
    confidence_score: aiResult.confidence_score || null,
    llm_provider: aiResult.llm_provider || null,
    ...aiResult,
  });
}

function updateLeadState(leadId, newState) {
  const conn = getDb();
  const stmt = conn.prepare(`
    UPDATE leads SET state = ?, updated_at = datetime('now') WHERE lead_id = ?
  `);
  return stmt.run(newState, leadId);
}

function getLeadById(leadId) {
  return getDb().prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId);
}

function getLeadByPhone(phone) {
  return getDb().prepare('SELECT * FROM leads WHERE phone_number = ?').get(phone);
}

function getLeadsByState(state) {
  return getDb().prepare('SELECT * FROM leads WHERE state = ?').all(state);
}

function getIdleAnalyzedLeads() {
  return getDb().prepare(`
    SELECT * FROM leads WHERE state = 'idle' AND intent_category IS NOT NULL AND sms_body IS NOT NULL
  `).all();
}

function getIdleUnanalyzedLeads() {
  return getDb().prepare(`
    SELECT * FROM leads WHERE state = 'idle' AND intent_category IS NULL
  `).all();
}

function getLeadsPaginated({ page = 1, limit = 20, intent, source, state, dateFrom, dateTo }) {
  const conn = getDb();
  let where = [];
  let params = {};

  if (intent) { where.push('intent_category = @intent'); params.intent = intent; }
  if (source) { where.push('lead_source = @source'); params.source = source; }
  if (state) { where.push('state = @state'); params.state = state; }
  if (dateFrom) { where.push('last_interaction_date >= @dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { where.push('last_interaction_date <= @dateTo'); params.dateTo = dateTo; }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const countRow = conn.prepare(`SELECT COUNT(*) as total FROM leads ${whereClause}`).get(params);
  const rows = conn.prepare(`SELECT * FROM leads ${whereClause} ORDER BY updated_at DESC LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset });

  return { leads: rows, total: countRow.total, page, limit, totalPages: Math.ceil(countRow.total / limit) };
}

function getTimedOutLeads(timeoutHours) {
  const conn = getDb();
  return conn.prepare(`
    SELECT l.* FROM leads l
    JOIN message_log ml ON l.lead_id = ml.lead_id AND ml.direction = 'outbound'
    WHERE l.state = 'contacted'
    AND (julianday('now') - julianday(ml.sent_at)) * 24 > ?
  `).all(timeoutHours);
}

function getAllLeadsForExport() {
  return getDb().prepare(`
    SELECT lead_id, full_name, phone_number, email, last_interaction_date, lead_source, notes,
           intent_category, intent_rationale, recommended_angle, sms_body, tone, confidence_score,
           llm_provider, state, created_at, updated_at
    FROM leads ORDER BY created_at
  `).all();
}

function getDistinctSources() {
  return getDb().prepare('SELECT DISTINCT lead_source FROM leads ORDER BY lead_source').all().map(r => r.lead_source);
}

module.exports = {
  getDb,
  initializeDatabase,
  insertLead,
  insertLeadsBatch,
  updateLeadAI,
  updateLeadState,
  getLeadById,
  getLeadByPhone,
  getLeadsByState,
  getIdleAnalyzedLeads,
  getIdleUnanalyzedLeads,
  getLeadsPaginated,
  getTimedOutLeads,
  getAllLeadsForExport,
  getDistinctSources,
};
