/**
 * CSV Parser — Streams and parses uploaded CSV files
 */
const { parse } = require('csv-parse');
const { validateLead } = require('./validator');
const logger = require('../utils/logger');

const REQUIRED_COLUMNS = ['lead_id', 'full_name', 'phone_number', 'last_interaction_date', 'lead_source'];
const ALL_COLUMNS = [...REQUIRED_COLUMNS, 'email', 'notes'];

/**
 * Parse a CSV buffer into validated lead objects.
 * @param {Buffer|string} csvData — Raw CSV content
 * @returns {Promise<{ leads: object[], errors: object[] }>}
 */
async function parseCSV(csvData) {
    return new Promise((resolve, reject) => {
        const leads = [];
        const errors = [];
        let rowIndex = 0;

        const parser = parse(csvData, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
        });

        parser.on('readable', () => {
            let record;
            while ((record = parser.read()) !== null) {
                rowIndex++;
                try {
                    // Normalize column names (lowercase, trim, replace spaces with underscore)
                    const normalized = {};
                    for (const [key, value] of Object.entries(record)) {
                        const normKey = key.toLowerCase().trim().replace(/\s+/g, '_');
                        normalized[normKey] = value;
                    }

                    // Check required columns
                    const missing = REQUIRED_COLUMNS.filter(col => !normalized[col] || normalized[col].trim() === '');
                    if (missing.length > 0) {
                        errors.push({ row: rowIndex, error: `Missing required fields: ${missing.join(', ')}`, data: normalized });
                        continue;
                    }

                    // Build lead object
                    const lead = {
                        lead_id: normalized.lead_id.trim(),
                        full_name: sanitizeText(normalized.full_name),
                        phone_number: normalizePhone(normalized.phone_number),
                        email: normalized.email ? normalized.email.trim() : null,
                        last_interaction_date: normalizeDate(normalized.last_interaction_date),
                        lead_source: sanitizeText(normalized.lead_source),
                        notes: normalized.notes ? sanitizeText(normalized.notes) : null,
                    };

                    // Validate
                    const validationErrors = validateLead(lead, rowIndex);
                    if (validationErrors.length > 0) {
                        errors.push({ row: rowIndex, error: validationErrors.join('; '), data: lead });
                        continue;
                    }

                    leads.push(lead);
                } catch (err) {
                    errors.push({ row: rowIndex, error: err.message, data: record });
                }
            }
        });

        parser.on('error', (err) => {
            logger.error('CSV parsing error:', err);
            reject(err);
        });

        parser.on('end', () => {
            logger.info(`CSV parsed: ${leads.length} valid leads, ${errors.length} errors.`);
            resolve({ leads, errors });
        });
    });
}

/**
 * Validate that CSV headers contain all required columns.
 */
function validateHeaders(headers) {
    const normalized = headers.map(h => h.toLowerCase().trim().replace(/\s+/g, '_'));
    const missing = REQUIRED_COLUMNS.filter(col => !normalized.includes(col));
    return missing;
}

/**
 * Normalize phone number to E.164-like format.
 */
function normalizePhone(phone) {
    if (!phone) return '';
    // Strip everything except digits and leading +
    let cleaned = phone.replace(/[^\d+]/g, '');
    // Ensure it starts with +
    if (!cleaned.startsWith('+')) {
        // Assume US if 10 digits
        if (cleaned.length === 10) {
            cleaned = '+1' + cleaned;
        } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
            cleaned = '+' + cleaned;
        } else {
            cleaned = '+' + cleaned;
        }
    }
    return cleaned;
}

/**
 * Normalize date string to ISO format.
 */
function normalizeDate(dateStr) {
    if (!dateStr) return '';
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return dateStr.trim();
    return parsed.toISOString().split('T')[0];
}

/**
 * Sanitize free text — remove control characters, trim whitespace.
 */
function sanitizeText(text) {
    if (!text) return '';
    return text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .trim();
}

module.exports = { parseCSV, validateHeaders, normalizePhone, normalizeDate, sanitizeText };
