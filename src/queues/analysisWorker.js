/**
 * Analysis Worker — Background AI analysis with concurrency control
 */
const logger = require('../utils/logger');
const config = require('../../config');
const { createWorker } = require('./queueManager');
const { updateLeadAI } = require('../repositories/LeadRepository');
const { recordCost } = require('../repositories/CostRepository');
const { createEscalation } = require('../repositories/EscalationRepository');
const { transitionState } = require('../state/stateMachine');
const { getProviderManager } = require('../ai/providers/ProviderManager');
const { getVectorStore } = require('../ai/vectorStore');
const { buildSystemPrompt, buildLeadPrompt } = require('../ai/promptBuilder');
const { ReasoningTracer } = require('../utils/reasoningTracer');
const { incrementCounter, recordHistogram } = require('../utils/tracing');

function startAnalysisWorker() {
    createWorker('ai-analysis', async (job) => {
        const { lead } = job.data;
        const tracer = new ReasoningTracer(lead.lead_id);

        tracer.addStep('analysis_started', { leadId: lead.lead_id, source: lead.lead_source });

        try {
            // Step 1: RAG context retrieval
            const vectorStore = getVectorStore();
            const ragQuery = `${lead.notes || ''} ${lead.lead_source} re-engagement`;
            const ragResults = vectorStore.search(ragQuery);

            tracer.addStep('rag_context_retrieved', {
                query: ragQuery.trim(),
                resultsCount: ragResults.length,
            });

            // Step 2: Build prompts with RAG context
            const systemPrompt = buildSystemPrompt(ragResults);
            const leadPrompt = buildLeadPrompt(lead);

            // Step 3: LLM analysis via provider manager
            const providerManager = getProviderManager();
            const aiStart = Date.now();
            let aiResult;

            if (config.dryRun || !config.gemini.apiKey) {
                aiResult = generateMockResponse(lead);
                aiResult.llm_provider = 'mock';
            } else {
                aiResult = await providerManager.analyze(lead, { systemPrompt, leadPrompt });
            }

            const aiDuration = Date.now() - aiStart;

            tracer.addStep('llm_response_received', {
                provider: aiResult.llm_provider,
                intent: aiResult.intent_category,
                confidence: aiResult.confidence_score,
                duration: aiDuration,
            });

            // Step 4: Validate
            validateAIResponse(aiResult);

            // Enforce SMS length
            if (aiResult.sms_body && aiResult.sms_body.length > 160) {
                aiResult.sms_body = aiResult.sms_body.substring(0, 157) + '...';
            }

            // Step 5: Persist AI result
            updateLeadAI(lead.lead_id, aiResult);

            // Track cost
            recordCost({
                leadId: lead.lead_id,
                eventType: 'ai_call',
                provider: aiResult.llm_provider || 'unknown',
                costCents: config.cost.perAiCallCents,
            });

            // Step 6: Check confidence threshold for HITL
            const confidence = aiResult.confidence_score || 0;
            let decision = 'send';

            if (confidence < config.hitl.confidenceThreshold) {
                decision = 'escalate';
                tracer.addStep('hitl_escalation_triggered', {
                    confidence,
                    threshold: config.hitl.confidenceThreshold,
                });

                createEscalation({
                    leadId: lead.lead_id,
                    reason: `Low confidence score: ${confidence} (threshold: ${config.hitl.confidenceThreshold})`,
                    confidenceScore: confidence,
                    aiResponse: aiResult,
                });

                transitionState(lead.lead_id, 'idle', 'escalated', 'low_confidence', { lead });
                logger.warn(`[ANALYSIS] Lead ${lead.lead_id} escalated — confidence ${confidence} < ${config.hitl.confidenceThreshold}`);
            }

            // Check auto-escalate intents
            if (config.hitl.autoEscalateIntents.includes(aiResult.intent_category)) {
                decision = 'skip';
                tracer.addStep('auto_skip_not_interested', { intent: aiResult.intent_category });
            }

            // Record metrics
            recordHistogram('ai.analysis.duration_ms', aiDuration);
            incrementCounter(`ai.intent.${aiResult.intent_category}`);
            incrementCounter(`ai.provider.${aiResult.llm_provider || 'unknown'}`);

            // Finalize trace
            tracer.finalize({
                provider: aiResult.llm_provider,
                prompt: leadPrompt,
                rawResponse: aiResult._raw || '',
                parsedResult: aiResult,
                confidenceScore: confidence,
                ragContext: ragResults,
                decision,
            });

            logger.info(`[ANALYSIS] Lead ${lead.lead_id}: ${aiResult.intent_category} (confidence: ${confidence}, provider: ${aiResult.llm_provider})`);

        } catch (err) {
            tracer.addStep('analysis_failed', { error: err.message });
            tracer.finalize({
                provider: 'error',
                prompt: '',
                rawResponse: err.message,
                parsedResult: null,
                confidenceScore: 0,
                ragContext: [],
                decision: 'error',
            });

            incrementCounter('ai.analysis.errors');
            logger.error(`[ANALYSIS] Lead ${lead.lead_id} failed: ${err.message}`);
            throw err;
        }
    }, { concurrency: config.aiConcurrency });

    logger.info(`[ANALYSIS-WORKER] Started with concurrency: ${config.aiConcurrency}`);
}

