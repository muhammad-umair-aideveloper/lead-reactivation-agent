/**
 * LLMProvider — Base interface for LLM providers
 * All providers must implement the analyze() method.
 */
class LLMProvider {
    constructor(name) {
        this.name = name;
        this.healthy = true;
        this.failureCount = 0;
        this.lastFailure = null;
    }

    /**
     * Analyze a lead and return structured response.
     * @param {object} lead — Lead data
     * @param {object} options — { systemPrompt, leadPrompt, ragContext }
     * @returns {Promise<object>} — { intent_category, confidence_score, sms_body, ... }
     */
    async analyze(lead, options) {
        throw new Error(`${this.name}: analyze() not implemented`);
    }

    /**
     * Mark the provider as failed.
     */
    recordFailure(error) {
        this.failureCount++;
        this.lastFailure = Date.now();
    }

    /**
     * Reset failure counters.
     */
    resetFailures() {
        this.failureCount = 0;
        this.lastFailure = null;
        this.healthy = true;
    }

    /**
     * Check if provider is available.
     */
    isAvailable() {
        return this.healthy;
    }
}

module.exports = LLMProvider;
