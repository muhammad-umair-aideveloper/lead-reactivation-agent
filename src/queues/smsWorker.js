/**
 * SMS Worker — Queue-driven SMS sending (replaces cron scheduler)
 */
const logger = require('../utils/logger');
const config = require('../../config');
const { createWorker, getQueue } = require('./queueManager');
const { sendSMS, isBusinessHours } = require('../messaging/twilioClient');
const { getIdleAnalyzedLeads } = require('../repositories/LeadRepository');
const { insertMessageLog } = require('../repositories/MessageRepository');
const { recordCost } = require('../repositories/CostRepository');
const { transitionState } = require('../state/stateMachine');
const cron = require('node-cron');

function startSMSWorker() {
    // Worker processes individual SMS jobs
    createWorker('sms-outbound', async (job) => {
        const { lead } = job.data;

        if (lead.intent_category === 'not_interested') {
            logger.info(`[SMS-WORKER] Skipping not_interested lead: ${lead.lead_id}`);
            return;
        }

        const messageVariant = `v2_${lead.intent_category}_${lead.tone || 'default'}`;

        const result = await sendSMS({
            to: lead.phone_number,
            body: lead.sms_body,
            leadId: lead.lead_id,
            intentScore: lead.intent_category,
            messageVariant,
        });

        insertMessageLog({
            lead_id: lead.lead_id,
            twilio_sid: result.sid,
            direction: 'outbound',
            body: lead.sms_body,
            intent_score: lead.intent_category,
            message_variant: messageVariant,
            status: result.status,
        });

        transitionState(lead.lead_id, 'idle', 'contacted', 'sms_sent', { lead });

        // Track cost
        recordCost({
            leadId: lead.lead_id,
            eventType: 'sms_sent',
            provider: 'twilio',
            costCents: config.cost.perSmsCents,
        });

        logger.info(`[SMS-WORKER] ✅ SMS sent to ${lead.full_name} (${lead.lead_id})`);

        // Rate limiting
        if (!config.dryRun) {
            await new Promise(resolve => setTimeout(resolve, 1100));
        }
    }, { concurrency: 1 });

    // Cron to feed the queue every minute
    cron.schedule('* * * * *', async () => {
        if (!config.dryRun && !isBusinessHours()) return;

        try {
            const leads = getIdleAnalyzedLeads();
            if (leads.length === 0) return;

            const queue = getQueue('sms-outbound');
            if (!queue) return;

            logger.info(`[SMS-WORKER] Enqueueing ${leads.length} leads for SMS sending`);

            for (const lead of leads) {
                await queue.add('send-sms', { lead }, {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                });
            }
        } catch (err) {
            logger.error('[SMS-WORKER] Queue feed error:', err);
        }
    });

    logger.info(`[SMS-WORKER] Started (business hours: ${config.businessHours.start}:00 - ${config.businessHours.end}:00)`);
}

module.exports = { startSMSWorker };
