/**
 * EvalController — LLM-as-a-Judge evaluation suite endpoints
 */
const logger = require('../utils/logger');
const EvalRepo = require('../repositories/EvalRepository');

function register(router) {
    /**
     * POST /api/eval/run — Trigger an evaluation run
     */
    router.post('/eval/run', async (req, res) => {
        try {
            const { EvalRunner } = require('../eval/EvalRunner');
            const runner = new EvalRunner();
            const result = await runner.run();
            res.json({ success: true, ...result });
        } catch (err) {
            logger.error('Eval run error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/eval/runs — List all eval runs
     */
    router.get('/eval/runs', (req, res) => {
        try {
            res.json(EvalRepo.getEvalRuns());
        } catch (err) {
            logger.error('Eval runs error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/eval/latest — Get latest eval run with full results
     */
    router.get('/eval/latest', (req, res) => {
        try {
            const latest = EvalRepo.getLatestEvalRun();
            if (!latest) return res.status(404).json({ error: 'No eval runs found.' });
            res.json(latest);
        } catch (err) {
            logger.error('Latest eval error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/eval/runs/:runId — Get results for a specific eval run
     */
    router.get('/eval/runs/:runId', (req, res) => {
        try {
            const results = EvalRepo.getEvalRunResults(req.params.runId);
            if (results.length === 0) return res.status(404).json({ error: 'Eval run not found.' });
            res.json(results);
        } catch (err) {
            logger.error('Eval run detail error:', err);
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = { register };
