/**
 * ReasoningRepository — AI reasoning trace persistence
 */
const { getDb } = require('./LeadRepository');

function insertReasoningTrace(trace) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT INTO reasoning_traces (trace_id, lead_id, provider, prompt_hash, raw_response, parsed_result,
      confidence_score, rag_context_used, decision, duration_ms)
    VALUES (@trace_id, @lead_id, @provider, @prompt_hash, @raw_response, @parsed_result,
      @confidence_score, @rag_context_used, @decision, @duration_ms)
  `);
    return stmt.run({
        ...trace,
        raw_response: typeof trace.raw_response === 'string' ? trace.raw_response : JSON.stringify(trace.raw_response),
        parsed_result: typeof trace.parsed_result === 'string' ? trace.parsed_result : JSON.stringify(trace.parsed_result),
        rag_context_used: typeof trace.rag_context_used === 'string' ? trace.rag_context_used : JSON.stringify(trace.rag_context_used),
    });
}

function getReasoningTraces({ page = 1, limit = 20, leadId }) {
    const conn = getDb();
    const where = leadId ? 'WHERE lead_id = ?' : '';
    const params = leadId ? [limit, (page - 1) * limit, leadId] : [limit, (page - 1) * limit];

    const countSql = `SELECT COUNT(*) as total FROM reasoning_traces ${leadId ? 'WHERE lead_id = ?' : ''}`;
    const countRow = conn.prepare(countSql).get(leadId ? [leadId] : []);

    const rows = conn.prepare(`
    SELECT * FROM reasoning_traces ${where}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(leadId ? [leadId, limit, (page - 1) * limit] : [limit, (page - 1) * limit]);

    return {
        traces: rows,
        total: countRow.total,
        page,
        limit,
        totalPages: Math.ceil(countRow.total / limit),
    };
}

function getReasoningTraceById(traceId) {
    return getDb().prepare('SELECT * FROM reasoning_traces WHERE trace_id = ?').get(traceId);
}

function insertStateAuditLog({ leadId, fromState, toState, triggerEvent, metadata }) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT INTO state_audit_log (lead_id, from_state, to_state, trigger_event, metadata)
    VALUES (?, ?, ?, ?, ?)
  `);
    return stmt.run(leadId, fromState, toState, triggerEvent, typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {}));
}

function getStateAuditLog(leadId) {
    return getDb().prepare('SELECT * FROM state_audit_log WHERE lead_id = ? ORDER BY created_at').all(leadId);
}

module.exports = {
    insertReasoningTrace,
    getReasoningTraces,
    getReasoningTraceById,
    insertStateAuditLog,
    getStateAuditLog,
};
