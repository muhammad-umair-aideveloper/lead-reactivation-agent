/**
 * Express Application Setup — with observability middleware
 */
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('../utils/logger');
const { tracingMiddleware } = require('../utils/tracing');
const routes = require('./routes');
const webhookHandler = require('../messaging/webhookHandler');

function createApp() {
    const app = express();

    // ── Security ───────────────────────────────
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
                imgSrc: ["'self'", "data:", "blob:"],
                connectSrc: ["'self'"],
            },
        },
    }));
    app.use(cors());

    // ── Observability: Request Tracing ─────────
    app.use(tracingMiddleware);

    // ── Body Parsing ───────────────────────────
    app.use(express.json({ limit: '10mb' }));

    // ── Static Files (Dashboard) ───────────────
    app.use(express.static(path.join(__dirname, '..', '..', 'public')));

    // ── API Routes ─────────────────────────────
    app.use('/api', routes);
    app.use('/api/webhooks/twilio', webhookHandler);

    // ── Health Check ─────────────────────────────
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            version: '1.0.0',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            requestId: req.requestId,
        });
    });

    // ── Error Handler ──────────────────────────
    app.use((err, req, res, next) => {
        logger.error(`[REQ:${req.requestId || 'unknown'}] Unhandled error:`, err);
        res.status(500).json({
            error: 'Internal server error',
            message: err.message,
            requestId: req.requestId,
        });
    });

    return app;
}

module.exports = { createApp };
