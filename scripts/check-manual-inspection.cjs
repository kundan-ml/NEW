// Pure regressions: no server, preferences, datasets or native algorithm writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
function load(name){const filename=path.resolve(__dirname,`../src/lib/${name}.ts`),compiled=new Module(filename,module);compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,filename);return compiled.exports}
const {hitTestDefects,defectBounds,displayFilterFrom,matchesDisplayFilter}=load('inspection-display');
const {calculateInspectionYield,yieldSeries}=load('inspection-yield');
const triangle={name:'Surface',polygon_norm:[[.1,.1],[.5,.1],[.1,.5]]};
const square={name:'Other',bbox_xywh_norm:[.12,.12,.1,.1]};
assert.deepEqual(defectBounds(triangle),[.1,.1,.4,.4]);
assert.equal(hitTestDefects([triangle,square],.15,.15),1);
assert.equal(hitTestDefects([triangle],.45,.45),-1);
assert.equal(hitTestDefects([triangle],.13,.3),0);
const filter=displayFilterFrom({positions:[1],result_types:['NOK'],error_classes:['surface'],apply_to_display:true});
const legend={defects:[{key:'surface',match_terms:['Surface']}]};
assert(matchesDisplayFilter({position:1},{status:'NOK',defects:[{name:'Surface Imperfection'}]},filter,legend));
assert(!matchesDisplayFilter({position:2},{status:'NOK',defects:[{name:'Surface Imperfection'}]},filter,legend));
assert(matchesDisplayFilter({position:2},{status:'OK',defects:[]},null,legend));
const results=Array.from({length:24},(_,index)=>({dataset_id:'d',sample_id:String(index),wt_index:Math.floor(index/2)+1,position:index%2+1,status:index<4?'NOK':'OK',defects:[],created_at:new Date(Date.UTC(2026,9,5,0,index)).toISOString()}));
assert.equal(calculateInspectionYield(results),100,'Last 10 trays, not entire history');
assert.equal(yieldSeries(results,2).length,12);
assert.equal(yieldSeries(results,4).length,0,'No fabricated complete-tray values');
assert.equal(calculateInspectionYield([{...results[0],status:'NOK',defects:[{name:'No Lens'}]},{...results[1],status:'OK'}]),100,'No-lens excluded');
console.log('Manual inspection checks passed: polygon hit tests, display filters, real moving yield, complete-tray chart and no-lens exclusion.');
