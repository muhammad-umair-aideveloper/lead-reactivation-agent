/**
 * MessageRepository — Message log database queries
 */
const { getDb } = require('./LeadRepository');

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
    return getDb().prepare('UPDATE message_log SET status = ? WHERE twilio_sid = ?').run(status, twilioSid);
}

function insertInboundMessage(leadId, body) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT INTO message_log (lead_id, direction, body, sent_at, status)
    VALUES (?, 'inbound', ?, datetime('now'), 'received')
  `);
    return stmt.run(leadId, body);
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

module.exports = {
    insertMessageLog,
    getMessagesByLeadId,
    updateMessageStatus,
    insertInboundMessage,
    getReplyTimeDistribution,
};
