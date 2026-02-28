/**
 * WebhookController — Twilio webhooks → BullMQ queue
 * Immediately enqueues inbound messages and status updates for async processing.
 */
const express = require('express');
const logger = require('../utils/logger');
const config = require('../../config');
const { validateTwilioSignature } = require('../messaging/twilioClient');
const { getQueue } = require('../queues/queueManager');

function register(router) {
    /**
     * POST /api/webhooks/twilio/inbound — Inbound SMS
     */
    router.post('/webhooks/twilio/inbound', express.urlencoded({ extended: false }), (req, res) => {
        // Validate Twilio signature in production
        if (!config.dryRun) {
            const signature = req.headers['x-twilio-signature'] || '';
            const url = `${config.webhookBaseUrl}/api/webhooks/twilio/inbound`;
            if (!validateTwilioSignature(signature, url, req.body)) {
                logger.warn('Invalid Twilio signature on inbound webhook');
                return res.status(403).send('Forbidden');
            }
        }

        try {
            const from = req.body.From;
            const body = (req.body.Body || '').trim();

            logger.info(`[WEBHOOK] Inbound SMS from ${from}: "${body}"`);

            // Enqueue for async processing
            const queue = getQueue('webhook-inbound');
            if (queue) {
                queue.add('inbound-sms', {
                    type: 'inbound_sms',
                    payload: { from, body },
                }, {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 1000 },
                });
            }

            // Respond immediately with empty TwiML (no data loss)
            res.type('text/xml').send('<Response></Response>');
        } catch (err) {
            logger.error('Inbound webhook error:', err);
            res.status(500).send('Internal Server Error');
        }
    });

    /**
     * POST /api/webhooks/twilio/status — Delivery status callbacks
     */
    router.post('/webhooks/twilio/status', express.urlencoded({ extended: false }), (req, res) => {
        try {
            const { MessageSid, MessageStatus } = req.body;
            const leadId = req.query.leadId;

            logger.info(`[WEBHOOK] Status: ${MessageSid} → ${MessageStatus} (lead: ${leadId})`);

            // Enqueue for async processing
            const queue = getQueue('webhook-inbound');
            if (queue) {
                queue.add('status-update', {
                    type: 'status_update',
                    payload: { messageSid: MessageSid, messageStatus: MessageStatus, leadId },
                });
            }

            res.sendStatus(200);
        } catch (err) {
            logger.error('Status webhook error:', err);
            res.status(500).send('Internal Server Error');
        }
    });
}

module.exports = { register };
