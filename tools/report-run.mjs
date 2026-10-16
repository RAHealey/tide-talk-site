/**
 * Turns workflow runs into GitHub issues so failures are noticed.
 *
 *   node tools/report-run.mjs failure   # open (or refresh) "Workflow failing: <name>"
 *   node tools/report-run.mjs success   # close that issue if one is open
 *
 * Opening an issue notifies the repo owner; while it stays open, later failures
 * only update the issue body (no notification spam from 5-minute jobs).
 * ALERT_AFTER=N waits for N consecutive failed runs before opening, so a single
 * ESPN or YouTube blip on a high-frequency job stays quiet.
 *
 * Env (set by Actions): GH_TOKEN, GITHUB_REPOSITORY, GITHUB_WORKFLOW,
 * GITHUB_RUN_ID, GITHUB_SERVER_URL. Never exits non-zero: the job's own
 * result already says whether the run failed.
 */

const mode = process.argv[2];
const { GH_TOKEN, GITHUB_REPOSITORY: repo, GITHUB_WORKFLOW: workflow, GITHUB_RUN_ID: runId } = process.env;
const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
const alertAfter = Math.max(1, Number(process.env.ALERT_AFTER || 1));
const LABEL = 'ci-failure';
const title = `Workflow failing: ${workflow}`;
const runUrl = `${server}/${repo}/actions/runs/${runId}`;

const api = async (path, opts = {}) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    });
    if (!r.ok && r.status !== 422) throw new Error(`${opts.method || 'GET'} ${path} -> HTTP ${r.status}: ${await r.text()}`);
    return r.status === 204 ? null : r.json();
};

/** True when this run plus the previous (n-1) completed runs all failed. */
export function shouldAlert(n, previousConclusions) {
    if (n <= 1) return true;
    const prev = previousConclusions.slice(0, n - 1);
    return prev.length === n - 1 && prev.every((c) => c === 'failure');
}

async function openIssue() {
    const open = await api(`/issues?labels=${LABEL}&state=open&per_page=100`);
    return open.find((i) => i.title === title);
}

async function onFailure() {
    if (alertAfter > 1) {
        const run = await api(`/actions/runs/${runId}`);
        const prev = await api(`/actions/workflows/${run.workflow_id}/runs?status=completed&per_page=${alertAfter - 1}`);
        const conclusions = prev.workflow_runs.filter((r) => String(r.id) !== String(runId)).map((r) => r.conclusion);
        if (!shouldAlert(alertAfter, conclusions)) { console.log(`failure, but not ${alertAfter} in a row yet — no alert`); return; }
    }
    const body = `**${workflow}** is failing.\n\nLatest failed run: ${runUrl} (${new Date().toISOString()})\n\n` +
        `This issue closes itself on the next successful run.` + (alertAfter > 1 ? ` Opened after ${alertAfter} failed runs in a row.` : '');
    const existing = await openIssue();
    if (existing) {
        await api(`/issues/${existing.number}`, { method: 'PATCH', body: JSON.stringify({ body }) });
        console.log(`updated issue #${existing.number}`);
        return;
    }
    await api('/labels', { method: 'POST', body: JSON.stringify({ name: LABEL, color: 'd73a4a', description: 'Opened automatically by a failing workflow' }) });
    const issue = await api('/issues', { method: 'POST', body: JSON.stringify({ title, body, labels: [LABEL] }) });
    console.log(`opened issue #${issue.number}`);
}

async function onSuccess() {
    const existing = await openIssue();
    if (!existing) return;
    await api(`/issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Recovered: ${runUrl}` }) });
    await api(`/issues/${existing.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
    console.log(`closed issue #${existing.number}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        if (mode === 'failure') await onFailure();
        else if (mode === 'success') await onSuccess();
        else console.error('usage: report-run.mjs failure|success');
    } catch (e) {
        console.error('report-run:', e.message);
    }
}
