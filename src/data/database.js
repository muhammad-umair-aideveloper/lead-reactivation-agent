/**
 * Database layer — SQLite via better-sqlite3
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
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    conn.exec(schema);
    logger.info(`SQLite database initialized at ${DB_PATH}`);
}

// ── Lead CRUD ────────────────────────────────

function insertLead(lead) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT OR IGNORE INTO leads (lead_id, full_name, phone_number, email, last_interaction_date, lead_source, notes, state)
    VALUES (@lead_id, @full_name, @phone_number, @email, @last_interaction_date, @lead_source, @notes, 'pending')
  `);
    return stmt.run(lead);
}

function insertLeadsBatch(leads) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT OR IGNORE INTO leads (lead_id, full_name, phone_number, email, last_interaction_date, lead_source, notes, state)
    VALUES (@lead_id, @full_name, @phone_number, @email, @last_interaction_date, @lead_source, @notes, 'pending')
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
      updated_at = datetime('now')
    WHERE lead_id = @lead_id
  `);
    return stmt.run({ lead_id: leadId, ...aiResult });
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

function getPendingAnalyzedLeads() {
    return getDb().prepare(`
    SELECT * FROM leads WHERE state = 'pending' AND intent_category IS NOT NULL AND sms_body IS NOT NULL
  `).all();
}

function getPendingUnanalyzedLeads() {
    return getDb().prepare(`
    SELECT * FROM leads WHERE state = 'pending' AND intent_category IS NULL
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

// ── Message Log ──────────────────────────────

function insertMessageLog(entry) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT INTO message_log (lead_id, twilio_sid, direction, body, intent_score, message_variant, sent_at, status)
    VALUES (@lead_id, @twilio_sid, @direction, @body, @intent_score, @message_variant, datetime('now'), @status)
  `);
    return stmt.run(entry);
}

function getMessagesByLeadId(leadId) {
    return getDb().prepare('SELECT * FROM message_log WHERE lead_id = ? ORDER BY sent_at DESC').all(leadId);
}

function updateMessageStatus(twilioSid, status) {
    const conn = getDb();
    return conn.prepare('UPDATE message_log SET status = ? WHERE twilio_sid = ?').run(status, twilioSid);
}

function insertInboundMessage(leadId, body) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT INTO message_log (lead_id, direction, body, sent_at, status)
    VALUES (?, 'inbound', ?, datetime('now'), 'received')
  `);
    return stmt.run(leadId, body);
}

// ── Analytics ────────────────────────────────

function getAnalytics() {
    const conn = getDb();

    const totals = conn.prepare(`
    SELECT
      COUNT(*) as totalLeads,
      SUM(CASE WHEN state IN ('message_sent','replied','ignored','opted_out') THEN 1 ELSE 0 END) as messagesSent,
      SUM(CASE WHEN state = 'replied' THEN 1 ELSE 0 END) as replies,
      SUM(CASE WHEN state = 'ignored' THEN 1 ELSE 0 END) as ignored,
      SUM(CASE WHEN state = 'opted_out' THEN 1 ELSE 0 END) as optedOut
    FROM leads
  `).get();

    const intentBreakdown = conn.prepare(`
    SELECT intent_category, COUNT(*) as count
    FROM leads
    WHERE intent_category IS NOT NULL
    GROUP BY intent_category
  `).all();

    const stateBreakdown = conn.prepare(`
    SELECT state, COUNT(*) as count FROM leads GROUP BY state
  `).all();

    const sourceBreakdown = conn.prepare(`
    SELECT lead_source, COUNT(*) as count FROM leads GROUP BY lead_source
  `).all();

    const replyRate = totals.messagesSent > 0
        ? ((totals.replies / totals.messagesSent) * 100).toFixed(1)
        : '0.0';

    return { ...totals, replyRate, intentBreakdown, stateBreakdown, sourceBreakdown };
}

function getReplyTimeDistribution() {
    const conn = getDb();
    return conn.prepare(`
    SELECT
      ml_out.lead_id,
      ml_in.sent_at as reply_at,
      ml_out.sent_at as sent_at,
      ROUND((julianday(ml_in.sent_at) - julianday(ml_out.sent_at)) * 24, 1) as reply_hours
    FROM message_log ml_out
    JOIN message_log ml_in ON ml_out.lead_id = ml_in.lead_id AND ml_in.direction = 'inbound'
    WHERE ml_out.direction = 'outbound'
    ORDER BY reply_hours
  `).all();
}

function getTimedOutLeads(timeoutHours) {
    const conn = getDb();
    return conn.prepare(`
    SELECT l.* FROM leads l
    JOIN message_log ml ON l.lead_id = ml.lead_id AND ml.direction = 'outbound'
    WHERE l.state = 'message_sent'
    AND (julianday('now') - julianday(ml.sent_at)) * 24 > ?
  `).all(timeoutHours);
}

function getAllLeadsForExport() {
    return getDb().prepare(`
    SELECT lead_id, full_name, phone_number, email, last_interaction_date, lead_source, notes,
           intent_category, intent_rationale, recommended_angle, sms_body, tone, state, created_at, updated_at
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
    getPendingAnalyzedLeads,
    getPendingUnanalyzedLeads,
    getLeadsPaginated,
    insertMessageLog,
    getMessagesByLeadId,
    updateMessageStatus,
    insertInboundMessage,
    getAnalytics,
    getReplyTimeDistribution,
    getTimedOutLeads,
    getAllLeadsForExport,
    getDistinctSources,
};
