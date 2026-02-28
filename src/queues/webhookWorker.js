/**
 * Webhook Worker — Processes inbound Twilio webhooks asynchronously
 */
const logger = require('../utils/logger');
const { createWorker } = require('./queueManager');
const { getLeadByPhone, updateLeadState } = require('../repositories/LeadRepository');
const { insertInboundMessage, updateMessageStatus } = require('../repositories/MessageRepository');
const { createEscalation } = require('../repositories/EscalationRepository');
const { transitionState } = require('../state/stateMachine');

const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'quit', 'cancel', 'opt out', 'optout', 'remove'];

function startWebhookWorker() {
    createWorker('webhook-inbound', async (job) => {
        const { type, payload } = job.data;

        if (type === 'inbound_sms') {
            await processInboundSMS(payload);
        } else if (type === 'status_update') {
            await processStatusUpdate(payload);
        }
    }, { concurrency: 5 });

    logger.info('[WORKER] Webhook worker started');
}

async function processInboundSMS({ from, body }) {
    const lead = getLeadByPhone(from);
    if (!lead) {
        logger.warn(`[WEBHOOK-WORKER] SMS from unknown number: ${from}`);
        return;
    }

    const isOptOut = OPT_OUT_KEYWORDS.some(kw => body.toLowerCase().includes(kw));

    if (isOptOut) {
        transitionState(lead.lead_id, lead.state, 'escalated', 'opt_out', { lead });
        insertInboundMessage(lead.lead_id, body);

        createEscalation({
            leadId: lead.lead_id,
            reason: 'Lead opted out',
            confidenceScore: null,
            aiResponse: null,
        });

        logger.info(`[WEBHOOK-WORKER] Lead ${lead.lead_id} opted out → escalated`);
        return;
    }

    transitionState(lead.lead_id, lead.state, 'replied', 'inbound_reply', { lead });
    insertInboundMessage(lead.lead_id, body);
    logger.info(`[WEBHOOK-WORKER] Lead ${lead.lead_id} replied: "${body}"`);
}

async function processStatusUpdate({ messageSid, messageStatus, leadId }) {
    logger.info(`[WEBHOOK-WORKER] Delivery status: ${messageSid} → ${messageStatus}`);
    if (messageSid) {
        updateMessageStatus(messageSid, messageStatus);
    }
}

module.exports = { startWebhookWorker };
