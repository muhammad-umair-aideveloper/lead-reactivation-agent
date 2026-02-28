/**
 * LeadController — HTTP handlers for lead CRUD and CSV workflow
 */
const multer = require('multer');
const path = require('path');
const logger = require('../utils/logger');
const LeadService = require('../services/LeadService');
const { getMessagesByLeadId } = require('../repositories/MessageRepository');
const { getStateAuditLog } = require('../repositories/ReasoningRepository');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.csv') return cb(new Error('Only CSV files are accepted.'));
        cb(null, true);
    },
});

function register(router) {
    /**
     * POST /api/upload — Upload CSV to trigger agent workflow
     */
    router.post('/upload', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded. Please provide a CSV file.' });
            }
            logger.info(`CSV uploaded: ${req.file.originalname} (${req.file.size} bytes)`);
            const summary = await LeadService.executeWorkflow(req.file.buffer);
            res.json({ success: true, message: 'Workflow completed successfully.', summary });
        } catch (err) {
            logger.error('Upload error:', err);
            res.status(500).json({ error: 'Workflow execution failed.', message: err.message });
        }
    });

    /**
     * GET /api/leads — Paginated, filterable lead list
     */
    router.get('/leads', (req, res) => {
        try {
            const { page = 1, limit = 20, intent, source, state, dateFrom, dateTo } = req.query;
            const result = LeadService.getLeads({
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                intent, source, state, dateFrom, dateTo,
            });
            res.json(result);
        } catch (err) {
            logger.error('Leads query error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/leads/:id — Single lead detail with messages and audit log
     */
    router.get('/leads/:id', (req, res) => {
        try {
            const lead = LeadService.getLeadDetail(req.params.id);
            if (!lead) return res.status(404).json({ error: 'Lead not found.' });
            const messages = getMessagesByLeadId(req.params.id);
            const auditLog = getStateAuditLog(req.params.id);
            res.json({ lead, messages, auditLog });
        } catch (err) {
            logger.error('Lead detail error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/sources — Distinct lead sources
     */
    router.get('/sources', (req, res) => {
        try {
            res.json(LeadService.getDistinctSources());
        } catch (err) {
            logger.error('Sources error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/export — Export all leads as CSV
     */
    router.get('/export', (req, res) => {
        try {
            const leads = LeadService.getLeadsForExport();
            if (leads.length === 0) return res.status(404).json({ error: 'No leads to export.' });

            const headers = Object.keys(leads[0]);
            const csvRows = [
                headers.join(','),
                ...leads.map(lead =>
                    headers.map(h => {
                        const val = lead[h] != null ? String(lead[h]) : '';
                        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                            return `"${val.replace(/"/g, '""')}"`;
                        }
                        return val;
                    }).join(',')
                ),
            ];

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="leads_export_${Date.now()}.csv"`);
            res.send(csvRows.join('\n'));
        } catch (err) {
            logger.error('Export error:', err);
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = { register };
