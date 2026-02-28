/**
 * ProviderManager — LLM provider orchestration with circuit breaker and failover
 *
 * Manages multiple LLM providers (Gemini, Claude) with:
 *  - Automatic failover when primary provider fails
 *  - Circuit breaker pattern (open after N failures, auto-reset after timeout)
 *  - Health checks and provider selection
 */
const config = require('../../../config');
const logger = require('../../utils/logger');
const GeminiProvider = require('./GeminiProvider');
const ClaudeProvider = require('./ClaudeProvider');

class ProviderManager {
    constructor() {
        this.providers = new Map();
        this.circuitBreakers = new Map();

        // Register providers
        this.providers.set('gemini', new GeminiProvider());
        this.providers.set('claude', new ClaudeProvider());

        // Initialize circuit breakers
        for (const [name] of this.providers) {
            this.circuitBreakers.set(name, {
                state: 'closed',        // closed = healthy, open = failing, half-open = testing
                failures: 0,
                lastFailure: null,
                lastSuccess: null,
            });
        }
    }

    /**
     * Get the best available provider, with failover logic.
     * @returns {LLMProvider|null}
     */
    _selectProvider() {
        const primaryName = config.llm.primary;
        const primary = this.providers.get(primaryName);

        // Try primary first
        if (primary && primary.isAvailable() && this._isCircuitClosed(primaryName)) {
            return primary;
        }

        // Failover if enabled
        if (config.llm.failoverEnabled) {
            for (const [name, provider] of this.providers) {
                if (name !== primaryName && provider.isAvailable() && this._isCircuitClosed(name)) {
                    logger.warn(`[PROVIDER] Failing over from ${primaryName} to ${name}`);
                    return provider;
                }
            }
        }

        // Try half-open circuit on primary (test if it's recovered)
        if (primary && primary.isAvailable()) {
            const cb = this.circuitBreakers.get(primaryName);
            if (cb.state === 'open') {
                const elapsed = Date.now() - cb.lastFailure;
                if (elapsed > config.llm.circuitBreaker.resetTimeoutMs) {
                    cb.state = 'half-open';
                    logger.info(`[PROVIDER] Circuit breaker half-open for ${primaryName}, testing...`);
                    return primary;
                }
            }
        }

        return null;
    }

    /**
     * Check if a provider's circuit is closed (healthy).
     */
    _isCircuitClosed(name) {
        const cb = this.circuitBreakers.get(name);
        if (!cb) return true;
        if (cb.state === 'closed') return true;
        if (cb.state === 'half-open') return true;

        // Check if enough time has passed to re-try
        if (cb.state === 'open' && cb.lastFailure) {
            const elapsed = Date.now() - cb.lastFailure;
            if (elapsed > config.llm.circuitBreaker.resetTimeoutMs) {
                cb.state = 'half-open';
                return true;
            }
        }

        return false;
    }

    /**
     * Record a successful call to a provider.
     */
    _recordSuccess(name) {
        const cb = this.circuitBreakers.get(name);
        if (cb) {
            cb.state = 'closed';
            cb.failures = 0;
            cb.lastSuccess = Date.now();
        }
    }

    /**
     * Record a failure and potentially open the circuit.
     */
    _recordFailure(name) {
        const cb = this.circuitBreakers.get(name);
        if (cb) {
            cb.failures++;
            cb.lastFailure = Date.now();

            if (cb.failures >= config.llm.circuitBreaker.failureThreshold) {
                cb.state = 'open';
                logger.error(`[PROVIDER] Circuit OPEN for ${name} after ${cb.failures} failures`);
            }
        }
    }

    /**
     * Analyze a lead using the best available provider with failover.
     * @param {object} lead — Lead data
     * @param {object} options — { systemPrompt, leadPrompt }
     * @returns {Promise<object>}
     */
    async analyze(lead, options) {
        const provider = this._selectProvider();

        if (!provider) {
            logger.error('[PROVIDER] No available LLM providers');
            throw new Error('All LLM providers are unavailable');
        }

        try {
            const result = await provider.analyze(lead, options);
            this._recordSuccess(provider.name);
            return result;
        } catch (err) {
            this._recordFailure(provider.name);
            logger.warn(`[PROVIDER] ${provider.name} failed: ${err.message}`);

            // Try failover
            if (config.llm.failoverEnabled) {
                for (const [name, fallback] of this.providers) {
                    if (name !== provider.name && fallback.isAvailable() && this._isCircuitClosed(name)) {
                        logger.info(`[PROVIDER] Attempting failover to ${name}`);
                        try {
                            const result = await fallback.analyze(lead, options);
                            this._recordSuccess(name);
                            return result;
                        } catch (fallbackErr) {
                            this._recordFailure(name);
                            logger.error(`[PROVIDER] Failover to ${name} also failed: ${fallbackErr.message}`);
                        }
                    }
                }
            }

            throw err;
        }
    }

    /**
     * Get health status of all providers.
     */
    getHealthStatus() {
        const status = {};
        for (const [name, provider] of this.providers) {
            const cb = this.circuitBreakers.get(name);
            status[name] = {
                available: provider.isAvailable(),
                circuitState: cb ? cb.state : 'unknown',
                failures: cb ? cb.failures : 0,
                lastFailure: cb && cb.lastFailure ? new Date(cb.lastFailure).toISOString() : null,
                lastSuccess: cb && cb.lastSuccess ? new Date(cb.lastSuccess).toISOString() : null,
            };
        }
        return status;
    }
}

// Singleton
let instance = null;
function getProviderManager() {
    if (!instance) instance = new ProviderManager();
    return instance;
}

module.exports = { ProviderManager, getProviderManager };
