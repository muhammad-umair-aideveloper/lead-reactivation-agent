/**
 * LeadService — Business logic for lead lifecycle and CSV workflow orchestration
 */
const config = require('../../config');
const logger = require('../utils/logger');
const { TraceContext, incrementCounter, recordHistogram } = require('../utils/tracing');
const { parseCSV } = require('../ingestion/csvParser');
const { deduplicateLeads } = require('../ingestion/validator');
const LeadRepo = require('../repositories/LeadRepository');
const { getQueue } = require('../queues/queueManager');

/**
 * Execute the full agent workflow on uploaded CSV data.
 */
async function executeWorkflow(csvData) {
    const trace = new TraceContext('agent_workflow', { trigger: 'csv_upload' });
    const summary = {
        traceId: trace.traceId,
        totalRows: 0,
        validLeads: 0,
        duplicatesSkipped: 0,
        insertedLeads: 0,
        analyzedLeads: 0,
        analysisErrors: 0,
        validationErrors: [],
        duration: 0,
    };

    logger.info(`═══ Agent Workflow Started [TRACE:${trace.traceId}] ═══`);
    incrementCounter('workflow.started');

    try {
        // Step 1: Parse CSV
        const parseSpan = trace.startSpan('csv_parse');
        const { leads, errors } = await parseCSV(csvData);
        summary.totalRows = leads.length + errors.length;
        summary.validationErrors = errors.slice(0, 10);
        parseSpan.setAttributes({ totalRows: summary.totalRows, validLeads: leads.length, errors: errors.length });
        parseSpan.end();

        incrementCounter('workflow.rows_processed', summary.totalRows);

        if (leads.length === 0) {
            logger.warn(`[TRACE:${trace.traceId}] No valid leads found in CSV.`);
            trace.end('empty');
            summary.duration = trace.endTime - trace.startTime;
            return summary;
        }

        // Step 2: Deduplicate
        const dedupSpan = trace.startSpan('deduplication');
        const { unique, duplicates } = deduplicateLeads(leads);
        summary.validLeads = unique.length;
        summary.duplicatesSkipped = duplicates.length;
        dedupSpan.end();

        // Step 3: Insert into Database
        const insertSpan = trace.startSpan('db_insert');
        const inserted = LeadRepo.insertLeadsBatch(unique);
        summary.insertedLeads = inserted;
        insertSpan.setAttributes({ inserted });
        insertSpan.end();

        incrementCounter('workflow.leads_inserted', inserted);

        // Step 4: Enqueue for AI Analysis
        const analysisSpan = trace.startSpan('enqueue_analysis');
        const unanalyzed = LeadRepo.getIdleUnanalyzedLeads();
        const analysisQueue = getQueue('ai-analysis');

        if (analysisQueue) {
            for (const lead of unanalyzed) {
                await analysisQueue.add('analyze-lead', { lead }, {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                });
            }
            summary.analyzedLeads = unanalyzed.length;
            logger.info(`[TRACE:${trace.traceId}] Enqueued ${unanalyzed.length} leads for analysis`);
        }
        analysisSpan.setAttributes({ enqueued: unanalyzed.length });
        analysisSpan.end();

        // Done
        trace.end('ok');
        summary.duration = trace.endTime - trace.startTime;
        incrementCounter('workflow.completed');
        recordHistogram('workflow.duration_ms', summary.duration);

        logger.info(`═══ Agent Workflow Complete [TRACE:${trace.traceId}] — ${summary.validLeads} leads in ${summary.duration}ms ═══`);
        return summary;

    } catch (err) {
        trace.fail(err);
        incrementCounter('workflow.failed');
        throw err;
    }
}

/**
 * Get paginated leads.
 */
function getLeads(params) {
    return LeadRepo.getLeadsPaginated(params);
}

/**
 * Get a single lead detail.
 */
function getLeadDetail(leadId) {
    const lead = LeadRepo.getLeadById(leadId);
    return lead || null;
}

/**
 * Get all leads for CSV export.
 */
function getLeadsForExport() {
    return LeadRepo.getAllLeadsForExport();
}

/**
 * Get distinct lead sources.
 */
function getDistinctSources() {
    return LeadRepo.getDistinctSources();
}

module.exports = {
    executeWorkflow,
    getLeads,
    getLeadDetail,
    getLeadsForExport,
    getDistinctSources,
};
