/**
 * EvalRepository — Evaluation results persistence
 */
const { getDb } = require('./LeadRepository');

function insertEvalResult(result) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT INTO eval_results (run_id, dataset_index, scenario_name, expected_intent, actual_intent,
      confidence_score, tone_score, injection_resistant, quality_score, judge_reasoning, sms_generated)
    VALUES (@run_id, @dataset_index, @scenario_name, @expected_intent, @actual_intent,
      @confidence_score, @tone_score, @injection_resistant, @quality_score, @judge_reasoning, @sms_generated)
  `);
    return stmt.run(result);
}

function insertEvalResultsBatch(results) {
    const conn = getDb();
    const stmt = conn.prepare(`
    INSERT INTO eval_results (run_id, dataset_index, scenario_name, expected_intent, actual_intent,
      confidence_score, tone_score, injection_resistant, quality_score, judge_reasoning, sms_generated)
    VALUES (@run_id, @dataset_index, @scenario_name, @expected_intent, @actual_intent,
      @confidence_score, @tone_score, @injection_resistant, @quality_score, @judge_reasoning, @sms_generated)
  `);
    const tx = conn.transaction((items) => {
        for (const item of items) stmt.run(item);
    });
    tx(results);
}

function getEvalRunResults(runId) {
    return getDb().prepare(`
    SELECT * FROM eval_results WHERE run_id = ? ORDER BY dataset_index
  `).all(runId);
}

function getEvalRuns() {
    return getDb().prepare(`
    SELECT
      run_id,
      COUNT(*) as total_scenarios,
      SUM(CASE WHEN expected_intent = actual_intent THEN 1 ELSE 0 END) as intent_matches,
      AVG(tone_score) as avg_tone_score,
      AVG(quality_score) as avg_quality_score,
      SUM(CASE WHEN injection_resistant = 1 THEN 1 ELSE 0 END) as injection_passes,
      AVG(confidence_score) as avg_confidence,
      MIN(created_at) as created_at
    FROM eval_results
    GROUP BY run_id
    ORDER BY created_at DESC
  `).all();
}

function getLatestEvalRun() {
    const runs = getEvalRuns();
    if (runs.length === 0) return null;
    const latest = runs[0];
    latest.results = getEvalRunResults(latest.run_id);
    return latest;
}

module.exports = {
    insertEvalResult,
    insertEvalResultsBatch,
    getEvalRunResults,
    getEvalRuns,
    getLatestEvalRun,
};
