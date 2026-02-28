/**
 * Lead State Machine v2 — Formal states with guards and audit trail
 *
 * States: idle → contacted → replied | escalated
 *
 * Transitions:
 *   idle → contacted       (SMS sent)
 *   idle → escalated       (low confidence / HITL trigger)
 *   contacted → replied    (lead responds)
 *   contacted → escalated  (timeout / opt-out / manual)
 *   escalated → idle       (re-queue after human review)
 *   escalated → contacted  (human sends follow-up)
 */
const config = require('../../config');
const cron = require('node-cron');
const logger = require('../utils/logger');
const { updateLeadState, getTimedOutLeads } = require('../repositories/LeadRepository');
const { insertStateAuditLog } = require('../repositories/ReasoningRepository');

// ── State Definitions ────────────────────────
const STATES = {
    IDLE: 'idle',
    CONTACTED: 'contacted',
    REPLIED: 'replied',
    ESCALATED: 'escalated',
};

// ── Valid Transitions with Guard Conditions ──
const TRANSITIONS = {
    idle: {
        contacted: {
            event: 'sms_sent',
            guard: (lead) => lead.sms_body && lead.intent_category,
        },
        escalated: {
            event: 'low_confidence',
            guard: (lead) => true,
        },
    },
    contacted: {
        replied: {
            event: 'inbound_reply',
            guard: (lead) => true,
        },
        escalated: {
            event: 'timeout_or_optout',
            guard: (lead) => true,
        },
    },
    escalated: {
        idle: {
            event: 'hitl_requeue',
            guard: (lead) => true,
        },
        contacted: {
            event: 'hitl_followup',
            guard: (lead) => true,
        },
    },
    replied: {
        // Terminal state — no outgoing transitions
    },
};

/**
 * Transition a lead to a new state with audit logging.
 * @param {string} leadId
 * @param {string} currentState
 * @param {string} newState
 * @param {string} triggerEvent — Event that caused the transition
 * @param {object} metadata — Optional metadata for audit log
 * @returns {boolean} — Whether the transition was successful
 */
function transitionState(leadId, currentState, newState, triggerEvent = 'manual', metadata = {}) {
    const stateTransitions = TRANSITIONS[currentState];

    if (!stateTransitions || !stateTransitions[newState]) {
        logger.warn(`[STATE] Invalid transition for ${leadId}: ${currentState} → ${newState}`);
        return false;
    }

    const transition = stateTransitions[newState];

    // Check guard condition
    if (transition.guard && !transition.guard(metadata.lead || {})) {
        logger.warn(`[STATE] Guard blocked transition for ${leadId}: ${currentState} → ${newState}`);
        return false;
    }

    // Execute the transition
    updateLeadState(leadId, newState);

    // Audit log
    insertStateAuditLog({
        leadId,
        fromState: currentState,
        toState: newState,
        triggerEvent: triggerEvent || transition.event,
        metadata,
    });

    logger.info(`[STATE] ${leadId}: ${currentState} → ${newState} (${triggerEvent})`);
    return true;
}

/**
 * Check if a transition is valid without executing it.
 */
function canTransition(currentState, newState) {
    const stateTransitions = TRANSITIONS[currentState];
    return !!(stateTransitions && stateTransitions[newState]);
}

/**
 * Get all valid next states from a given state.
 */
function getValidTransitions(currentState) {
    const stateTransitions = TRANSITIONS[currentState];
    return stateTransitions ? Object.keys(stateTransitions) : [];
}

/**
 * Start the timeout checker cron job.
 * Runs every 15 minutes to escalate stale contacted leads.
 */
function startTimeoutChecker() {
    cron.schedule('*/15 * * * *', () => {
        try {
            const timedOut = getTimedOutLeads(config.leadTimeoutHours);

            if (timedOut.length > 0) {
                logger.info(`[STATE] Timeout checker: ${timedOut.length} leads exceeded ${config.leadTimeoutHours}h threshold.`);

                for (const lead of timedOut) {
                    transitionState(lead.lead_id, 'contacted', 'escalated', 'timeout', {
                        reason: `No reply after ${config.leadTimeoutHours}h`,
                        lead,
                    });
                }
            }
        } catch (err) {
            logger.error('[STATE] Timeout checker error:', err);
        }
    });

    logger.info(`[STATE] Timeout checker started (${config.leadTimeoutHours}h threshold, runs every 15 min).`);
}

module.exports = {
    STATES,
    TRANSITIONS,
    transitionState,
    canTransition,
    getValidTransitions,
    startTimeoutChecker,
};
