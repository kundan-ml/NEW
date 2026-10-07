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
const { buildTrayDefectAnalysis } = load('tray-defect-analysis');
const now = Date.UTC(2026, 9, 7, 12);
const named = name => ({ name, confidence: 1, severity: 'major' });
const result = (id, wt, names, extra = {}) => ({
  dataset_id: 'first', sample_id: id, wt_index: wt, position: 1,
  category: '', status: names.length ? 'NOK' : 'OK',
  defects: names.map(named), channels: [],
  created_at: new Date(now - (20 - wt) * 1000).toISOString(), ...extra,
});
const source = [
  result('replaced', 1, ['Old']),
  result('replaced', 1, [' Surface  Imperfection ', 'surface imperfection', 'Bubble'], {
    created_at: new Date(now - 1000).toISOString(),
    channels: ['h', 'p', 'd', 'n'].map(channel => ({ channel, defects: [named('Bubble')] })),
  }),
  result('b', 2, ['Bubble', 'BUBBLE', 'Surface Imperfection']),
  result('c', 2, [], { status: 'WARN' }),
  result('d', 2, [' ']),
  result('other dataset', 1, ['Bubble'], { dataset_id: 'second' }),
];
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const model = freeze(buildInspectionTrends(source, 'all', now));
const before = JSON.stringify(model);
const analysis = buildTrayDefectAnalysis(model);
assert.equal(analysis.totalOccurrences, 7);
assert.equal(analysis.displayedOccurrences, 7);
assert.equal(analysis.classes.length, 2, 'Blank names and channel output never create extra classes');
assert.equal(analysis.classes.find(item => item.key === 'surface imperfection').occurrences, 3);
const first = analysis.trays.find(row => row.tray.datasetId === 'first' && row.tray.wt === 1);
assert.equal(first.totalOccurrences, 3);
assert.equal(first.affectedLenses, 1);
assert.equal(first.columns.find(column => column.classKey === 'surface imperfection').occurrences, 2);
assert.equal(first.columns.find(column => column.classKey === 'surface imperfection').affectedLenses, 1);
const second = analysis.trays.find(row => row.tray.datasetId === 'first' && row.tray.wt === 2);
assert.equal(second.totalOccurrences, 3);
assert.equal(second.affectedLenses, 1, 'Multiple instances/classes count one affected lens');
assert.equal(second.tray.total, 3, 'Clean and unnamed-output lenses remain in measured tray outcomes');
assert.equal(JSON.stringify(model), before, 'Read-only aggregation does not mutate caller-owned data');
const retained = buildInspectionTrends(Array.from({ length: 12 }, (_, index) =>
  result(`sample-${index}`, index + 1, [index === 0 ? 'Earlier class' : 'Bubble'])), 'all', now);
const bounded = buildTrayDefectAnalysis(retained, 8);
assert.equal(bounded.trays.length, 8);
assert.equal(bounded.omittedTrays, 4);
assert.equal(bounded.displayedOccurrences, 8);
assert.equal(bounded.totalOccurrences, 12);
assert.equal(bounded.classes.find(item => item.key === 'earlier class').occurrences, 1);
assert.equal(bounded.classes.find(item => item.key === 'earlier class').displayedOccurrences, 0, 'Earlier classes remain explicitly available with zero displayed-tray instances');
assert.equal(buildTrayDefectAnalysis(retained, 0).trays.length, 1);
assert.equal(buildTrayDefectAnalysis(retained, Infinity).trays.length, 8);
const clean = buildTrayDefectAnalysis(buildInspectionTrends([result('clean', 1, [])], 'all', now));
assert.equal(clean.trays.length, 1);
assert.equal(clean.totalOccurrences, 0);
assert.deepEqual(clean.classes, []);
const empty = buildTrayDefectAnalysis(buildInspectionTrends([], 'all', now));
assert.deepEqual(empty.trays, []);
assert.deepEqual(empty.classes, []);
assert.equal(empty.totalOccurrences, 0);
console.log('3D tray defect analysis: all pure regressions passed.');
