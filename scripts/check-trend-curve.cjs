// Pure interpolation checks: display smoothing must never invent counts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../src/lib/trend-curve.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, filename);
const {smoothTrendPath} = compiled.exports;
assert.equal(smoothTrendPath([]), '');
assert.equal(smoothTrendPath([{x:1,y:2}]), 'M1.00,2.00');
for (const values of [[0,0,0], [0,1,2,3], [3,2,1,0], [0,3,0,2,0], [0,1,1,0], [8,2,9,4,0,5]]) {
  const points = values.map((y,index) => ({x: index * 10, y}));
  const curve = smoothTrendPath(points);
  const segments = [...curve.matchAll(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/g)];
  assert.equal(segments.length, points.length - 1);
  for (const [index,segment] of segments.entries()) {
    const [x1,y1,x2,y2,x3,y3] = segment.slice(1).map(Number);
    assert.deepEqual([x3,y3], [points[index+1].x,points[index+1].y], 'Exact measured endpoint');
    assert(x1 >= points[index].x && x1 <= x2 && x2 <= x3, 'Time remains monotonic');
    const low = Math.min(values[index],values[index+1]), high = Math.max(values[index],values[index+1]);
    for (const control of [y1,y2]) assert(control >= low-.01 && control <= high+.01, 'No invented peaks or negative values');
    for(let step=0;step<=100;step++) {
      const t=step/100,s=1-t;
      const y=s*s*s*values[index]+3*s*s*t*y1+3*s*t*t*y2+t*t*t*y3;
      assert(y>=low-.01 && y<=high+.01, 'Interpolated curve stays in the measured pair range');
    }
  }
}
console.log('Smooth trend curves passed: measured endpoints, cubic connections, monotonic time, no overshoot or negative counts.');
