const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Pure reducer checks: no browser, HTTP, HALCON, uploads, or data mutations.
const filename = path.resolve(__dirname, '../src/lib/shared-inspection.ts');
const compiled = new Module(filename, module);
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
}).outputText, filename);
const { reduceInspectionMessage: reduce, isInspectionMessage: valid } = compiled.exports;

const job = (id = 'job-1', datasetId = 'dataset-1', completed = 0, status = 'running') => ({
  id, dataset_id: datasetId, status, total: 16, completed,
  current_sample_id: completed ? `sample-${completed}` : undefined,
  summary: { OK: completed, NOK: 0, WARN: 0 },
});
const result = (position, datasetId = 'dataset-1', status = 'OK') => ({
  dataset_id: datasetId, sample_id: `sample-${position}`, position, wt_index: 1,
  category: 'Fixture', status, channels: [], defects: [], created_at: '2026-10-05T12:00:00Z',
});
const snapshot = (sequence, currentJob = job(), rows = [], streamId = 'generation-1') => ({
  type: 'snapshot', stream_id: streamId, sequence, current_job_id: currentJob?.id || null,
  job: currentJob, results: rows,
});
const event = (type, sequence, currentJob = job(), inspected, streamId = 'generation-1', authority = currentJob.id) => ({
  type, stream_id: streamId, sequence, current_job_id: authority, job: currentJob,
  ...(inspected ? { result: inspected } : {}),
});
function preserved(previous, message, resync) {
  const next = reduce(previous, message);
  assert.equal(next.snapshot, previous, 'Rejected or duplicate messages must retain the existing snapshot object.');
  assert.equal(next.resync, resync);
}

// A tab/PC arriving mid-job gets every committed result, not a new inspection.
let current = snapshot(40, job('job-1', 'dataset-1', 2), [result(1), result(2)]);
assert(valid(current));
let reduced = reduce(null, current);
assert.equal(reduced.snapshot, current);
assert.equal(reduced.resync, false);
assert.equal(reduced.snapshot.results.length, 2);

// Delayed HTTP snapshots cannot undo later socket frames in one generation.
preserved(current, snapshot(39, job('old-job'), [result(1)]), false);
preserved(current, snapshot(40, null, []), false);
preserved(current, event('result', 40, job('job-1', 'dataset-1', 2), result(2)), false);
preserved(current, event('progress', 38, job()), false);

// In-order progress does not erase committed rows; the result commits next.
const pending = reduce(current, event('progress', 41, job('job-1', 'dataset-1', 2)));
assert.equal(pending.resync, false);
assert.equal(pending.snapshot.results, current.results);
assert.equal(pending.snapshot.sequence, 41);
current = reduce(pending.snapshot, event('result', 42, job('job-1', 'dataset-1', 3), result(3))).snapshot;
assert.deepEqual(current.results.map(item => item.position), [1, 2, 3]);
assert.equal(current.job.completed, 3);

// A duplicate delivery is ignored; a newer replacement never duplicates a row.
preserved(current, event('result', 42, job('job-1', 'dataset-1', 3), result(3)), false);
current = reduce(current, event('result', 43, job('job-1', 'dataset-1', 3), result(3, 'dataset-1', 'NOK'))).snapshot;
assert.deepEqual(current.results.map(item => item.position), [1, 2, 3]);
assert.equal(current.results[2].status, 'NOK');

// Missing events, overflow, unknown jobs, or a foreign result force a snapshot.
preserved(current, event('result', 45, job('job-1', 'dataset-1', 4), result(4)), true);
preserved(current, { type: 'resync', stream_id: 'generation-1', sequence: 44 }, true);
preserved(current, event('progress', 44, job('unannounced-job')), true);
preserved(current, event('result', 44, job('job-1'), result(4, 'wrong-dataset')), true);
preserved(null, event('result', 1, job('job-1'), result(1)), true);

// A late result from an older concurrent job cannot steal the newer canvas.
const newer = snapshot(50, job('newer-job', 'dataset-2', 1), [result(1, 'dataset-2')]);
preserved(newer, event('result', 51, job('older-job', 'dataset-1', 4), result(4), 'generation-1', 'newer-job'), true);
const authoritative = snapshot(51, job('newer-job', 'dataset-2', 1), [result(1, 'dataset-2')]);
reduced = reduce(newer, authoritative);
assert.equal(reduced.snapshot, authoritative);
assert.equal(reduced.resync, false);
assert.equal(reduced.snapshot.job.id, 'newer-job');

// Rerunning the same dataset clears the old tray because job IDs are distinct.
current = reduce(current, event('started', 44, job('rerun-job', 'dataset-1', 0, 'queued'))).snapshot;
assert.equal(current.job.id, 'rerun-job');
assert.equal(current.job.dataset_id, 'dataset-1');
assert.deepEqual(current.results, []);
current = reduce(current, event('result', 45, job('rerun-job', 'dataset-1', 1), result(1))).snapshot;
assert.deepEqual(current.results.map(item => item.position), [1]);
const complete = reduce(current, event('completed', 46, job('rerun-job', 'dataset-1', 1, 'completed'))).snapshot;
assert.equal(complete.job.status, 'completed');
assert.equal(complete.results, current.results);

