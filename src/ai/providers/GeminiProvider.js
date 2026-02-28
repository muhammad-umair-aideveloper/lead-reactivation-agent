/**
 * GeminiProvider — Google Generative AI implementation
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const LLMProvider = require('./LLMProvider');
const config = require('../../../config');
const logger = require('../../utils/logger');

class GeminiProvider extends LLMProvider {
    constructor() {
        super('gemini');
        this.genAI = null;
        this.model = null;
    }

    _initClient(systemPrompt) {
        if (!this.genAI && config.gemini.apiKey) {
            this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: config.gemini.model,
                systemInstruction: systemPrompt,
            });
            logger.info(`[GEMINI] Provider initialized with model: ${config.gemini.model}`);
        }
    }

    isAvailable() {
        return this.healthy && !!config.gemini.apiKey;
    }

    async analyze(lead, { systemPrompt, leadPrompt }) {
        if (!config.gemini.apiKey) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        this._initClient(systemPrompt);

        const startTime = Date.now();

        try {
            const result = await this.model.generateContent(leadPrompt);
            const responseText = result.response.text().trim();
            const parsed = this._parseResponse(responseText);

            this.resetFailures();

            return {
                ...parsed,
                llm_provider: 'gemini',
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
            throw new Error(`Failed to parse Gemini response as JSON: ${text.substring(0, 200)}`);
        }
    }
}

module.exports = GeminiProvider;
