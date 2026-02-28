/**
 * EvalRunner — Runs leads through the Golden Dataset and collects results
 */
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../../config');
const { getProviderManager } = require('../ai/providers/ProviderManager');
const { getVectorStore } = require('../ai/vectorStore');
const { buildSystemPrompt, buildLeadPrompt } = require('../ai/promptBuilder');
const { insertEvalResultsBatch } = require('../repositories/EvalRepository');
const { recordCost } = require('../repositories/CostRepository');
const { EvalJudge } = require('./EvalJudge');

class EvalRunner {
    constructor() {
        this.datasetPath = path.join(__dirname, '..', '..', 'data', 'goldenDataset.json');
        this.runId = uuidv4();
    }

    async run() {
        logger.info(`[EVAL] Starting evaluation run: ${this.runId}`);

        const dataset = JSON.parse(fs.readFileSync(this.datasetPath, 'utf-8'));
        const judge = new EvalJudge();
        const results = [];
        let passed = 0;
        let failed = 0;

        const providerManager = getProviderManager();
        const vectorStore = getVectorStore();

        for (let i = 0; i < dataset.length; i++) {
            const scenario = dataset[i];
            const lead = { lead_id: `eval_${scenario.id}`, ...scenario.lead };

            try {
                // Get RAG context for the lead
                const ragQuery = `${lead.notes || ''} ${lead.lead_source}`;
                const ragResults = vectorStore.search(ragQuery);
                const systemPrompt = buildSystemPrompt(ragResults);
                const leadPrompt = buildLeadPrompt(lead);

                // Get AI response
                let aiResponse;
                if (config.dryRun || !config.gemini.apiKey) {
                    aiResponse = generateEvalMockResponse(lead, scenario.expected_intent);
                } else {
                    aiResponse = await providerManager.analyze(lead, { systemPrompt, leadPrompt });

                    recordCost({
                        leadId: lead.lead_id,
                        eventType: 'eval_call',
                        provider: aiResponse.llm_provider || 'unknown',
                        costCents: config.cost.perAiCallCents,
                    });
                }

                // Judge the response
                const judgment = await judge.evaluate(scenario, aiResponse);

                const result = {
                    run_id: this.runId,
                    dataset_index: scenario.id,
                    scenario_name: scenario.scenario,
                    expected_intent: scenario.expected_intent,
                    actual_intent: aiResponse.intent_category,
                    confidence_score: aiResponse.confidence_score || 0,
                    tone_score: judgment.tone_score,
                    injection_resistant: judgment.injection_resistant ? 1 : 0,
                    quality_score: judgment.quality_score,
                    judge_reasoning: judgment.reasoning,
                    sms_generated: aiResponse.sms_body || '',
                };

                results.push(result);

                const intentMatch = result.expected_intent === result.actual_intent;
                if (intentMatch && judgment.quality_score >= 6) {
                    passed++;
                } else {
                    failed++;
                }

                logger.info(`[EVAL] Scenario ${scenario.id}/${dataset.length}: ${scenario.scenario} — Intent: ${intentMatch ? '✅' : '❌'} Quality: ${judgment.quality_score}/10`);

                // Rate limiting
                if (!config.dryRun) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (err) {
                logger.error(`[EVAL] Scenario ${scenario.id} error: ${err.message}`);
                results.push({
                    run_id: this.runId,
                    dataset_index: scenario.id,
                    scenario_name: scenario.scenario,
                    expected_intent: scenario.expected_intent,
                    actual_intent: 'error',
                    confidence_score: 0,
                    tone_score: 0,
                    injection_resistant: 0,
                    quality_score: 0,
                    judge_reasoning: `Error: ${err.message}`,
                    sms_generated: '',
                });
                failed++;
            }
        }

        // Persist results
        insertEvalResultsBatch(results);

        const summary = {
            runId: this.runId,
            totalScenarios: dataset.length,
            passed,
            failed,
            intentAccuracy: `${((results.filter(r => r.expected_intent === r.actual_intent).length / dataset.length) * 100).toFixed(1)}%`,
            avgToneScore: (results.reduce((sum, r) => sum + r.tone_score, 0) / results.length).toFixed(1),
            avgQualityScore: (results.reduce((sum, r) => sum + r.quality_score, 0) / results.length).toFixed(1),
            injectionResistRate: `${((results.filter(r => r.injection_resistant).length / results.length) * 100).toFixed(1)}%`,
        };

        logger.info(`[EVAL] Run complete: ${JSON.stringify(summary)}`);
        return summary;
    }
}

function generateEvalMockResponse(lead, expectedIntent) {
    const firstName = lead.full_name.split(' ')[0];
    const intents = {
        high: { confidence: 0.91, tone: 'professional', sms: `Hi ${firstName}, great to reconnect! Let's set up a call this week.` },
        medium: { confidence: 0.75, tone: 'casual', sms: `Hey ${firstName}, thought of you! Got some updates to share — interested?` },
        low: { confidence: 0.55, tone: 'friendly', sms: `Hi ${firstName}, hope all is well! We're here if you ever need us.` },
        not_interested: { confidence: 0.88, tone: 'friendly', sms: `Hi ${firstName}, thank you for your time. We respect your decision.` },
    };

    const preset = intents[expectedIntent] || intents.medium;

    return {
        intent_category: expectedIntent,
        intent_rationale: `Mock analysis categorized as ${expectedIntent}.`,
        recommended_angle: 'Mock engagement angle.',
        sms_body: preset.sms,
        tone: preset.tone,
        confidence_score: preset.confidence,
        llm_provider: 'mock',
    };
}

module.exports = { EvalRunner };
