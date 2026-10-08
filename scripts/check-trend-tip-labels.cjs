// Pure label layout checks: no API, storage, preferences, or datasets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/trend-tip-labels.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, filename);
const {layoutTrendTipLabels} = compiled.exports;

function check(tips, top, bottom, gap = 14) {
  const before = JSON.stringify(tips);
  const labels = layoutTrendTipLabels(tips, top, bottom, gap);
  assert.equal(labels.length, tips.length, 'Every line retains its label');
  assert.equal(JSON.stringify(tips), before, 'Caller-owned endpoints are unchanged');
  const columns = new Map();
  for (const label of labels) {
    assert.equal(label.tipY, tips.find(tip => tip.key === label.key).y, 'Measured endpoint is preserved exactly');
    assert(Number.isFinite(label.labelY), 'Label coordinates are finite');
    assert(Number.isInteger(label.column) && label.column >= 0, 'Column is finite and nonnegative');
    assert(label.labelY >= top - 1e-9 && label.labelY <= bottom + 1e-9, 'Labels stay inside plot bounds');
    const group = columns.get(label.column) || [];
    group.push(label);
    columns.set(label.column, group);
  }
  for (const group of columns.values()) {
    for (let index = 1; index < group.length; index++) {
      assert(group[index].labelY - group[index - 1].labelY >= gap - 1e-9, 'Labels in a column do not overlap');
    }
  }
  if (columns.size) {
    const sizes = [...columns.values()].map(group => group.length);
    assert(Math.max(...sizes) - Math.min(...sizes) <= 1, 'Crowded columns are balanced');
  }
  assert.deepEqual(layoutTrendTipLabels([...tips].reverse(), top, bottom, gap), labels, 'Input ordering does not change layout');
  return labels;
}

assert.deepEqual(layoutTrendTipLabels([], 10, 100), []);
const distinct = [{key:'a',y:12}, {key:'b',y:45}, {key:'c',y:90}];
assert.deepEqual(check(distinct, 10, 100).map(label => label.labelY), [12,45,90], 'Separate labels retain their natural position');
const equal = ['c','a','b'].map(key => ({key,y:100}));
assert.deepEqual(check(equal, 10, 100).map(label => [label.key,label.labelY]), [['a',72],['b',86],['c',100]], 'Equal totals have deterministic spaced labels');
check([{key:'low',y:-500}, {key:'high',y:500}], 10, 100);
check([{key:'a',y:12}, {key:'b',y:13}, {key:'c',y:14}], 10, 100);
const crowded = Array.from({length:20}, (_, index) => ({key:`class-${String(index).padStart(2,'0')}`,y:75}));
assert.equal(new Set(check(crowded, 10, 150).map(label => label.column)).size, 2, 'Twenty crowded classes use two balanced columns');
assert.equal(new Set(check(crowded, 10, 12).map(label => label.column)).size, 20, 'A very short plot uses one label per column');
check(crowded, 10, 10);
check(crowded, 10, 100, 9);
for (const [top,bottom,gap] of [[NaN,Infinity,NaN],[50,10,0],[0,100,-4]]) {
  const labels = layoutTrendTipLabels(crowded, top, bottom, gap);
  assert(labels.every(label => Number.isFinite(label.labelY)), 'Invalid layout dimensions still produce finite coordinates');
}

console.log('Trend tip labels passed: stable initials placement, exact endpoints, bounds, spacing, balanced crowded columns, and small plots.');
