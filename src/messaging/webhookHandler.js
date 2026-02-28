/**
 * Webhook Handler — Process inbound Twilio SMS and delivery status callbacks
 */
const express = require('express');
const logger = require('../utils/logger');
const { validateTwilioSignature } = require('./twilioClient');
const { getLeadByPhone, updateLeadState, insertInboundMessage, updateMessageStatus } = require('../data/database');
const config = require('../../config');

const router = express.Router();

// Opt-out keywords
const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'quit', 'cancel', 'opt out', 'optout', 'remove'];

/**
 * POST /api/webhooks/twilio/inbound
 * Handles inbound SMS replies from leads.
 */
router.post('/inbound', express.urlencoded({ extended: false }), (req, res) => {
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

        logger.info(`Inbound SMS from ${from}: "${body}"`);

        // Find the lead by phone number
        const lead = getLeadByPhone(from);
        if (!lead) {
            logger.warn(`Received SMS from unknown number: ${from}`);
            // Respond with empty TwiML
            res.type('text/xml').send('<Response></Response>');
            return;
        }

        // Check for opt-out
        const isOptOut = OPT_OUT_KEYWORDS.some(kw => body.toLowerCase().includes(kw));

        if (isOptOut) {
            updateLeadState(lead.lead_id, 'opted_out');
            insertInboundMessage(lead.lead_id, body);
            logger.info(`Lead ${lead.lead_id} opted out.`);

            res.type('text/xml').send(`<Response><Message>You've been unsubscribed. We won't contact you again.</Message></Response>`);
            return;
        }

        // Mark as replied
        updateLeadState(lead.lead_id, 'replied');
        insertInboundMessage(lead.lead_id, body);
        logger.info(`Lead ${lead.lead_id} replied: "${body}"`);

        // Acknowledge with empty TwiML (no auto-response)
        res.type('text/xml').send('<Response></Response>');

    } catch (err) {
        logger.error('Inbound webhook error:', err);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * POST /api/webhooks/twilio/status
 * Handles delivery status callbacks from Twilio.
 */
router.post('/status', express.urlencoded({ extended: false }), (req, res) => {
    try {
        const { MessageSid, MessageStatus } = req.body;
        const leadId = req.query.leadId;

        logger.info(`Delivery status for ${MessageSid}: ${MessageStatus} (lead: ${leadId})`);

        if (MessageSid) {
            updateMessageStatus(MessageSid, MessageStatus);
        }

        res.sendStatus(200);
    } catch (err) {
        logger.error('Status webhook error:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
