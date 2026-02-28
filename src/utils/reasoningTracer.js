/**
 * ReasoningTracer — Captures full AI decision trees for observability
 *
 * Records: prompt → raw response → parsed intent → confidence → action taken
 * Stored in reasoning_traces table for /api/traces inspection.
 */
const crypto = require('crypto');
const logger = require('./logger');
const { insertReasoningTrace } = require('../repositories/ReasoningRepository');

class ReasoningTracer {
    constructor(leadId) {
        this.traceId = `rt_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
        this.leadId = leadId;
        this.startTime = Date.now();
        this.steps = [];
    }

    /**
     * Log a reasoning step.
     */
    addStep(name, data = {}) {
        this.steps.push({
            name,
            timestamp: Date.now(),
            data,
        });
        logger.info(`[REASONING:${this.traceId}] ${name}`, { leadId: this.leadId, ...data });
    }

    /**
     * Finalize the trace and persist it.
     * @param {object} params
     * @param {string} params.provider — LLM provider used
     * @param {string} params.prompt — The prompt sent
     * @param {string} params.rawResponse — Raw LLM response
     * @param {object} params.parsedResult — Parsed structured result
     * @param {number} params.confidenceScore — Confidence score
     * @param {Array} params.ragContext — RAG context used
     * @param {string} params.decision — Final decision taken (send / escalate / skip)
     */
    finalize({ provider, prompt, rawResponse, parsedResult, confidenceScore, ragContext, decision }) {
        const durationMs = Date.now() - this.startTime;

        const promptHash = crypto.createHash('md5').update(prompt || '').digest('hex').slice(0, 12);

        try {
            insertReasoningTrace({
                trace_id: this.traceId,
                lead_id: this.leadId,
                provider: provider || 'unknown',
                prompt_hash: promptHash,
                raw_response: rawResponse || '',
                parsed_result: parsedResult || {},
                confidence_score: confidenceScore || null,
                rag_context_used: ragContext || [],
                decision: decision || 'unknown',
                duration_ms: durationMs,
            });
        } catch (err) {
            logger.error(`[REASONING:${this.traceId}] Failed to persist trace:`, err);
        }

        logger.info(`[REASONING:${this.traceId}] Finalized — provider:${provider} confidence:${confidenceScore} decision:${decision} duration:${durationMs}ms`);
        return this;
    }
}

module.exports = { ReasoningTracer };
