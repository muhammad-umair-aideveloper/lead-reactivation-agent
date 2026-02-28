/**
 * Queue Manager — BullMQ/Redis async pipeline with in-memory fallback
 *
 * Queues: webhook-inbound, sms-outbound, ai-analysis
 * Gracefully falls back to in-memory processing if Redis is unavailable.
 */
const config = require('../../config');
const logger = require('../utils/logger');

let Queue, Worker, QueueEvents;
let redis = null;
let redisAvailable = false;
const queues = new Map();
const workers = new Map();

// ── In-memory fallback queue ────────────────
class InMemoryQueue {
    constructor(name) {
        this.name = name;
        this.jobs = [];
        this.processor = null;
        this.jobIdCounter = 0;
    }

    async add(jobName, data, opts = {}) {
        const jobId = `mem_${++this.jobIdCounter}_${Date.now()}`;
        const job = { id: jobId, name: jobName, data, opts, timestamp: Date.now() };
        this.jobs.push(job);
        logger.debug(`[QUEUE:${this.name}] Job added (in-memory): ${jobName} #${jobId}`);

        // Process immediately in-memory
        if (this.processor) {
            setImmediate(async () => {
                try {
                    await this.processor(job);
                } catch (err) {
                    logger.error(`[QUEUE:${this.name}] In-memory job #${jobId} failed: ${err.message}`);
                }
            });
        }
        return job;
    }

    async getJobCounts() {
        return {
            waiting: this.jobs.filter(j => !j.completed && !j.failed).length,
            completed: this.jobs.filter(j => j.completed).length,
            failed: this.jobs.filter(j => j.failed).length,
        };
    }

    async close() { /* noop */ }
}

class InMemoryWorker {
    constructor(name, processor) {
        this.name = name;
        this.processor = processor;
        // Wire up to the in-memory queue
        const q = queues.get(name);
        if (q && q instanceof InMemoryQueue) {
            q.processor = processor;
        }
    }

    on(event, handler) { /* noop for in-memory */ }
    async close() { /* noop */ }
}

/**
 * Initialize the queue system.
 * Tries Redis first, falls back to in-memory.
 */
async function initializeQueues() {
    try {
        const BullMQ = require('bullmq');
        const IORedis = require('ioredis');

        Queue = BullMQ.Queue;
        Worker = BullMQ.Worker;
        QueueEvents = BullMQ.QueueEvents;

        // Test Redis connection
        const testConn = new IORedis({
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password || undefined,
            maxRetriesPerRequest: null,
            lazyConnect: true,
            connectTimeout: 3000,
        });

        await testConn.connect();
        await testConn.ping();
        await testConn.quit();

        redis = {
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password || undefined,
            maxRetriesPerRequest: null,
        };
        redisAvailable = true;

        logger.info(`[QUEUE] Redis connected at ${config.redis.host}:${config.redis.port}`);
    } catch (err) {
        logger.warn(`[QUEUE] Redis unavailable (${err.message}) — using in-memory fallback`);
        redisAvailable = false;
    }

    // Create queues
    const queueNames = ['webhook-inbound', 'sms-outbound', 'ai-analysis'];

    for (const name of queueNames) {
        if (redisAvailable) {
            queues.set(name, new Queue(name, { connection: redis }));
        } else {
            queues.set(name, new InMemoryQueue(name));
        }
    }

    logger.info(`[QUEUE] ${queueNames.length} queues initialized (${redisAvailable ? 'Redis' : 'in-memory'})`);
}

/**
 * Get a queue by name.
 */
function getQueue(name) {
    return queues.get(name);
}

/**
 * Create a worker for a queue.
 */
function createWorker(queueName, processor, opts = {}) {
    let worker;

    if (redisAvailable) {
        worker = new Worker(queueName, processor, {
            connection: redis,
            concurrency: opts.concurrency || 1,
            ...opts,
        });

        worker.on('completed', (job) => {
            logger.debug(`[WORKER:${queueName}] Job #${job.id} completed`);
        });

        worker.on('failed', (job, err) => {
            logger.error(`[WORKER:${queueName}] Job #${job.id} failed: ${err.message}`);
        });
    } else {
        worker = new InMemoryWorker(queueName, processor);
    }

    workers.set(queueName, worker);
    return worker;
}

/**
 * Check if Redis-backed queues are active.
 */
function isRedisAvailable() {
    return redisAvailable;
}

/**
 * Get queue stats for all queues.
 */
async function getQueueStats() {
    const stats = {};
    for (const [name, queue] of queues) {
        try {
            stats[name] = await queue.getJobCounts();
        } catch (err) {
            stats[name] = { error: err.message };
        }
    }
    return { mode: redisAvailable ? 'redis' : 'in-memory', queues: stats };
}

/**
 * Gracefully shut down all queues and workers.
 */
async function shutdownQueues() {
    for (const [name, worker] of workers) {
        try { await worker.close(); } catch (err) { /* ignore */ }
    }
    for (const [name, queue] of queues) {
        try { await queue.close(); } catch (err) { /* ignore */ }
    }
    logger.info('[QUEUE] All queues and workers shut down');
}

module.exports = {
    initializeQueues,
    getQueue,
    createWorker,
    isRedisAvailable,
    getQueueStats,
    shutdownQueues,
};
