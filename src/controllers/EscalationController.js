/**
 * EscalationController — HITL escalation task management
 */
const logger = require('../utils/logger');
const EscalationRepo = require('../repositories/EscalationRepository');
const { transitionState } = require('../state/stateMachine');
const { getLeadById } = require('../repositories/LeadRepository');

function register(router) {
    /**
     * GET /api/escalations — List escalation tasks
     */
    router.get('/escalations', (req, res) => {
        try {
            const { page = 1, limit = 20, status } = req.query;
            if (status) {
                res.json(EscalationRepo.getEscalationsByStatus(status));
            } else {
                res.json(EscalationRepo.getAllEscalations({
                    page: parseInt(page, 10),
                    limit: parseInt(limit, 10),
                }));
            }
        } catch (err) {
            logger.error('Escalations list error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/escalations/stats — Escalation statistics
     */
    router.get('/escalations/stats', (req, res) => {
        try {
            res.json(EscalationRepo.getEscalationStats());
        } catch (err) {
            logger.error('Escalation stats error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/escalations/:id — Single escalation detail
     */
    router.get('/escalations/:id', (req, res) => {
        try {
            const escalation = EscalationRepo.getEscalationById(parseInt(req.params.id, 10));
            if (!escalation) return res.status(404).json({ error: 'Escalation not found.' });
            res.json(escalation);
        } catch (err) {
            logger.error('Escalation detail error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * PUT /api/escalations/:id — Resolve an escalation task
     */
    router.put('/escalations/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { status, resolutionNotes, assignedTo } = req.body;

            if (!['resolved', 'dismissed', 'in_review'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status. Must be resolved, dismissed, or in_review.' });
            }

            const escalation = EscalationRepo.getEscalationById(id);
            if (!escalation) return res.status(404).json({ error: 'Escalation not found.' });

            EscalationRepo.resolveEscalation(id, { status, resolutionNotes, assignedTo });

            // If resolved, re-queue the lead
            if (status === 'resolved') {
                const lead = getLeadById(escalation.lead_id);
                if (lead && lead.state === 'escalated') {
                    transitionState(lead.lead_id, 'escalated', 'idle', 'hitl_requeue', { lead });
                }
            }

            logger.info(`[HITL] Escalation #${id} → ${status} (lead: ${escalation.lead_id})`);
            res.json({ success: true, message: `Escalation ${status}.` });
        } catch (err) {
            logger.error('Escalation resolve error:', err);
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = { register };
