/**
 * Server Entry Point — Bootstrap all subsystems
 */
const config = require('./config');
const logger = require('./src/utils/logger');
const { createApp } = require('./src/server/app');
const { initializeDatabase } = require('./src/data/database');
const { startScheduler } = require('./src/messaging/scheduler');
const { startTimeoutChecker } = require('./src/state/stateMachine');

async function bootstrap() {
    logger.info('═════════════════════════════════════════════════');
    logger.info('  Lead Reactivation Agent — Autonomous AI');
    logger.info('═════════════════════════════════════════════════');

    // Validate configuration
    const warnings = config.validate();
    warnings.forEach(w => logger.warn(w));

    if (config.dryRun) {
        logger.info('🔒 DRY_RUN mode is ON — no real SMS or AI calls will be made.');
    }

    // Step 1: Database
    logger.info('[BOOT] Initializing database...');
    initializeDatabase();
    logger.info('✅ Database initialized.');

    // Step 2: Start background jobs
    logger.info('[BOOT] Starting background schedulers...');
    startScheduler();
    startTimeoutChecker();
    logger.info('⏰ Background schedulers started.');

    // Step 3: Start HTTP Server
    const app = createApp();
    const PORT = config.port;
    app.listen(PORT, () => {
        logger.info(`🚀 Lead Reactivation Agent running on http://localhost:${PORT}`);
        logger.info(`📊 Dashboard available at http://localhost:${PORT}`);
        logger.info(`🔍 Metrics at http://localhost:${PORT}/api/metrics`);
        logger.info(`Mode: ${config.dryRun ? '🧪 DRY RUN' : '🚀 PRODUCTION'}`);
        logger.info(`Business Hours: ${config.businessHours.start}:00 - ${config.businessHours.end}:00`);
        logger.info('═════════════════════════════════════════════════');
    });
}

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Graceful shutdown initiated...');
    process.exit(0);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
});

bootstrap().catch(err => {
    logger.error('Fatal startup error:', err);
    process.exit(1);
});
