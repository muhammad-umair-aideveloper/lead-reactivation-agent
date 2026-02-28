/**
 * Lead Reactivation Agent — Enterprise Dashboard Client JS v2.0
 */
(function () {
    'use strict';

    // ── State ──────────────────────────────────
    let currentPage = 1;
    let tracesPage = 1;
    const PAGE_SIZE = 20;
    let intentChart = null;
    let funnelChart = null;
    let sourceChart = null;
    let confidenceChart = null;
    let costProviderChart = null;
    let costPerLeadChart = null;
    let autoRefreshTimer = null;

    // ── DOM Refs ──────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        statusText: $('#statusText'),
        uploadZone: $('#uploadZone'),
        uploadBtn: $('#uploadBtn'),
        fileInput: $('#fileInput'),
        uploadProgress: $('#uploadProgress'),
        uploadStatusText: $('#uploadStatusText'),
        progressFill: $('#progressFill'),
        exportBtn: $('#exportBtn'),
        refreshBtn: $('#refreshBtn'),
        // Filters
        filterIntent: $('#filterIntent'),
        filterSource: $('#filterSource'),
        filterState: $('#filterState'),
        filterDateFrom: $('#filterDateFrom'),
        filterDateTo: $('#filterDateTo'),
        filterReset: $('#filterReset'),
        // KPIs
        kpiTotalLeads: $('#kpiTotalLeads'),
        kpiMessagesSent: $('#kpiMessagesSent'),
        kpiReplies: $('#kpiReplies'),
        kpiReplyRate: $('#kpiReplyRate'),
        kpiEscalated: $('#kpiEscalated'),
        kpiTotalCost: $('#kpiTotalCost'),
        kpiCostPerLead: $('#kpiCostPerLead'),
        kpiCostPerConversion: $('#kpiCostPerConversion'),
        kpiConversionRate: $('#kpiConversionRate'),
        kpiContactRate: $('#kpiContactRate'),
        // Tables
        leadsTableBody: $('#leadsTableBody'),
        tableCount: $('#tableCount'),
        pagination: $('#pagination'),
        escalationsTableBody: $('#escalationsTableBody'),
        evalTableBody: $('#evalTableBody'),
        tracesTableBody: $('#tracesTableBody'),
        tracesPagination: $('#tracesPagination'),
        // Modal
        modalOverlay: $('#modalOverlay'),
        leadModal: $('#leadModal'),
        modalTitle: $('#modalTitle'),
        modalBody: $('#modalBody'),
        modalClose: $('#modalClose'),
        toastContainer: $('#toastContainer'),
        // HITL
        hitlPending: $('#hitlPending'),
        hitlResolved: $('#hitlResolved'),
        hitlAvgConfidence: $('#hitlAvgConfidence'),
        hitlTotal: $('#hitlTotal'),
        // Cost
        costTotal: $('#costTotal'),
        costSms: $('#costSms'),
        costAi: $('#costAi'),
        costEvents: $('#costEvents'),
        // Eval
        evalIntentAccuracy: $('#evalIntentAccuracy'),
        evalAvgQuality: $('#evalAvgQuality'),
        evalAvgTone: $('#evalAvgTone'),
        evalInjectionRes: $('#evalInjectionRes'),
        runEvalBtn: $('#runEvalBtn'),
        evalRunInfo: $('#evalRunInfo'),
        // System
        sysUptime: $('#sysUptime'),
        sysQueueMode: $('#sysQueueMode'),
        providerHealthContent: $('#providerHealthContent'),
    };

    // ── Init ────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        bindEvents();
        loadDashboard();
        startAutoRefresh();
        dom.statusText.textContent = 'Connected';
    }

    function bindEvents() {
        // Upload
        dom.uploadBtn.addEventListener('click', () => dom.fileInput.click());
        dom.uploadZone.addEventListener('click', () => dom.fileInput.click());
        dom.fileInput.addEventListener('change', handleFileUpload);
        dom.uploadZone.addEventListener('dragover', handleDragOver);
        dom.uploadZone.addEventListener('dragleave', handleDragLeave);
        dom.uploadZone.addEventListener('drop', handleDrop);

        // Actions
        dom.exportBtn.addEventListener('click', exportCSV);
        dom.refreshBtn.addEventListener('click', loadDashboard);

        // Filters
        dom.filterIntent.addEventListener('change', () => { currentPage = 1; loadLeads(); });
        dom.filterSource.addEventListener('change', () => { currentPage = 1; loadLeads(); });
        dom.filterState.addEventListener('change', () => { currentPage = 1; loadLeads(); });
        dom.filterDateFrom.addEventListener('change', () => { currentPage = 1; loadLeads(); });
        dom.filterDateTo.addEventListener('change', () => { currentPage = 1; loadLeads(); });
        dom.filterReset.addEventListener('click', resetFilters);

        // Modal
        dom.modalClose.addEventListener('click', closeModal);
        dom.modalOverlay.addEventListener('click', (e) => {
            if (e.target === dom.modalOverlay) closeModal();
        });

        // Tabs
        $$('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Eval
        dom.runEvalBtn.addEventListener('click', runEvaluation);
    }

    // ── Tab System ──────────────────────────────
    function switchTab(tabName) {
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));

        $(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
        $(`#tab-${tabName}`).classList.add('active');

        // Load tab-specific data
        if (tabName === 'escalations') loadEscalations();
        if (tabName === 'costs') loadCostAnalytics();
        if (tabName === 'eval') loadEvalResults();
        if (tabName === 'traces') loadTraces();
        if (tabName === 'system') loadSystemHealth();
    }

    // ── Data Loading ────────────────────────────
    async function loadDashboard() {
        await Promise.all([loadAnalytics(), loadLeads(), loadSources()]);
    }

    async function loadAnalytics() {
        try {
            const res = await fetch('/api/analytics');
            const data = await res.json();

            animateValue(dom.kpiTotalLeads, data.totalLeads || 0);
            animateValue(dom.kpiMessagesSent, data.messagesSent || 0);
            animateValue(dom.kpiReplies, data.replies || 0);
            dom.kpiReplyRate.textContent = (data.replyRate || '0.0') + '%';
            animateValue(dom.kpiEscalated, data.escalated || 0);

            // Cost KPIs
            if (data.costKPIs) {
                dom.kpiTotalCost.textContent = '$' + (data.costKPIs.totalCostCents / 100).toFixed(2);
                dom.kpiCostPerLead.textContent = '$' + (data.costKPIs.costPerLeadCents / 100).toFixed(2);
                dom.kpiCostPerConversion.textContent = '$' + (data.costKPIs.costPerConversionCents / 100).toFixed(2);
                dom.kpiConversionRate.textContent = (data.costKPIs.conversionRate || 0) + '%';
                dom.kpiContactRate.textContent = (data.costKPIs.contactRate || 0) + '%';
            }

            renderIntentChart(data.intentBreakdown || []);
            renderFunnelChart(data);
            renderSourceChart(data.sourceBreakdown || []);
            renderConfidenceChart(data.confidenceDistribution || []);
        } catch (err) {
            console.error('Failed to load analytics:', err);
        }
    }

    async function loadLeads() {
        try {
            const params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE });
            const intent = dom.filterIntent.value;
            const source = dom.filterSource.value;
            const state = dom.filterState.value;
            const dateFrom = dom.filterDateFrom.value;
            const dateTo = dom.filterDateTo.value;

            if (intent) params.set('intent', intent);
            if (source) params.set('source', source);
            if (state) params.set('state', state);
            if (dateFrom) params.set('dateFrom', dateFrom);
            if (dateTo) params.set('dateTo', dateTo);

            const res = await fetch(`/api/leads?${params}`);
            const data = await res.json();

            renderLeadsTable(data.leads || []);
            renderPagination(data, dom.pagination, (p) => { currentPage = p; loadLeads(); });
            dom.tableCount.textContent = `${data.total || 0} leads`;
        } catch (err) {
            console.error('Failed to load leads:', err);
        }
    }

    async function loadSources() {
        try {
            const res = await fetch('/api/sources');
            const sources = await res.json();
            const select = dom.filterSource;
            const current = select.value;
            while (select.options.length > 1) select.remove(1);
            sources.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s; opt.textContent = s;
                select.appendChild(opt);
            });
            if (current) select.value = current;
        } catch (err) {
            console.error('Failed to load sources:', err);
        }
    }

    // ── HITL Escalations ────────────────────────
    async function loadEscalations() {
        try {
            const [escalationsRes, statsRes] = await Promise.all([
                fetch('/api/escalations?limit=50'),
                fetch('/api/escalations/stats'),
            ]);
            const escalationsData = await escalationsRes.json();
            const stats = await statsRes.json();

            dom.hitlPending.textContent = stats.pending || 0;
            dom.hitlResolved.textContent = stats.resolved || 0;
            dom.hitlAvgConfidence.textContent = stats.avg_confidence ? stats.avg_confidence.toFixed(2) : '—';
            dom.hitlTotal.textContent = stats.total || 0;

            const escalations = escalationsData.escalations || escalationsData;
            renderEscalationsTable(escalations);
        } catch (err) {
            console.error('Failed to load escalations:', err);
        }
    }

    function renderEscalationsTable(escalations) {
        if (!escalations || escalations.length === 0) {
            dom.escalationsTableBody.innerHTML = '<tr><td colspan="7" class="empty-row">No escalations found.</td></tr>';
            return;
        }

        dom.escalationsTableBody.innerHTML = escalations.map(e => `
      <tr>
        <td><code style="color:var(--accent-primary)">#${e.id}</code></td>
        <td><strong>${escapeHtml(e.full_name || '')}</strong><br><small style="color:var(--text-muted)">${escapeHtml(e.lead_id)}</small></td>
        <td style="max-width:200px">${escapeHtml(e.reason || '')}</td>
        <td>${confidenceBadge(e.confidence_score)}</td>
        <td><span class="badge badge-${e.status === 'pending' ? 'escalated' : e.status === 'resolved' ? 'replied' : 'idle'}">${e.status}</span></td>
        <td style="color:var(--text-muted);font-size:12px">${e.created_at || '—'}</td>
        <td>
          ${e.status === 'pending' ? `
            <button class="btn btn-sm btn-resolve" onclick="resolveEscalation(${e.id}, 'resolved')">✓ Resolve</button>
            <button class="btn btn-sm btn-dismiss" onclick="resolveEscalation(${e.id}, 'dismissed')">✕ Dismiss</button>
          ` : `<span style="color:var(--text-muted);font-size:12px">${e.resolved_at ? '✓ ' + e.resolved_at : ''}</span>`}
        </td>
      </tr>
    `).join('');
    }

    // Make globally accessible for inline onclick
    window.resolveEscalation = async function (id, status) {
        try {
            const res = await fetch(`/api/escalations/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, resolutionNotes: `Dashboard ${status}` }),
            });
            if (res.ok) {
                showToast(`Escalation #${id} ${status}.`, 'success');
                loadEscalations();
            } else {
                showToast('Failed to update escalation.', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    // ── Cost Analytics ──────────────────────────
    async function loadCostAnalytics() {
        try {
            const res = await fetch('/api/analytics/costs');
            const data = await res.json();

            dom.costTotal.textContent = '$' + ((data.totals?.total_cents || 0) / 100).toFixed(2);
            dom.costSms.textContent = '$' + ((data.totals?.sms_cents || 0) / 100).toFixed(2);
            dom.costAi.textContent = '$' + ((data.totals?.ai_cents || 0) / 100).toFixed(2);
            dom.costEvents.textContent = data.totals?.total_events || 0;

            renderCostProviderChart(data.byProvider || []);
            renderCostPerLeadChart((data.perLead || []).slice(0, 10));
        } catch (err) {
            console.error('Failed to load costs:', err);
        }
    }

    function renderCostProviderChart(breakdown) {
        const ctx = document.getElementById('costProviderChart');
        if (!ctx) return;
        const labels = breakdown.map(b => `${b.provider} - ${b.event_type}`);
        const values = breakdown.map(b => b.total_cents / 100);
        const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

        if (costProviderChart) costProviderChart.destroy();
        costProviderChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data: values, backgroundColor: colors.map(c => c + '88'), borderColor: colors, borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 10, font: { size: 11 } } } } }
        });
    }

    function renderCostPerLeadChart(leads) {
        const ctx = document.getElementById('costPerLeadChart');
        if (!ctx) return;
        const labels = leads.map(l => l.full_name || l.lead_id);
        const values = leads.map(l => l.total_cost_cents / 100);

        if (costPerLeadChart) costPerLeadChart.destroy();
        costPerLeadChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data: values, backgroundColor: '#6366f133', borderColor: '#6366f1', borderWidth: 2, borderRadius: 6 }] },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { ticks: { color: '#64748b', callback: v => '$' + v.toFixed(2) }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } } }
            }
        });
    }

    // ── Eval Suite ───────────────────────────────
    async function loadEvalResults() {
        try {
            const res = await fetch('/api/eval/latest');
            if (res.status === 404) {
                dom.evalRunInfo.textContent = 'No evaluation runs yet.';
                return;
            }
            const data = await res.json();

            dom.evalRunInfo.textContent = `Run: ${data.run_id?.substring(0, 8)}... | ${data.total_scenarios} scenarios`;

            const intentMatches = data.results?.filter(r => r.expected_intent === r.actual_intent).length || data.intent_matches || 0;
            const total = data.results?.length || data.total_scenarios || 1;
            dom.evalIntentAccuracy.textContent = ((intentMatches / total) * 100).toFixed(0) + '%';
            dom.evalAvgQuality.textContent = (data.avg_quality_score || 0).toFixed(1);
            dom.evalAvgTone.textContent = (data.avg_tone_score || 0).toFixed(1);

            const injPasses = data.results?.filter(r => r.injection_resistant).length || data.injection_passes || 0;
            dom.evalInjectionRes.textContent = ((injPasses / total) * 100).toFixed(0) + '%';

            renderEvalTable(data.results || []);
        } catch (err) {
            console.error('Failed to load eval results:', err);
        }
    }

    function renderEvalTable(results) {
        if (!results || results.length === 0) {
            dom.evalTableBody.innerHTML = '<tr><td colspan="9" class="empty-row">No evaluation results.</td></tr>';
            return;
        }

        dom.evalTableBody.innerHTML = results.map(r => {
            const match = r.expected_intent === r.actual_intent;
            return `
        <tr>
          <td>${r.dataset_index}</td>
          <td style="max-width:180px">${escapeHtml(r.scenario_name)}</td>
          <td><span class="badge badge-${r.expected_intent}">${r.expected_intent}</span></td>
          <td><span class="badge badge-${r.actual_intent}">${r.actual_intent}</span></td>
          <td>${match ? '✅' : '❌'}</td>
          <td>${confidenceBadge(r.confidence_score)}</td>
          <td>${r.tone_score}/10</td>
          <td>${r.quality_score}/10</td>
          <td>${r.injection_resistant ? '✅' : '❌'}</td>
        </tr>`;
        }).join('');
    }

    async function runEvaluation() {
        dom.runEvalBtn.disabled = true;
        dom.runEvalBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
        showToast('Evaluation started... This may take a few minutes.', 'info');

        try {
            const res = await fetch('/api/eval/run', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast(`Eval complete: ${data.intentAccuracy} accuracy, ${data.avgQualityScore}/10 quality`, 'success');
                loadEvalResults();
            } else {
                showToast('Eval failed: ' + (data.error || 'Unknown'), 'error');
            }
        } catch (err) {
            showToast('Eval error: ' + err.message, 'error');
        } finally {
            dom.runEvalBtn.disabled = false;
            dom.runEvalBtn.innerHTML = '<i class="fas fa-play"></i> Run Evaluation';
        }
    }

    // ── AI Traces ───────────────────────────────
    async function loadTraces() {
        try {
            const res = await fetch(`/api/traces?page=${tracesPage}&limit=${PAGE_SIZE}`);
            const data = await res.json();

            renderTracesTable(data.traces || []);
            renderPagination(data, dom.tracesPagination, (p) => { tracesPage = p; loadTraces(); });
        } catch (err) {
            console.error('Failed to load traces:', err);
        }
    }

    function renderTracesTable(traces) {
        if (!traces || traces.length === 0) {
            dom.tracesTableBody.innerHTML = '<tr><td colspan="7" class="empty-row">No reasoning traces found.</td></tr>';
            return;
        }

        dom.tracesTableBody.innerHTML = traces.map(t => `
      <tr>
        <td><code style="color:var(--accent-primary);font-size:11px">${escapeHtml(t.trace_id)}</code></td>
        <td><code style="font-size:11px">${escapeHtml(t.lead_id)}</code></td>
        <td><span class="badge badge-${t.provider === 'gemini' ? 'contacted' : t.provider === 'claude' ? 'escalated' : 'idle'}">${t.provider}</span></td>
        <td>${confidenceBadge(t.confidence_score)}</td>
        <td><span class="badge badge-${t.decision === 'send' ? 'replied' : t.decision === 'escalate' ? 'escalated' : 'idle'}">${t.decision}</span></td>
        <td style="color:var(--text-muted)">${t.duration_ms}ms</td>
        <td style="color:var(--text-muted);font-size:12px">${t.created_at || '—'}</td>
      </tr>
    `).join('');
    }

    // ── System Health ───────────────────────────
    async function loadSystemHealth() {
        try {
            const [healthRes, queueRes, providerRes] = await Promise.all([
                fetch('/health'),
                fetch('/api/queues/stats'),
                fetch('/api/providers/health'),
            ]);

            const health = await healthRes.json();
            const queues = await queueRes.json();
            const providers = await providerRes.json();

            dom.sysUptime.textContent = formatUptime(health.uptime);
            dom.sysQueueMode.textContent = queues.mode || 'unknown';

            let providerHtml = '';
            for (const [name, info] of Object.entries(providers)) {
                const dotClass = info.circuitState === 'closed' ? 'healthy' : info.circuitState === 'open' ? 'open' : 'halfopen';
                providerHtml += `
          <div class="provider-card">
            <div class="provider-dot ${dotClass}"></div>
            <div>
              <strong style="text-transform:capitalize">${name}</strong>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                Circuit: ${info.circuitState} | Failures: ${info.failures} | Available: ${info.available ? '✅' : '❌'}
              </div>
            </div>
          </div>`;
            }
            dom.providerHealthContent.innerHTML = providerHtml || '<p>No providers configured.</p>';
        } catch (err) {
            console.error('Failed to load system health:', err);
        }
    }

    // ── File Upload ────────────────────────────
    function handleDragOver(e) { e.preventDefault(); dom.uploadZone.classList.add('drag-over'); }
    function handleDragLeave(e) { e.preventDefault(); dom.uploadZone.classList.remove('drag-over'); }

    function handleDrop(e) {
        e.preventDefault();
        dom.uploadZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.csv')) {
            uploadFile(files[0]);
        } else {
            showToast('Please drop a CSV file.', 'error');
        }
    }

    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (file) uploadFile(file);
    }

    async function uploadFile(file) {
        dom.uploadZone.style.display = 'none';
        dom.uploadProgress.style.display = 'block';
        dom.uploadStatusText.textContent = 'Uploading and processing leads...';
        dom.progressFill.style.width = '30%';

        const formData = new FormData();
        formData.append('file', file);

        try {
            dom.progressFill.style.width = '60%';
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            dom.progressFill.style.width = '100%';

            if (data.success) {
                const s = data.summary;
                showToast(`✅ Processed ${s.validLeads} leads (${s.analyzedLeads} analyzed, ${s.insertedLeads} new). Duration: ${s.duration}ms`, 'success');
            } else {
                showToast('Upload failed: ' + (data.error || 'Unknown error'), 'error');
            }

            setTimeout(() => {
                dom.uploadZone.style.display = '';
                dom.uploadProgress.style.display = 'none';
                dom.progressFill.style.width = '0%';
                dom.fileInput.value = '';
                loadDashboard();
            }, 1500);
        } catch (err) {
            showToast('Upload failed: ' + err.message, 'error');
            dom.uploadZone.style.display = '';
            dom.uploadProgress.style.display = 'none';
            dom.progressFill.style.width = '0%';
        }
    }

    // ── Charts ─────────────────────────────────
    const chartColors = { high: '#f87171', medium: '#fbbf24', low: '#60a5fa', not_interested: '#94a3b8' };

    function renderIntentChart(breakdown) {
        const ctx = document.getElementById('intentChart').getContext('2d');
        if (intentChart) intentChart.destroy();
        intentChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: breakdown.map(b => ({ high: 'High Intent', medium: 'Medium', low: 'Low', not_interested: 'Not Interested' }[b.intent_category] || b.intent_category)),
                datasets: [{ data: breakdown.map(b => b.count), backgroundColor: breakdown.map(b => chartColors[b.intent_category] || '#64748b'), borderWidth: 0, hoverOffset: 8 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12, usePointStyle: true, font: { size: 12 } } } } }
        });
    }

    function renderFunnelChart(data) {
        const ctx = document.getElementById('funnelChart').getContext('2d');
        const stateMap = {};
        (data.stateBreakdown || []).forEach(s => { stateMap[s.state] = s.count; });

        const labels = ['Idle', 'Contacted', 'Replied', 'Escalated'];
        const values = [stateMap.idle || 0, stateMap.contacted || 0, stateMap.replied || 0, stateMap.escalated || 0];
        const colors = ['#64748b', '#6366f1', '#10b981', '#f59e0b'];

        if (funnelChart) funnelChart.destroy();
        funnelChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data: values, backgroundColor: colors.map(c => c + '33'), borderColor: colors, borderWidth: 2, borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#94a3b8', font: { size: 12 } }, grid: { display: false } } } }
        });
    }

    function renderSourceChart(breakdown) {
        const ctx = document.getElementById('sourceChart').getContext('2d');
        const palette = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f87171', '#ec4899', '#14b8a6'];
        if (sourceChart) sourceChart.destroy();
        sourceChart = new Chart(ctx, {
            type: 'polarArea',
            data: { labels: breakdown.map(b => b.lead_source), datasets: [{ data: breakdown.map(b => b.count), backgroundColor: palette.map(c => c + '44'), borderColor: palette, borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 10, usePointStyle: true, font: { size: 11 } } } }, scales: { r: { ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
        });
    }

    function renderConfidenceChart(distribution) {
        const ctx = document.getElementById('confidenceChart');
        if (!ctx) return;
        const labels = distribution.map(d => d.bucket.replace('_', ' ').toUpperCase());
        const values = distribution.map(d => d.count);
        const colors = ['#10b981', '#34d399', '#fbbf24', '#f59e0b', '#ef4444'];

        if (confidenceChart) confidenceChart.destroy();
        confidenceChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data: values, backgroundColor: colors.map(c => c + '55'), borderColor: colors, borderWidth: 2, borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { display: false } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } } } }
        });
    }

    // ── Table Rendering ─────────────────────────
    function renderLeadsTable(leads) {
        if (leads.length === 0) {
            dom.leadsTableBody.innerHTML = '<tr><td colspan="10" class="empty-row">No leads found. Upload a CSV to get started.</td></tr>';
            return;
        }

        dom.leadsTableBody.innerHTML = leads.map(lead => `
      <tr class="clickable" data-lead-id="${escapeHtml(lead.lead_id)}">
        <td><code style="color:var(--accent-primary)">${escapeHtml(lead.lead_id)}</code></td>
        <td><strong>${escapeHtml(lead.full_name)}</strong></td>
        <td style="color:var(--text-muted)">${escapeHtml(lead.phone_number)}</td>
        <td>${escapeHtml(lead.lead_source)}</td>
        <td style="color:var(--text-muted)">${lead.last_interaction_date || '—'}</td>
        <td>${lead.intent_category ? `<span class="badge badge-${lead.intent_category}">${lead.intent_category}</span>` : '—'}</td>
        <td>${confidenceBadge(lead.confidence_score)}</td>
        <td><span class="badge badge-${lead.state}">${formatState(lead.state)}</span></td>
        <td>${lead.llm_provider ? `<span style="font-size:11px;color:var(--text-muted)">${lead.llm_provider}</span>` : '—'}</td>
        <td class="sms-preview">${escapeHtml(lead.sms_body || '—')}</td>
      </tr>
    `).join('');

        dom.leadsTableBody.querySelectorAll('tr.clickable').forEach(row => {
            row.addEventListener('click', () => openLeadDetail(row.dataset.leadId));
        });
    }

    function renderPagination(data, container, onPageChange) {
        const { page, totalPages } = data;
        if (totalPages <= 1) { container.innerHTML = ''; return; }

        let html = `<button ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">‹ Prev</button>`;
        for (let i = 1; i <= totalPages; i++) {
            if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - page) > 1) {
                if (i === 3 || i === totalPages - 2) html += '<button disabled>…</button>';
                continue;
            }
            html += `<button class="${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        html += `<button ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">Next ›</button>`;

        container.innerHTML = html;
        container.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', () => onPageChange(parseInt(btn.dataset.page, 10)));
        });
    }

    // ── Lead Detail Modal ──────────────────────
    async function openLeadDetail(leadId) {
        try {
            const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}`);
            const data = await res.json();
            const lead = data.lead;
            const messages = data.messages || [];
            const auditLog = data.auditLog || [];

            dom.modalTitle.textContent = `${lead.full_name} — ${lead.lead_id}`;

            let html = `
        <div class="detail-grid">
          <div class="detail-item"><label>Phone</label><p>${escapeHtml(lead.phone_number)}</p></div>
          <div class="detail-item"><label>Email</label><p>${lead.email || '—'}</p></div>
          <div class="detail-item"><label>Source</label><p>${escapeHtml(lead.lead_source)}</p></div>
          <div class="detail-item"><label>Last Interaction</label><p>${lead.last_interaction_date}</p></div>
          <div class="detail-item"><label>Intent</label><p>${lead.intent_category ? `<span class="badge badge-${lead.intent_category}">${lead.intent_category}</span>` : '—'}</p></div>
          <div class="detail-item"><label>Confidence</label><p>${confidenceBadge(lead.confidence_score)}</p></div>
          <div class="detail-item"><label>State</label><p><span class="badge badge-${lead.state}">${formatState(lead.state)}</span></p></div>
          <div class="detail-item"><label>Provider</label><p>${lead.llm_provider || '—'}</p></div>
        </div>`;

            if (lead.notes) html += `<div class="detail-item"><label>Historical Notes</label><p style="margin-top:4px;color:var(--text-secondary)">${escapeHtml(lead.notes)}</p></div>`;
            if (lead.intent_rationale) html += `<div class="detail-item" style="margin-top:16px"><label>AI Rationale</label><p style="margin-top:4px;color:var(--text-secondary)">${escapeHtml(lead.intent_rationale)}</p></div>`;
            if (lead.recommended_angle) html += `<div class="detail-item" style="margin-top:12px"><label>Recommended Angle</label><p style="margin-top:4px;color:var(--cyan)">${escapeHtml(lead.recommended_angle)}</p></div>`;
            if (lead.sms_body) html += `<div style="margin-top:16px"><label style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:6px">Generated SMS (${(lead.sms_body || '').length} chars)</label><div class="sms-box">${escapeHtml(lead.sms_body)}</div></div>`;

            if (messages.length > 0) {
                html += '<div class="messages-list"><label style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:10px">Message History</label>';
                messages.forEach(m => {
                    html += `<div class="message-item ${m.direction}"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><strong style="font-size:11px;text-transform:uppercase">${m.direction === 'outbound' ? '📤 Sent' : '📥 Received'}</strong><span style="font-size:11px;color:var(--text-muted)">${m.sent_at}</span></div><p>${escapeHtml(m.body || '')}</p></div>`;
                });
                html += '</div>';
            }

            if (auditLog.length > 0) {
                html += '<div style="margin-top:20px"><label style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:10px">State Audit Log</label>';
                auditLog.forEach(a => {
                    html += `<div style="padding:8px 12px;border-left:3px solid var(--accent-primary);margin-bottom:6px;background:var(--bg-glass);border-radius:0 6px 6px 0;font-size:12px"><strong>${a.from_state} → ${a.to_state}</strong> <span style="color:var(--text-muted);margin-left:8px">${a.trigger_event}</span> <span style="float:right;color:var(--text-muted)">${a.created_at}</span></div>`;
                });
                html += '</div>';
            }

            dom.modalBody.innerHTML = html;
            dom.modalOverlay.classList.add('active');
        } catch (err) {
            showToast('Failed to load lead detail.', 'error');
        }
    }

    function closeModal() { dom.modalOverlay.classList.remove('active'); }

    // ── Filters ────────────────────────────────
    function resetFilters() {
        dom.filterIntent.value = '';
        dom.filterSource.value = '';
        dom.filterState.value = '';
        dom.filterDateFrom.value = '';
        dom.filterDateTo.value = '';
        currentPage = 1;
        loadLeads();
    }

    // ── Export ─────────────────────────────────
    async function exportCSV() {
        try {
            const res = await fetch('/api/export');
            if (!res.ok) throw new Error('No data to export');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `leads_export_${Date.now()}.csv`; a.click();
            window.URL.revokeObjectURL(url);
            showToast('CSV exported successfully.', 'success');
        } catch (err) {
            showToast('Export failed: ' + err.message, 'error');
        }
    }

    // ── Auto Refresh ──────────────────────────
    function startAutoRefresh() {
        autoRefreshTimer = setInterval(loadDashboard, 30000);
    }

    // ── Utilities ──────────────────────────────
    function animateValue(el, target) {
        const start = parseInt(el.textContent, 10) || 0;
        if (start === target) return;
        const diff = target - start;
        const duration = 600;
        const startTime = performance.now();
        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(start + diff * eased);
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    function formatState(state) {
        const map = { idle: 'Idle', contacted: 'Contacted', replied: 'Replied', escalated: 'Escalated' };
        return map[state] || state;
    }

    function confidenceBadge(score) {
        if (score == null) return '—';
        const val = parseFloat(score);
        const cls = val >= 0.8 ? 'confidence-high' : val >= 0.6 ? 'confidence-mid' : 'confidence-low';
        return `<strong class="${cls}">${val.toFixed(2)}</strong>`;
    }

    function formatUptime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
        dom.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4200);
    }

})();
