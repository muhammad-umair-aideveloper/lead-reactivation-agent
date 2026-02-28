/**
 * Lead data validator
 */

/**
 * Validate a single parsed lead record.
 * @param {object} lead — Normalized lead object
 * @param {number} rowIndex — Row number for error reporting
 * @returns {string[]} — Array of validation error messages (empty = valid)
 */
function validateLead(lead, rowIndex) {
    const errors = [];

    // lead_id
    if (!lead.lead_id || lead.lead_id.length === 0) {
        errors.push('lead_id is required');
    }

    // full_name
    if (!lead.full_name || lead.full_name.length < 2) {
        errors.push('full_name must be at least 2 characters');
    }

    // phone_number — basic E.164 check
    if (!lead.phone_number || lead.phone_number.length < 10) {
        errors.push('phone_number is invalid (too short)');
    }
    if (lead.phone_number && !/^\+\d{10,15}$/.test(lead.phone_number)) {
        errors.push('phone_number does not match E.164 format');
    }

    // email — optional but validate if present
    if (lead.email && lead.email.length > 0) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(lead.email)) {
            errors.push('email format is invalid');
        }
    }

    // last_interaction_date
    if (!lead.last_interaction_date) {
        errors.push('last_interaction_date is required');
    } else {
        const d = new Date(lead.last_interaction_date);
        if (isNaN(d.getTime())) {
            errors.push('last_interaction_date is not a valid date');
        }
    }

    // lead_source
    if (!lead.lead_source || lead.lead_source.length === 0) {
        errors.push('lead_source is required');
    }

    return errors;
}

/**
 * Check for duplicate lead_ids in a batch.
 * @param {object[]} leads
 * @returns {{ unique: object[], duplicates: string[] }}
 */
function deduplicateLeads(leads) {
    const seen = new Set();
    const unique = [];
    const duplicates = [];

    for (const lead of leads) {
        if (seen.has(lead.lead_id)) {
            duplicates.push(lead.lead_id);
        } else {
            seen.add(lead.lead_id);
            unique.push(lead);
        }
    }

    return { unique, duplicates };
}

module.exports = { validateLead, deduplicateLeads };
