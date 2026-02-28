/**
 * Twilio SMS Client — Send messages and handle callbacks
 */
const config = require('../../config');
const logger = require('../utils/logger');

let twilioClient = null;

function getClient() {
    if (!twilioClient && config.twilio.accountSid && config.twilio.authToken) {
        const twilio = require('twilio');
        twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
    }
    return twilioClient;
}

/**
 * Send an SMS message.
 * @param {object} params
 * @param {string} params.to — Recipient phone number (E.164)
 * @param {string} params.body — Message body
 * @param {string} params.leadId — Lead ID for tracking
 * @param {string} params.intentScore — AI intent category
 * @param {string} params.messageVariant — Message variant ID
 * @returns {Promise<object>} — { sid, status } or mock equivalent
 */
async function sendSMS({ to, body, leadId, intentScore, messageVariant }) {
    if (config.dryRun) {
        const mockSid = `MOCK_${Date.now()}_${leadId}`;
        logger.info(`[DRY_RUN] SMS to ${to}: "${body}" | SID: ${mockSid}`);
        return {
            sid: mockSid,
            status: 'sent',
            to,
            body,
            dateCreated: new Date().toISOString(),
        };
    }

    const client = getClient();
    if (!client) {
        throw new Error('Twilio client not initialized — check credentials.');
    }

    try {
        const message = await client.messages.create({
            to,
            from: config.twilio.phoneNumber,
            body,
            statusCallback: `${config.webhookBaseUrl}/api/webhooks/twilio/status?leadId=${encodeURIComponent(leadId)}&intent=${encodeURIComponent(intentScore)}&variant=${encodeURIComponent(messageVariant)}`,
        });

        logger.info(`SMS sent to ${to} | SID: ${message.sid} | Status: ${message.status}`);
        return {
            sid: message.sid,
            status: message.status,
            to: message.to,
            body: message.body,
            dateCreated: message.dateCreated,
        };
    } catch (err) {
        logger.error(`Failed to send SMS to ${to}: ${err.message}`);
        throw err;
    }
}

/**
 * Check if current time is within business hours.
 * @returns {boolean}
 */
function isBusinessHours() {
    const now = new Date();
    const hour = now.getHours();
    return hour >= config.businessHours.start && hour < config.businessHours.end;
}

/**
 * Validate a Twilio webhook request signature.
 * @param {string} signature — X-Twilio-Signature header
 * @param {string} url — Full request URL
 * @param {object} params — Request body params
 * @returns {boolean}
 */
function validateTwilioSignature(signature, url, params) {
    if (config.dryRun) return true;

    try {
        const twilio = require('twilio');
        return twilio.validateRequest(config.twilio.authToken, signature, url, params);
    } catch (err) {
        logger.error('Twilio signature validation error:', err);
        return false;
    }
}

module.exports = { sendSMS, isBusinessHours, validateTwilioSignature };
