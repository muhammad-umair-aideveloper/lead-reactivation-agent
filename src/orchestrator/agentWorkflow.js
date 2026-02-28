/**
 * Agent Workflow Orchestrator — Autonomous pipeline for lead reactivation
 * Includes full observability with trace contexts and spans.
 */
const config = require('../../config');
const logger = require('../utils/logger');
const { TraceContext, incrementCounter, recordHistogram } = require('../utils/tracing');
const { parseCSV } = require('../ingestion/csvParser');
const { deduplicateLeads } = require('../ingestion/validator');
const { insertLeadsBatch, updateLeadAI, getPendingUnanalyzedLeads } = require('../data/database');
const { analyzeLead } = require('../ai/geminiClient');

/**
 * Execute the full agent workflow on uploaded CSV data.
 * @param {Buffer|string} csvData — Raw CSV content
 * @returns {Promise<object>} — Processing summary
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
        // ── Step 1: Parse CSV ──────────────────────
        const parseSpan = trace.startSpan('csv_parse');
        const { leads, errors } = await parseCSV(csvData);
        summary.totalRows = leads.length + errors.length;
        summary.validationErrors = errors.slice(0, 10);
        parseSpan.setAttributes({ totalRows: summary.totalRows, validLeads: leads.length, errors: errors.length });
        parseSpan.end();

        incrementCounter('workflow.rows_processed', summary.totalRows);
        incrementCounter('workflow.validation_errors', errors.length);

        if (leads.length === 0) {
            logger.warn(`[TRACE:${trace.traceId}] No valid leads found in CSV.`);
            trace.end('empty');
            summary.duration = trace.endTime - trace.startTime;
            return summary;
        }

        // ── Step 2: Deduplicate ────────────────────
        const dedupSpan = trace.startSpan('deduplication');
        const { unique, duplicates } = deduplicateLeads(leads);
        summary.validLeads = unique.length;
        summary.duplicatesSkipped = duplicates.length;
        dedupSpan.setAttributes({ unique: unique.length, duplicates: duplicates.length });
        dedupSpan.end();

        // ── Step 3: Insert into Database ───────────
        const insertSpan = trace.startSpan('db_insert');
        const inserted = insertLeadsBatch(unique);
        summary.insertedLeads = inserted;
        insertSpan.setAttributes({ inserted, skipped: unique.length - inserted });
        insertSpan.end();

        incrementCounter('workflow.leads_inserted', inserted);

        // ── Step 4: AI Analysis ────────────────────
        const analysisSpan = trace.startSpan('ai_analysis');
        const unanalyzed = getPendingUnanalyzedLeads();
        analysisSpan.setAttributes({ leadsToAnalyze: unanalyzed.length, concurrency: config.aiConcurrency });

        const concurrency = config.aiConcurrency;
        for (let i = 0; i < unanalyzed.length; i += concurrency) {
            const batch = unanalyzed.slice(i, i + concurrency);
            const batchSpan = trace.startSpan('ai_batch', { batchIndex: Math.floor(i / concurrency), size: batch.length });

            await Promise.allSettled(
                batch.map(async (lead) => {
                    const leadSpan = trace.startSpan('ai_lead_analysis', { leadId: lead.lead_id });
                    try {
                        const aiStart = Date.now();
                        const aiResult = await analyzeLead(lead);
                        updateLeadAI(lead.lead_id, aiResult);
                        summary.analyzedLeads++;
                        recordHistogram('ai.analysis.duration_ms', Date.now() - aiStart);
                        incrementCounter(`ai.intent.${aiResult.intent_category}`);
                        leadSpan.setAttributes({ intent: aiResult.intent_category, tone: aiResult.tone });
                        leadSpan.end();
                    } catch (err) {
                        summary.analysisErrors++;
                        incrementCounter('ai.analysis.errors');
                        leadSpan.fail(err);
                    }
                })
            );

            batchSpan.end();

            if (i + concurrency < unanalyzed.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        analysisSpan.setAttributes({ analyzed: summary.analyzedLeads, errors: summary.analysisErrors });
        analysisSpan.end();

        // ── Done ───────────────────────────────────
        trace.end('ok');
        summary.duration = trace.endTime - trace.startTime;

        incrementCounter('workflow.completed');
        recordHistogram('workflow.duration_ms', summary.duration);
        recordHistogram('workflow.leads_per_run', summary.validLeads);

        logger.info(`═══ Agent Workflow Complete [TRACE:${trace.traceId}] ═══`);
        logger.info(`Processed ${summary.validLeads} leads in ${summary.duration}ms`);
        logger.info(`Analyzed: ${summary.analyzedLeads} | Errors: ${summary.analysisErrors}`);

        return summary;

    } catch (err) {
        trace.fail(err);
        incrementCounter('workflow.failed');
        summary.duration = Date.now() - trace.startTime;
        throw err;
    }
}

module.exports = { executeWorkflow };
