/**
 * ClaudeProvider — Anthropic Claude implementation (backup LLM)
 */
const LLMProvider = require('./LLMProvider');
const config = require('../../../config');
const logger = require('../../utils/logger');

class ClaudeProvider extends LLMProvider {
    constructor() {
        super('claude');
        this.client = null;
    }

    _initClient() {
        if (!this.client && config.claude.apiKey) {
            try {
                const Anthropic = require('@anthropic-ai/sdk');
                this.client = new Anthropic({ apiKey: config.claude.apiKey });
                logger.info(`[CLAUDE] Provider initialized with model: ${config.claude.model}`);
            } catch (err) {
                logger.warn(`[CLAUDE] Failed to initialize: ${err.message}`);
            }
        }
    }

    isAvailable() {
        return this.healthy && !!config.claude.apiKey;
    }

    async analyze(lead, { systemPrompt, leadPrompt }) {
        if (!config.claude.apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }

        this._initClient();

        if (!this.client) {
            throw new Error('Claude client failed to initialize');
        }

        const startTime = Date.now();

        try {
            const response = await this.client.messages.create({
                model: config.claude.model,
                max_tokens: 1024,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: leadPrompt },
                ],
            });

            const responseText = response.content[0].text.trim();
            const parsed = this._parseResponse(responseText);

            this.resetFailures();

            return {
                ...parsed,
                llm_provider: 'claude',
                _raw: responseText,
                _durationMs: Date.now() - startTime,
            };
        } catch (err) {
            this.recordFailure(err);
            throw err;
        }
    }

    _parseResponse(text) {
        let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        try {
            return JSON.parse(clean);
        } catch (e) {
            const jsonMatch = clean.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error(`Failed to parse Claude response as JSON: ${text.substring(0, 200)}`);
        }
    }
}

module.exports = ClaudeProvider;
