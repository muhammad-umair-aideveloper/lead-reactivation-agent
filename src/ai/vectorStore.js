/**
 * Vector Store — In-memory RAG vector store with cosine similarity
 *
 * Stores business context embeddings and retrieves relevant context
 * for injection into LLM prompts. Uses simple TF-IDF-like word vectors
 * (no external embedding API required).
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');

class VectorStore {
    constructor() {
        this.documents = [];    // { id, text, category, vector }
        this.vocabulary = new Map();
        this.idf = new Map();
        this.initialized = false;
    }

    /**
     * Load business context from JSON file.
     */
    initialize() {
        if (this.initialized) return;

        const contextPath = path.resolve(config.rag.contextFile);

        if (!fs.existsSync(contextPath)) {
            logger.warn(`[RAG] Business context file not found: ${contextPath}`);
            this.initialized = true;
            return;
        }

        try {
            const data = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
            const entries = data.entries || data;

            if (!Array.isArray(entries)) {
                logger.warn('[RAG] Business context file has no entries array');
                this.initialized = true;
                return;
            }

            // Build vocabulary from all documents
            const allTokens = entries.map(e => this._tokenize(e.text || e.content || ''));

            // Compute IDF
            const docCount = allTokens.length;
            const termDocFreq = new Map();
            for (const tokens of allTokens) {
                const uniqueTokens = new Set(tokens);
                for (const token of uniqueTokens) {
                    termDocFreq.set(token, (termDocFreq.get(token) || 0) + 1);
                }
            }
            for (const [term, df] of termDocFreq) {
                this.idf.set(term, Math.log((docCount + 1) / (df + 1)) + 1);
            }

            // Vectorize each document
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const text = entry.text || entry.content || '';
                const vector = this._vectorize(allTokens[i]);

                this.documents.push({
                    id: entry.id || `ctx_${i}`,
                    text,
                    category: entry.category || 'general',
                    vector,
                });
            }

            logger.info(`[RAG] Loaded ${this.documents.length} business context entries`);
            this.initialized = true;
        } catch (err) {
            logger.error('[RAG] Failed to load business context:', err);
            this.initialized = true;
        }
    }

    /**
     * Search for the most relevant context given a query.
     * @param {string} query
     * @param {number} topK — Number of results to return
     * @returns {Array<{ text, score, category }>}
     */
    search(query, topK = config.rag.topK) {
        if (!this.initialized) this.initialize();
        if (this.documents.length === 0) return [];

        const queryTokens = this._tokenize(query);
        const queryVector = this._vectorize(queryTokens);

        const scored = this.documents.map(doc => ({
            text: doc.text,
            category: doc.category,
            score: this._cosineSimilarity(queryVector, doc.vector),
        }));

        return scored
            .filter(s => s.score >= config.rag.similarityThreshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    /**
     * Tokenize text into normalized words.
     */
    _tokenize(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2);
    }

    /**
     * Convert tokens to TF-IDF vector.
     */
    _vectorize(tokens) {
        const tf = new Map();
        for (const token of tokens) {
            tf.set(token, (tf.get(token) || 0) + 1);
        }

        const vector = new Map();
        for (const [term, count] of tf) {
            const tfidf = (count / tokens.length) * (this.idf.get(term) || 1);
            vector.set(term, tfidf);
        }
        return vector;
    }

    /**
     * Cosine similarity between two sparse vectors.
     */
    _cosineSimilarity(vecA, vecB) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (const [term, valA] of vecA) {
            normA += valA * valA;
            if (vecB.has(term)) {
                dotProduct += valA * vecB.get(term);
            }
        }
        for (const [, valB] of vecB) {
            normB += valB * valB;
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        return denominator === 0 ? 0 : dotProduct / denominator;
    }
}

// Singleton
let instance = null;
function getVectorStore() {
    if (!instance) {
        instance = new VectorStore();
        instance.initialize();
    }
    return instance;
}

module.exports = { VectorStore, getVectorStore };
