/**
 * SMS Scheduler — Cron job for sending queued messages during business hours
 */
const cron = require('node-cron');
const config = require('../../config');
const logger = require('../utils/logger');
const { sendSMS, isBusinessHours } = require('./twilioClient');
const { getPendingAnalyzedLeads, updateLeadState, insertMessageLog } = require('../data/database');

let schedulerRunning = false;

/**
 * Start the SMS sending scheduler.
 * Runs every minute to check for queued leads and send messages.
 */
function startScheduler() {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        if (schedulerRunning) {
            logger.debug('Scheduler already running, skipping tick.');
            return;
        }

        // Check business hours (skip in DRY_RUN to allow testing)
        if (!config.dryRun && !isBusinessHours()) {
            return;
        }

        schedulerRunning = true;
        try {
            await processQueue();
        } catch (err) {
            logger.error('Scheduler error:', err);
        } finally {
            schedulerRunning = false;
        }
    });

    logger.info(`SMS scheduler started (business hours: ${config.businessHours.start}:00 - ${config.businessHours.end}:00)`);
}

/**
 * Process the message queue — send SMS to pending analyzed leads.
 */
async function processQueue() {
    const leads = getPendingAnalyzedLeads();

    if (leads.length === 0) return;

    logger.info(`Processing ${leads.length} leads in send queue...`);

    // Rate limit: 1 message per second for standard Twilio accounts
    for (const lead of leads) {
        // Skip not_interested leads
        if (lead.intent_category === 'not_interested') {
            logger.info(`Skipping not_interested lead: ${lead.lead_id}`);
            continue;
        }

        try {
            const messageVariant = `v1_${lead.intent_category}_${lead.tone || 'default'}`;

            const result = await sendSMS({
                to: lead.phone_number,
                body: lead.sms_body,
                leadId: lead.lead_id,
                intentScore: lead.intent_category,
                messageVariant,
            });

            // Log the message
            insertMessageLog({
                lead_id: lead.lead_id,
                twilio_sid: result.sid,
                direction: 'outbound',
                body: lead.sms_body,
                intent_score: lead.intent_category,
                message_variant: messageVariant,
                status: result.status,
            });

            // Update lead state
            updateLeadState(lead.lead_id, 'message_sent');

            logger.info(`✅ Message sent to ${lead.full_name} (${lead.lead_id})`);

            // Rate limiting delay (1 second between messages)
            if (!config.dryRun) {
                await new Promise(resolve => setTimeout(resolve, 1100));
            }

        } catch (err) {
            logger.error(`Failed to send SMS to ${lead.lead_id}: ${err.message}`);
            // Don't update state — leave as pending for retry on next tick
        }
    }
}

module.exports = { startScheduler, processQueue };