// A fresh backend generation may restart its cursor from zero without being
// mistaken for an older snapshot. Non-snapshot generation changes resync first.
preserved(complete, event('result', 1, job('restart-job'), result(1), 'generation-2'), true);
const restarted = snapshot(0, null, [], 'generation-2');
reduced = reduce(complete, restarted);
assert.equal(reduced.snapshot, restarted);
assert.equal(reduced.resync, false);
assert.equal(reduced.snapshot.sequence, 0);
assert.equal(reduced.snapshot.job, null);

// Heartbeats keep unchanged state stable and detect gaps/restarts/late joins.
const beat = (streamId, sequence) => ({ type: 'heartbeat', stream_id: streamId, sequence });
preserved(current, beat('generation-1', current.sequence), false);
preserved(current, beat('generation-1', current.sequence - 1), false);
preserved(current, beat('generation-1', current.sequence + 1), true);
preserved(current, beat('generation-2', 0), true);
preserved(null, beat('generation-1', 0), true);

// History-cleared snapshots remove the visible job and all old frame results.
const cleared = snapshot(current.sequence + 1, null, []);
assert.equal(reduce(current, cleared).snapshot, cleared);
assert.deepEqual(cleared.results, []);

// Malformed envelopes never enter the typed stream state.
for (const input of [null, false, '', [], {},
  { type: 'heartbeat', stream_id: 'generation-1', sequence: -1 },
  { type: 'heartbeat', stream_id: 'generation-1', sequence: 1.5 },
  { type: 'heartbeat', stream_id: 'generation-1', sequence: '1' },
  { type: 'unknown', stream_id: 'generation-1', sequence: 1 },
  { type: { toString: null }, stream_id: 'generation-1', sequence: 1 },
  { ...snapshot(1), job: { ...job(), status: 'invalid' } },
  { ...snapshot(1), job: { ...job(), summary: [] } },
  { ...snapshot(1), job: { ...job(), completed: -1 } },
  { ...snapshot(1), job: { ...job(), total: NaN } },
  { ...snapshot(1), results: {} },
  { ...snapshot(1), results: [null] },
  { ...snapshot(1), results: [{ ...result(1), sample_id: undefined }] },
  { ...snapshot(1), results: [{ ...result(1), status: 'unknown' }] },
  { ...snapshot(1), results: [{ ...result(1), channels: null }] },
  { ...snapshot(1), results: [{ ...result(1), defects: {} }] },
  { ...snapshot(1), results: [{ ...result(1), created_at: 100 }] },
  { ...snapshot(1), results: [{ ...result(1), position: 1.5 }] },
  { ...event('result', 1), result: null },
  { ...event('result', 1), result: {} },
  { ...event('result', 1), result: { ...result(1), defects: [null] } },
]) assert.equal(valid(input), false, `Invalid message accepted: ${JSON.stringify(input)}`);
for (const input of [snapshot(1), snapshot(1, null), event('started', 1), event('progress', 1), event('result', 1, job(), result(1)), event('completed', 1, job('job-1', 'dataset-1', 1, 'completed')), beat('generation-1', 1)]) assert(valid(input));

// Actual Python serialization includes explicit null optional defect fields.
const defect = { name: 'Surface Imperfection', confidence: 0.98, severity: 'major', tolerance: 'AT', bbox_xywh_norm: null, polygon_norm: null, channel: 'h', size_px: null, position_text: null, overlay_color: null };
const channel = { channel: 'h', image_path: '/fixture/lens.h.bmp', status: 'NOK', defects: [defect], measurements: { width_px: 2448, lens_type: 'SPH' }, engine: 'halcon-dsm', elapsed_ms: 1551.047 };
const measured = { ...result(1, 'dataset-1', 'NOK'), expected_label: null, defects: [defect], channels: [channel] };
assert(valid(snapshot(1, job(), [measured])));
assert(valid(event('result', 1, job(), measured)));
for (const replacement of [
  { ...channel, elapsed_ms: Infinity }, { ...channel, measurements: [] }, { ...channel, defects: [null] },
  { ...channel, defects: [{ ...defect, bbox_xywh_norm: [0, 0] }] },
  { ...channel, defects: [{ ...defect, polygon_norm: [[0, 'bad']] }] },
]) assert.equal(valid(snapshot(1, job(), [{ ...measured, channels: [replacement] }])), false);

console.log('Shared inspection checks passed: late joins, stale snapshots, ordered results, deduplication, gaps/resync, reruns, generation resets, concurrent-job authority, heartbeats, and history clears.');
