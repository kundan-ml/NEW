const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.resolve(__dirname, '../src/lib/defect-class-labels.ts');
const compiled = new Module(file, module);
compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, file);
const {defectClassInitials, defectClassCodes} = compiled.exports;
for (const [name,code] of [['NonCircular','NC'],['Surface Imperfection','SI'],['Particle Inclusion','PI'],['Bubble','B'],['Defect: NonCircular','NC'],['Additional HALCON defect class 14','AHDC14']]) {
  assert.equal(defectClassInitials(name),code);
}
const names = ['Surface Imperfection','Scratch Inspection','Surface Imperfection 1','Surface Imperfection 2'];
const codes = defectClassCodes(names);
assert.equal(new Set(codes.values()).size,names.length,'Codes cannot collide with other initials or numbered classes');
assert.deepEqual([...defectClassCodes([...names].reverse())].sort(),[...codes].sort(),'Input ordering does not change codes');
assert.equal(defectClassCodes(['Bubble','Bubble']).size,1);
assert.equal(defectClassInitials(''),'D');
console.log('Defect initials checks passed: camel-case, words, numbered types, collision avoidance and stable ordering.');
