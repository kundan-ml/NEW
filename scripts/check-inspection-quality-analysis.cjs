// Pure Yield/Defects analytics regressions; no backend, storage, or UI writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.resolve(__dirname, `../src/lib/${name}.ts`);
  const compiled = new Module(filename, module);
  compiled.require = request => request.startsWith('./') ? load(request.slice(2)) : require(request);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  cache.set(name, compiled.exports);
  return compiled.exports;
}
const { buildInspectionTrends } = load('inspection-trends');
const { buildQualityAnalysis } = load('inspection-quality-analysis');
const now = Date.UTC(2026, 9, 7, 12);
function result(id, secondsAgo, status = 'OK', extra = {}) {
  return {
    dataset_id: 'first', sample_id: id, wt_index: 1, position: 1,
    category: '', status, defects: [], channels: [],
    created_at: new Date(now - secondsAgo * 1000).toISOString(), ...extra,
  };
}
function named(name) { return { name, confidence: 1, severity: 'major' }; }
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function close(actual, expected) { assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`); }

const source = [
  result('a', 100, 'NOK', { defects: [named('Replaced defect')] }),
  result('a', 10, 'OK', { defects: [named(' Surface  Imperfection '), named('SURFACE IMPERFECTION'), named('Bubble')] }),
  result('b', 20, 'NOK', { defects: [named('surface imperfection'), named('Bubble'), named('bubble')] }),
  result('c', 30, 'WARN'),
  result('d', 40, 'NOK', { defects: [named('No Lens')] }),
  result('e', 50, 'OK', { defects: [named('No test job')] }),
  result('old', 301, 'NOK', { defects: [named('Outside window')] }),
  result('future', -1, 'NOK', { defects: [named('Future defect')] }),
  result('invalid', 0, 'NOK', { created_at: 'invalid', defects: [named('Invalid time')] }),
  result('a', 60, 'NOK', { dataset_id: 'second', defects: [named('Surface Imperfection')] }),
];
const model = freeze(buildInspectionTrends(source, '5m', now));
const before = JSON.stringify(model);
const quality = buildQualityAnalysis(model);
assert.equal(model.total, 6);
assert.equal(quality.totalOccurrences, 9);
assert.equal(quality.affectedLenses, 5, 'Multiple classes/instances never inflate unique affected lenses');
assert.equal(quality.defectFreeLenses, 1, 'A WARN lens without defects is still defect-free, not automatically OK');
assert.equal(quality.activeClasses, 4);
assert.equal(quality.eligibleLenses, 4);
assert.equal(quality.excludedLenses, 2);
assert.equal(quality.eligibleOkLenses, 1, 'Excluded OK results cannot inflate the quality ring');
assert.equal(quality.eligibleNokLenses, 2, 'Excluded NOK results cannot inflate the quality ring');
assert.equal(quality.eligibleWarnLenses, 1);
assert.equal(quality.eligibleOtherLenses, 0);
assert.equal(quality.eligibleOkLenses + quality.eligibleNokLenses + quality.eligibleWarnLenses + quality.eligibleOtherLenses, quality.eligibleLenses);
assert.equal(quality.yieldPercent, model.yield);
assert.equal(quality.yieldPercent, 25, 'No lens/no test jobs retain the existing yield exclusion');
close(quality.defectRatePercent, 5 / 6 * 100);
assert.deepEqual(quality.classes.map(item => item.key), ['surface imperfection', 'bubble', 'no Lens'.toLowerCase(), 'no test job']);
const surface = quality.classes[0];
assert.equal(surface.name, 'Surface Imperfection', 'Readable spelling collapses whitespace');
assert.equal(surface.occurrences, 4);
assert.equal(surface.lenses, 3);
assert.equal(surface.ok, 1, 'An accepted lens may contain an allowed defect; never relabel it NOK');
assert.equal(surface.nok, 2);
assert.equal(surface.warn, 0);
assert.equal(surface.affectedPercent, 50);
close(surface.occurrenceSharePercent, 4 / 9 * 100);
close(surface.cumulativeSharePercent, 4 / 9 * 100);
assert.equal(quality.classes[1].occurrences, 3);
assert.equal(quality.classes[1].lenses, 2);
assert.equal(quality.classes[1].ok, 1);
assert.equal(quality.classes[1].nok, 1);
close(quality.classes[1].cumulativeSharePercent, 7 / 9 * 100);
assert.equal(quality.classes.at(-1).cumulativeSharePercent, 100);
assert(quality.classes.every(item => item.ok + item.nok + item.warn === item.lenses));
assert.equal(quality.classes.reduce((sum, item) => sum + item.occurrences, 0), quality.totalOccurrences);
assert.equal(JSON.stringify(model), before, 'Does not mutate frozen caller-owned results, buckets, or defect lists');

const tied = buildQualityAnalysis(buildInspectionTrends([
  result('tie', 1, 'WARN', { defects: [named('Zeta'), named('Beta'), named('Alpha')] }),
], 'all', now));
assert.deepEqual(tied.classes.map(item => item.name), ['Alpha', 'Beta', 'Zeta'], 'Tied occurrence counts have stable readable-name ordering');
assert.equal(tied.classes[0].warn, 1);
assert.equal(tied.affectedLenses, 1);
assert.equal(tied.totalOccurrences, 3);
assert.equal(tied.lastBucketYieldPercent, 0, 'An actual zero-yield observation stays zero');
assert.equal(tied.previousBucketYieldPercent, null);
assert.equal(tied.yieldDeltaPoints, null, 'One occupied bucket does not invent a previous measurement');

const interrupted = buildQualityAnalysis(buildInspectionTrends([
  result('previous', 100, 'NOK'),
  result('latest', 10, 'OK'),
], '5m', now));
assert.equal(interrupted.lastBucketYieldPercent, 100);
assert.equal(interrupted.previousBucketYieldPercent, 0);
assert.equal(interrupted.yieldDeltaPoints, 100, 'Delta compares occupied buckets across real idle periods');

const excludedLatest = buildQualityAnalysis(buildInspectionTrends([
  result('previous', 100),
  result('latest', 10, 'NOK', { defects: [named('No Lens Found')] }),
], '5m', now));
assert.equal(excludedLatest.lastBucketYieldPercent, null, 'An excluded-only occupied latest bucket is not replaced by an older yield');
assert.equal(excludedLatest.previousBucketYieldPercent, 100);
assert.equal(excludedLatest.yieldDeltaPoints, null);
assert.equal(excludedLatest.yieldPercent, 100);
assert.equal(excludedLatest.eligibleLenses, 1);
assert.equal(excludedLatest.excludedLenses, 1);

const clean = buildQualityAnalysis(buildInspectionTrends([
  result('clean', 2, 'OK', { defects: [named(' '), named('\t\n')] }),
], 'all', now));
assert.equal(clean.totalOccurrences, 0, 'Blank class names do not become fake defects');
assert.equal(clean.affectedLenses, 0);
assert.equal(clean.defectFreeLenses, 1);
assert.equal(clean.defectRatePercent, 0);
assert.equal(clean.yieldPercent, 100);
assert.deepEqual(clean.classes, []);

const topLevelOnly = buildQualityAnalysis(buildInspectionTrends([
  result('aggregate', 1, 'NOK', {
    defects: [named('Bubble')],
    channels: ['h', 'p', 'd', 'n'].map(channel => ({ channel, defects: [named('Bubble')], elapsed_ms: 1 })),
  }),
], 'all', now));
assert.equal(topLevelOnly.totalOccurrences, 1, 'Do not add camera/channel instances already included in top-level aggregate output');

const unknown = buildQualityAnalysis(buildInspectionTrends([
  result('unknown runtime status', 1, 'IDLE'),
], 'all', now));
assert.equal(unknown.eligibleLenses, 1);
assert.equal(unknown.eligibleOtherLenses, 1, 'Unexpected runtime statuses remain a distinct outcome instead of being interpreted as accepted');
assert.equal(unknown.yieldPercent, 0);

for (const range of ['5m', '30m', '1h', '4h', '24h', 'all']) {
  const empty = buildQualityAnalysis(buildInspectionTrends([], range, now));
  assert.deepEqual(empty.classes, []);
  for (const key of ['totalOccurrences', 'affectedLenses', 'defectFreeLenses', 'activeClasses', 'eligibleLenses', 'excludedLenses', 'eligibleOkLenses', 'eligibleNokLenses', 'eligibleWarnLenses', 'eligibleOtherLenses']) {
    assert.equal(empty[key], 0, `Empty ${key}`);
  }
  for (const key of ['yieldPercent', 'defectRatePercent', 'lastBucketYieldPercent', 'previousBucketYieldPercent', 'yieldDeltaPoints']) {
    assert.equal(empty[key], null, `Empty ${key} is unknown, not fabricated`);
  }
}
console.log('Inspection quality analysis: all pure regressions passed.');
