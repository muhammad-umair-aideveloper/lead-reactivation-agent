/**
 * AnalyticsController — KPIs, metrics, costs, reasoning traces
 */
const logger = require('../utils/logger');
const AnalyticsService = require('../services/AnalyticsService');
const { getReasoningTraces, getReasoningTraceById } = require('../repositories/ReasoningRepository');
const { getProviderManager } = require('../ai/providers/ProviderManager');
const { getQueueStats } = require('../queues/queueManager');

function register(router) {
    /**
     * GET /api/analytics — Aggregated KPIs
     */
    router.get('/analytics', (req, res) => {
        try {
            res.json(AnalyticsService.getAnalytics());
        } catch (err) {
            logger.error('Analytics error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/analytics/reply-times — Reply time distribution
     */
    router.get('/analytics/reply-times', (req, res) => {
        try {
            res.json(AnalyticsService.getReplyTimeDistribution());
        } catch (err) {
            logger.error('Reply times error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/analytics/costs — Cost breakdown
     */
    router.get('/analytics/costs', (req, res) => {
        try {
            res.json(AnalyticsService.getCostBreakdown());
        } catch (err) {
            logger.error('Cost breakdown error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/metrics — Observability: counters, histograms, traces
     */
    router.get('/metrics', (req, res) => {
        try {
            res.json(AnalyticsService.getMetrics());
        } catch (err) {
            logger.error('Metrics error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/traces — AI reasoning traces
     */
    router.get('/traces', (req, res) => {
        try {
            const { page = 1, limit = 20, leadId } = req.query;
            res.json(getReasoningTraces({
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                leadId,
            }));
        } catch (err) {
            logger.error('Traces error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/traces/:traceId — Single reasoning trace
     */
    router.get('/traces/:traceId', (req, res) => {
        try {
            const trace = getReasoningTraceById(req.params.traceId);
            if (!trace) return res.status(404).json({ error: 'Trace not found.' });
            res.json(trace);
        } catch (err) {
            logger.error('Trace detail error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/providers/health — LLM provider health status
     */
    router.get('/providers/health', (req, res) => {
        try {
            const pm = getProviderManager();
            res.json(pm.getHealthStatus());
        } catch (err) {
            logger.error('Provider health error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/queues/stats — Queue statistics
     */
    router.get('/queues/stats', async (req, res) => {
        try {
            res.json(await getQueueStats());
        } catch (err) {
            logger.error('Queue stats error:', err);
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = { register };
