/**
 * EscalationRepository — HITL escalation task persistence
 */
const { getDb } = require('./LeadRepository');

function createEscalation({ leadId, reason, confidenceScore, aiResponse }) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT INTO escalation_tasks (lead_id, reason, confidence_score, ai_response, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);
    return stmt.run(leadId, reason, confidenceScore, typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse));
}

function getEscalationsByStatus(status = 'pending') {
    return getDb().prepare(`
    SELECT et.*, l.full_name, l.phone_number, l.lead_source, l.intent_category
    FROM escalation_tasks et
    JOIN leads l ON et.lead_id = l.lead_id
    WHERE et.status = ?
    ORDER BY et.created_at DESC
  `).all(status);
}

function getAllEscalations({ page = 1, limit = 20 }) {
    const conn = getDb();
    const offset = (page - 1) * limit;
    const countRow = conn.prepare('SELECT COUNT(*) as total FROM escalation_tasks').get();
    const rows = conn.prepare(`
    SELECT et.*, l.full_name, l.phone_number, l.lead_source, l.intent_category
    FROM escalation_tasks et
    JOIN leads l ON et.lead_id = l.lead_id
    ORDER BY et.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
    return { escalations: rows, total: countRow.total, page, limit, totalPages: Math.ceil(countRow.total / limit) };
}

function getEscalationById(id) {
    return getDb().prepare(`
    SELECT et.*, l.full_name, l.phone_number, l.lead_source, l.intent_category, l.notes
    FROM escalation_tasks et
    JOIN leads l ON et.lead_id = l.lead_id
    WHERE et.id = ?
  `).get(id);
}

function resolveEscalation(id, { status, resolutionNotes, assignedTo }) {
    const conn = getDb();
    return conn.prepare(`
    UPDATE escalation_tasks SET
      status = ?,
      resolution_notes = ?,
      assigned_to = ?,
      resolved_at = datetime('now')
    WHERE id = ?
  `).run(status, resolutionNotes, assignedTo, id);
}

function getEscalationStats() {
    const conn = getDb();
    return conn.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END) as in_review,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed,
      AVG(confidence_score) as avg_confidence
    FROM escalation_tasks
  `).get();
}

module.exports = {
    createEscalation,
    getEscalationsByStatus,
    getAllEscalations,
    getEscalationById,
    resolveEscalation,
    getEscalationStats,
};
