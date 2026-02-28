/**
 * Quick integration test: Upload CSV → check analytics → check metrics
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const CSV_PATH = path.join(__dirname, 'data', 'sample_leads.csv');

function request(method, urlPath, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const opts = { hostname: 'localhost', port: 3000, path: urlPath, method, headers };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function uploadCSV() {
    const fileData = fs.readFileSync(CSV_PATH);
    const boundary = '----TestBoundary' + Date.now();
    const parts = [];

    parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="sample_leads.csv"\r\n` +
        `Content-Type: text/csv\r\n\r\n`
    ));
    parts.push(fileData);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'localhost', port: 3000, path: '/api/upload', method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
            },
        };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('=== Lead Reactivation Agent — Integration Test ===\n');

    // Test 1: Upload CSV
    console.log('1. Uploading sample CSV...');
    const upload = await uploadCSV();
    console.log(`   Status: ${upload.status}`);
    if (upload.body.summary) {
        const s = upload.body.summary;
        console.log(`   TraceID: ${s.traceId}`);
        console.log(`   Valid Leads: ${s.validLeads}`);
        console.log(`   Inserted: ${s.insertedLeads}`);
        console.log(`   Analyzed: ${s.analyzedLeads}`);
        console.log(`   Errors: ${s.analysisErrors}`);
        console.log(`   Duration: ${s.duration}ms`);
    } else {
        console.log(`   Response: ${JSON.stringify(upload.body)}`);
    }

    // Test 2: Analytics
    console.log('\n2. Checking analytics...');
    const analytics = await request('GET', '/api/analytics');
    console.log(`   Total Leads: ${analytics.body.totalLeads}`);
    console.log(`   Messages Sent: ${analytics.body.messagesSent}`);
    console.log(`   Reply Rate: ${analytics.body.replyRate}%`);
    console.log(`   Intent Breakdown: ${JSON.stringify(analytics.body.intentBreakdown)}`);

    // Test 3: Leads list
    console.log('\n3. Checking leads list...');
    const leads = await request('GET', '/api/leads?page=1&limit=5');
    console.log(`   Total: ${leads.body.total}, Page: ${leads.body.page}/${leads.body.totalPages}`);
    if (leads.body.leads && leads.body.leads.length > 0) {
        const first = leads.body.leads[0];
        console.log(`   First lead: ${first.full_name} | Intent: ${first.intent_category} | State: ${first.state}`);
    }

    // Test 4: Metrics (observability)
    console.log('\n4. Checking observability metrics...');
    const metrics = await request('GET', '/api/metrics');
    console.log(`   Counters: ${JSON.stringify(metrics.body.counters)}`);
    const hists = metrics.body.histograms || {};
    for (const [name, h] of Object.entries(hists)) {
        console.log(`   Histogram ${name}: count=${h.count} avg=${h.avg}ms p95=${h.p95}ms`);
    }
    if (metrics.body.recentTraces && metrics.body.recentTraces.length > 0) {
        const t = metrics.body.recentTraces[0];
        console.log(`   Latest Trace: ${t.traceId} (${t.name}) ${t.status} ${t.durationMs}ms — ${t.spans.length} spans`);
    }

    // Test 5: Sources
    console.log('\n5. Checking sources...');
    const sources = await request('GET', '/api/sources');
    console.log(`   Sources: ${JSON.stringify(sources.body)}`);

    console.log('\n=== All tests completed ===');
}

main().catch(err => { console.error('Test failed:', err); process.exit(1); });
