/**
 * CostRepository — Cost tracking persistence
 */
const { getDb } = require('./LeadRepository');

function recordCost({ leadId, eventType, provider, costCents }) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT INTO cost_tracking (lead_id, event_type, provider, cost_cents)
    VALUES (?, ?, ?, ?)
  `);
    return stmt.run(leadId, eventType, provider, costCents);
}

function getTotalCosts() {
    const conn = getDb();
    return conn.prepare(`
    SELECT
      SUM(cost_cents) as total_cents,
      SUM(CASE WHEN event_type = 'sms_sent' THEN cost_cents ELSE 0 END) as sms_cents,
      SUM(CASE WHEN event_type = 'ai_call' THEN cost_cents ELSE 0 END) as ai_cents,
      SUM(CASE WHEN event_type = 'eval_call' THEN cost_cents ELSE 0 END) as eval_cents,
      COUNT(*) as total_events
    FROM cost_tracking
  `).get();
}

function getCostPerLead() {
    const conn = getDb();
    return conn.prepare(`
    SELECT
      ct.lead_id,
      l.full_name,
      l.state,
      SUM(ct.cost_cents) as total_cost_cents,
      COUNT(*) as events
    FROM cost_tracking ct
    JOIN leads l ON ct.lead_id = l.lead_id
    GROUP BY ct.lead_id
    ORDER BY total_cost_cents DESC
  `).all();
}

function getCostBreakdownByProvider() {
    const conn = getDb();
    return conn.prepare(`
    SELECT
      provider,
      event_type,
      SUM(cost_cents) as total_cents,
      COUNT(*) as count
    FROM cost_tracking
    GROUP BY provider, event_type
    ORDER BY total_cents DESC
  `).all();
}

function getConversionKPIs() {
    const conn = getDb();
    const totalLeads = conn.prepare('SELECT COUNT(*) as count FROM leads').get().count;
    const contactedLeads = conn.prepare("SELECT COUNT(*) as count FROM leads WHERE state IN ('contacted','replied','escalated')").get().count;
    const repliedLeads = conn.prepare("SELECT COUNT(*) as count FROM leads WHERE state = 'replied'").get().count;
    const totalCost = conn.prepare('SELECT COALESCE(SUM(cost_cents), 0) as total FROM cost_tracking').get().total;

    const costPerLead = totalLeads > 0 ? (totalCost / totalLeads) : 0;
    const costPerConversion = repliedLeads > 0 ? (totalCost / repliedLeads) : 0;
    const contactRate = totalLeads > 0 ? ((contactedLeads / totalLeads) * 100) : 0;
    const conversionRate = contactedLeads > 0 ? ((repliedLeads / contactedLeads) * 100) : 0;

    return {
        totalLeads,
        contactedLeads,
        repliedLeads,
        totalCostCents: totalCost,
        costPerLeadCents: Math.round(costPerLead * 100) / 100,
        costPerConversionCents: Math.round(costPerConversion * 100) / 100,
        contactRate: Math.round(contactRate * 10) / 10,
        conversionRate: Math.round(conversionRate * 10) / 10,
    };
}

module.exports = {
    recordCost,
    getTotalCosts,
    getCostPerLead,
    getCostBreakdownByProvider,
    getConversionKPIs,
};
