const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/inference-timing.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;
const compiled = new Module(filename, module);
compiled._compile(source, filename);
const { inferenceElapsedMs, averageInferenceMs, formatInferenceMs } = compiled.exports;
const result = times => ({ channels: times.map(elapsed_ms => ({ elapsed_ms })) });

assert.equal(inferenceElapsedMs(result([123.456, 123.456, 123.456, 123.456])), 123.456);
assert.equal(averageInferenceMs([result([100, 100, 100, 100]), result([200])]), 150);
assert.equal(inferenceElapsedMs(undefined), null);
assert.equal(inferenceElapsedMs(result([])), null);
assert.equal(inferenceElapsedMs(result([NaN, Infinity, -1, '25'])), null);
assert.equal(inferenceElapsedMs(result([0])), 0);
assert.equal(averageInferenceMs([]), null);
assert.equal(averageInferenceMs([result([]), result([20])]), 20);
assert.equal(formatInferenceMs(null), '—');
assert.equal(formatInferenceMs(0), '0.000 ms');
assert.equal(formatInferenceMs(123.456), '123.456 ms');
console.log('Inference timing checks passed.');
