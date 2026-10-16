import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAlert } from './report-run.mjs';

test('alert: threshold 1 alerts on any failure', () => {
    assert.equal(shouldAlert(1, []), true);
});

test('alert: threshold 3 needs the previous two runs to have failed', () => {
    assert.equal(shouldAlert(3, ['failure', 'failure']), true);
    assert.equal(shouldAlert(3, ['failure', 'success']), false);
    assert.equal(shouldAlert(3, ['failure']), false);            // not enough history yet
    assert.equal(shouldAlert(3, ['failure', 'failure', 'success']), true); // older runs ignored
});
