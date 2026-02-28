/**
 * Observability & Tracing — Structured trace context for the Lead Reactivation Agent
 *
 * Provides:
 *  - Trace IDs for correlating log entries across an entire workflow run
 *  - Span tracking for timing individual pipeline stages
 *  - Metrics collection (counters, histograms) exposed via /api/metrics
 *  - Express middleware for per-request tracing
 */
const crypto = require('crypto');
const logger = require('./logger');

// ── In-memory metrics store ──────────────────
const metrics = {
    counters: {},
    histograms: {},
    traces: [],          // Rolling buffer of recent traces
    maxTraces: 200,
};

/**
 * Generate a unique trace ID.
 */
function generateTraceId() {
    return `tr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Generate a unique span ID.
 */
function generateSpanId() {
    return `sp_${crypto.randomBytes(6).toString('hex')}`;
}

// ── Trace Context ────────────────────────────
class TraceContext {
    constructor(name, metadata = {}) {
        this.traceId = generateTraceId();
        this.name = name;
        this.metadata = metadata;
        this.spans = [];
        this.startTime = Date.now();
        this.endTime = null;
        this.status = 'running';
        this.error = null;
    }

    /**
     * Start a named span within this trace.
     * @param {string} spanName
     * @param {object} attrs — optional attributes
     * @returns {Span}
     */
    startSpan(spanName, attrs = {}) {
        const span = new Span(this.traceId, spanName, attrs);
        this.spans.push(span);
        logger.info(`[TRACE:${this.traceId}] ▶ SPAN ${spanName}`, { traceId: this.traceId, span: spanName, ...attrs });
        return span;
    }

    /**
     * End the trace and record it.
     */
    end(status = 'ok') {
        this.endTime = Date.now();
        this.status = status;
        const durationMs = this.endTime - this.startTime;

        recordHistogram(`trace.${this.name}.duration_ms`, durationMs);
        incrementCounter(`trace.${this.name}.${status}`);

        logger.info(`[TRACE:${this.traceId}] ■ COMPLETE ${this.name} — ${durationMs}ms (${status})`, {
            traceId: this.traceId,
            durationMs,
            status,
            spans: this.spans.length,
        });

        // Store in rolling buffer
        metrics.traces.push(this.toJSON());
        if (metrics.traces.length > metrics.maxTraces) {
            metrics.traces.shift();
        }

        return this;
    }

    /**
     * Mark the trace as failed.
     */
    fail(error) {
        this.error = error instanceof Error ? error.message : String(error);
        return this.end('error');
    }

    toJSON() {
        return {
            traceId: this.traceId,
            name: this.name,
            status: this.status,
            startTime: new Date(this.startTime).toISOString(),
            endTime: this.endTime ? new Date(this.endTime).toISOString() : null,
            durationMs: this.endTime ? this.endTime - this.startTime : null,
            error: this.error,
            metadata: this.metadata,
            spans: this.spans.map(s => s.toJSON()),
        };
    }
}

// ── Span ─────────────────────────────────────
class Span {
    constructor(traceId, name, attrs = {}) {
        this.spanId = generateSpanId();
        this.traceId = traceId;
        this.name = name;
        this.attrs = attrs;
        this.startTime = Date.now();
        this.endTime = null;
        this.status = 'running';
        this.error = null;
        this.events = [];
    }

    /** Add an event to the span timeline. */
    addEvent(name, data = {}) {
        this.events.push({ name, timestamp: Date.now(), data });
        return this;
    }

    /** Set additional attributes. */
    setAttributes(attrs) {
        Object.assign(this.attrs, attrs);
        return this;
    }

    /** End the span successfully. */
    end(status = 'ok') {
        this.endTime = Date.now();
        this.status = status;
        const durationMs = this.endTime - this.startTime;

        recordHistogram(`span.${this.name}.duration_ms`, durationMs);
        incrementCounter(`span.${this.name}.${status}`);

        logger.info(`[TRACE:${this.traceId}] ◼ SPAN ${this.name} — ${durationMs}ms (${status})`, {
            traceId: this.traceId,
            spanId: this.spanId,
            durationMs,
        });

        return this;
    }

    /** Mark span as failed. */
    fail(error) {
        this.error = error instanceof Error ? error.message : String(error);
        return this.end('error');
    }

    toJSON() {
        return {
            spanId: this.spanId,
            name: this.name,
            status: this.status,
            startTime: new Date(this.startTime).toISOString(),
            endTime: this.endTime ? new Date(this.endTime).toISOString() : null,
            durationMs: this.endTime ? this.endTime - this.startTime : null,
            error: this.error,
            attrs: this.attrs,
            events: this.events,
        };
    }
}

// ── Metrics Helpers ──────────────────────────

function incrementCounter(name, value = 1) {
    metrics.counters[name] = (metrics.counters[name] || 0) + value;
}

function recordHistogram(name, value) {
    if (!metrics.histograms[name]) {
        metrics.histograms[name] = { count: 0, sum: 0, min: Infinity, max: -Infinity, values: [] };
    }
    const h = metrics.histograms[name];
    h.count++;
    h.sum += value;
    h.min = Math.min(h.min, value);
    h.max = Math.max(h.max, value);
    // Keep last 100 values for percentile estimation
    h.values.push(value);
    if (h.values.length > 100) h.values.shift();
}

function getMetricsSnapshot() {
    const histogramSummary = {};
    for (const [name, h] of Object.entries(metrics.histograms)) {
        const sorted = [...h.values].sort((a, b) => a - b);
        histogramSummary[name] = {
            count: h.count,
            sum: h.sum,
            min: h.min === Infinity ? 0 : h.min,
            max: h.max === -Infinity ? 0 : h.max,
            avg: h.count > 0 ? Math.round(h.sum / h.count) : 0,
            p50: percentile(sorted, 0.5),
            p95: percentile(sorted, 0.95),
            p99: percentile(sorted, 0.99),
        };
    }

    return {
        timestamp: new Date().toISOString(),
        counters: { ...metrics.counters },
        histograms: histogramSummary,
        recentTraces: metrics.traces.slice(-20),
    };
}

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)];
}

// ── Express Middleware ───────────────────────
function tracingMiddleware(req, res, next) {
    const requestId = generateTraceId();
    req.requestId = requestId;
    req.startTime = Date.now();

    // Attach to response header
    res.setHeader('X-Request-Id', requestId);

    // On response finish
    res.on('finish', () => {
        const durationMs = Date.now() - req.startTime;
        const route = req.route ? req.route.path : req.url;

        incrementCounter('http.requests.total');
        incrementCounter(`http.requests.${res.statusCode}`);
        recordHistogram('http.request.duration_ms', durationMs);

        if (res.statusCode >= 400) {
            incrementCounter('http.requests.errors');
        }

        // Only log API calls, not static files
        if (req.url.startsWith('/api')) {
            logger.info(`[REQ:${requestId}] ${req.method} ${req.url} → ${res.statusCode} (${durationMs}ms)`);
        }
    });

    next();
}

// ── Convenience: create a trace and auto-manage it ──
async function withTrace(name, metadata, fn) {
    const trace = new TraceContext(name, metadata);
    try {
        const result = await fn(trace);
        trace.end('ok');
        return result;
    } catch (err) {
        trace.fail(err);
        throw err;
    }
}

module.exports = {
    TraceContext,
    Span,
    generateTraceId,
    incrementCounter,
    recordHistogram,
    getMetricsSnapshot,
    tracingMiddleware,
    withTrace,
};
