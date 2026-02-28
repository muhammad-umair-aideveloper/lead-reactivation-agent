/**
 * Routes v2 — Controller-based routing
 * Delegates to individual controllers for separation of concerns.
 */
const express = require('express');
const router = express.Router();

// Register all controllers
const LeadController = require('../controllers/LeadController');
const AnalyticsController = require('../controllers/AnalyticsController');
const WebhookController = require('../controllers/WebhookController');
const EscalationController = require('../controllers/EscalationController');
const EvalController = require('../controllers/EvalController');

LeadController.register(router);
AnalyticsController.register(router);
WebhookController.register(router);
EscalationController.register(router);
EvalController.register(router);

module.exports = router;