function validateAIResponse(parsed) {
    const required = ['intent_category', 'intent_rationale', 'recommended_angle', 'sms_body', 'tone'];
    const missing = required.filter(f => !parsed[f]);
    if (missing.length > 0) {
        throw new Error(`AI response missing fields: ${missing.join(', ')}`);
    }

    const validIntents = ['high', 'medium', 'low', 'not_interested'];
    if (!validIntents.includes(parsed.intent_category)) {
        throw new Error(`Invalid intent_category: ${parsed.intent_category}`);
    }

    const validTones = ['professional', 'casual', 'urgency', 'friendly'];
    if (!validTones.includes(parsed.tone)) {
        parsed.tone = 'friendly';
    }

    // Ensure confidence_score exists and is valid
    if (parsed.confidence_score == null || isNaN(parsed.confidence_score)) {
        parsed.confidence_score = 0.5;
    }
    parsed.confidence_score = Math.max(0, Math.min(1, parsed.confidence_score));
}

function generateMockResponse(lead) {
    const daysSince = Math.floor(
        (Date.now() - new Date(lead.last_interaction_date).getTime()) / (1000 * 60 * 60 * 24)
    );

    const firstName = lead.full_name.split(' ')[0];
    let intent, tone, rationale, angle, sms, confidence;

    if (daysSince < 30) {
        intent = 'high'; tone = 'professional'; confidence = 0.92;
        rationale = `Recent interaction ${daysSince} days ago suggests active interest. Source: ${lead.lead_source}.`;
        angle = 'Follow up on recent engagement with value proposition.';
        sms = `Hi ${firstName}, following up on our recent conversation. Would love to help you move forward — any questions?`;
    } else if (daysSince < 90) {
        intent = 'medium'; tone = 'casual'; confidence = 0.78;
        rationale = `Moderate gap of ${daysSince} days. Lead originated from ${lead.lead_source}.`;
        angle = 'Warm re-engagement with personalized check-in.';
        sms = `Hey ${firstName}! It's been a while since we connected. Got some exciting updates — interested in a quick chat?`;
    } else if (daysSince < 180) {
        intent = 'low'; tone = 'friendly'; confidence = 0.65;
        rationale = `Long dormancy of ${daysSince} days. May need a compelling reason to re-engage.`;
        angle = 'Gentle re-introduction with no-pressure value offer.';
        sms = `Hi ${firstName}, hope you're doing well! We've made some great improvements — want to take a fresh look?`;
    } else {
        intent = 'not_interested'; tone = 'friendly'; confidence = 0.45;
        rationale = `Very long dormancy of ${daysSince} days with no recent signals of interest.`;
        angle = 'Final soft touch to confirm interest status.';
        sms = `Hi ${firstName}, just a quick note — we're still here if you ever need us. No pressure at all!`;
    }

    if (sms.length > 160) sms = sms.substring(0, 157) + '...';

    return {
        intent_category: intent,
        intent_rationale: rationale,
        recommended_angle: angle,
        sms_body: sms,
        tone,
        confidence_score: confidence,
        llm_provider: 'mock',
    };
}

module.exports = { startAnalysisWorker };
