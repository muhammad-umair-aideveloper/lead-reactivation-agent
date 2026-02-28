/**
 * Gemini AI Client v2 — Thin wrapper, delegates to AIService for real analysis
 * Kept for backward compatibility.
 */
const config = require('../../config');
const logger = require('../utils/logger');
const { getProviderManager } = require('./providers/ProviderManager');
const { getVectorStore } = require('./vectorStore');
const { buildSystemPrompt, buildLeadPrompt } = require('./promptBuilder');

/**
 * Analyze a single lead using the provider manager (with failover).
 * @param {object} lead — Lead data object
 * @returns {Promise<object>}
 */
async function analyzeLead(lead) {
    if (config.dryRun || !config.gemini.apiKey) {
        logger.info(`[DRY_RUN] Mock AI analysis for lead: ${lead.lead_id}`);
        return generateMockResponse(lead);
    }

    // RAG context
    const vectorStore = getVectorStore();
    const ragQuery = `${lead.notes || ''} ${lead.lead_source}`;
    const ragResults = vectorStore.search(ragQuery);

    const systemPrompt = buildSystemPrompt(ragResults);
    const leadPrompt = buildLeadPrompt(lead);

    const providerManager = getProviderManager();

    let lastError = null;
    for (let attempt = 1; attempt <= config.retry.maxAttempts; attempt++) {
        try {
            logger.info(`Analyzing lead ${lead.lead_id} (attempt ${attempt}/${config.retry.maxAttempts})`);
            const result = await providerManager.analyze(lead, { systemPrompt, leadPrompt });
            validateAIResponse(result);

            if (result.sms_body && result.sms_body.length > 160) {
                result.sms_body = result.sms_body.substring(0, 157) + '...';
            }

            logger.info(`Lead ${lead.lead_id} classified as: ${result.intent_category} (confidence: ${result.confidence_score}, provider: ${result.llm_provider})`);
            return result;
        } catch (err) {
            lastError = err;
            logger.warn(`AI analysis attempt ${attempt} failed for ${lead.lead_id}: ${err.message}`);
            if (attempt < config.retry.maxAttempts) {
                await sleep(config.retry.baseDelayMs * Math.pow(2, attempt - 1));
            }
        }
    }

    logger.error(`AI analysis failed for ${lead.lead_id} after ${config.retry.maxAttempts} attempts.`);
    return generateMockResponse(lead);
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
    if (parsed.confidence_score == null || isNaN(parsed.confidence_score)) {
        parsed.confidence_score = 0.5;
    }
}

function generateMockResponse(lead) {
    const daysSince = Math.floor(
        (Date.now() - new Date(lead.last_interaction_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    const firstName = lead.full_name.split(' ')[0];
    let intent, tone, rationale, angle, sms, confidence;

    if (daysSince < 30) {
        intent = 'high'; tone = 'professional'; confidence = 0.92;
        rationale = `Recent interaction ${daysSince} days ago suggests active interest.`;
        angle = 'Follow up on recent engagement with value proposition.';
        sms = `Hi ${firstName}, following up on our recent conversation. Would love to help you move forward — any questions?`;
    } else if (daysSince < 90) {
        intent = 'medium'; tone = 'casual'; confidence = 0.78;
        rationale = `Moderate gap of ${daysSince} days from ${lead.lead_source}.`;
        angle = 'Warm re-engagement with personalized check-in.';
        sms = `Hey ${firstName}! It's been a while since we connected. Got some exciting updates — interested in a quick chat?`;
    } else if (daysSince < 180) {
        intent = 'low'; tone = 'friendly'; confidence = 0.65;
        rationale = `Long dormancy of ${daysSince} days.`;
        angle = 'Gentle re-introduction with value offer.';
        sms = `Hi ${firstName}, hope you're doing well! We've made some great improvements — want to take a fresh look?`;
    } else {
        intent = 'not_interested'; tone = 'friendly'; confidence = 0.45;
        rationale = `Very long dormancy of ${daysSince} days.`;
        angle = 'Final soft touch.';
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

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

module.exports = { analyzeLead };
