/**
 * AnalyticsService — Aggregation logic for KPIs, cost, and conversion metrics
 */
const LeadRepo = require('../repositories/LeadRepository');
const MessageRepo = require('../repositories/MessageRepository');
const CostRepo = require('../repositories/CostRepository');
const EscalationRepo = require('../repositories/EscalationRepository');
const { getMetricsSnapshot } = require('../utils/tracing');

function getAnalytics() {
    const conn = LeadRepo.getDb();

    const totals = conn.prepare(`
    SELECT
      COUNT(*) as totalLeads,
      SUM(CASE WHEN state IN ('contacted','replied','escalated') THEN 1 ELSE 0 END) as messagesSent,
      SUM(CASE WHEN state = 'replied' THEN 1 ELSE 0 END) as replies,
      SUM(CASE WHEN state = 'escalated' THEN 1 ELSE 0 END) as escalated
    FROM leads
  `).get();

    const intentBreakdown = conn.prepare(`
    SELECT intent_category, COUNT(*) as count
    FROM leads WHERE intent_category IS NOT NULL
    GROUP BY intent_category
  `).all();

    const stateBreakdown = conn.prepare(`
    SELECT state, COUNT(*) as count FROM leads GROUP BY state
  `).all();

    const sourceBreakdown = conn.prepare(`
    SELECT lead_source, COUNT(*) as count FROM leads GROUP BY lead_source
  `).all();

    const confidenceDistribution = conn.prepare(`
    SELECT
      CASE
        WHEN confidence_score >= 0.9 THEN 'very_high'
        WHEN confidence_score >= 0.8 THEN 'high'
        WHEN confidence_score >= 0.6 THEN 'medium'
        WHEN confidence_score >= 0.4 THEN 'low'
        ELSE 'very_low'
      END as bucket,
      COUNT(*) as count,
      AVG(confidence_score) as avg_score
    FROM leads WHERE confidence_score IS NOT NULL
    GROUP BY bucket
  `).all();

    const replyRate = totals.messagesSent > 0
        ? ((totals.replies / totals.messagesSent) * 100).toFixed(1)
        : '0.0';

    // Cost and conversion KPIs
    const costKPIs = CostRepo.getConversionKPIs();
    const escalationStats = EscalationRepo.getEscalationStats();

    return {
        ...totals,
        replyRate,
        intentBreakdown,
        stateBreakdown,
        sourceBreakdown,
        confidenceDistribution,
        costKPIs,
        escalationStats,
    };
}

function getReplyTimeDistribution() {
    return MessageRepo.getReplyTimeDistribution();
}

function getCostBreakdown() {
    return {
        totals: CostRepo.getTotalCosts(),
        perLead: CostRepo.getCostPerLead(),
        byProvider: CostRepo.getCostBreakdownByProvider(),
        kpis: CostRepo.getConversionKPIs(),
    };
}

function getMetrics() {
    return getMetricsSnapshot();
}

module.exports = {
    getAnalytics,
    getReplyTimeDistribution,
    getCostBreakdown,
    getMetrics,
};
