/* Isolated Trend Line browser regression checks. Every API request (including
 * config writes) and the inspection WebSocket is fulfilled by local fixtures.
 * No upload, inference, deletion or preference mutation reaches a real backend.
 * Usage: node scripts/check-trend-line-ui.cjs http://localhost:3107
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const WebSocket = require('next/dist/compiled/ws');

const base = process.argv[2] || 'http://localhost:3107';
const port = Number(process.env.TREND_QA_CHROME_PORT || 9364);
const temporaryRoot = fs.existsSync(os.tmpdir()) ? os.tmpdir() : '/tmp';
const profile = fs.mkdtempSync(path.join(temporaryRoot, 'trend-line-qa-'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const channels = ['h', 'd', 'n', 'p'];
const samples = Array.from({length:32}, (_, i) => ({
  id:`trend-${i+1}`,position:i%16+1,wt_index:Math.floor(i/16)+1,
  category:'Inspection',base_name:`Fixture_Position${i%16+1}`,metadata:{},
  images:Object.fromEntries(channels.map(channel=>[channel,{
    channel,filename:`Fixture_Position${i%16+1}.${channel}.bmp`,
    relative_path:`trend-${i+1}.${channel}.bmp`,absolute_path:`/fixture/trend-${i+1}.${channel}.bmp`,
  }])),
}));
const epoch = Date.now();
const ages = [2*3600000,30*60000,60000,30000,10000];
const statuses = ['OK','NOK','WARN','NOK','OK'];
function result(index, status = statuses[(index-1)%statuses.length], at = epoch-(ages[index-1]||0)) {
  const defects = status === 'NOK' ? [{name:index===2||index%2?'NonCircular':'Surface Imperfection',confidence:1,severity:'major',channel:'h'}] : [];
  return {dataset_id:'trend',sample_id:`trend-${index}`,position:(index-1)%16+1,wt_index:Math.floor((index-1)/16)+1,
    category:'Inspection',status,defects,created_at:new Date(at).toISOString(),
    channels:channels.map(channel=>({channel,image_path:'/fixture/image.bmp',status,defects:channel==='h'?defects:[],measurements:{},engine:'fixture-dsm',elapsed_ms:12+index+.25})),
  };
}
let snapshot = {type:'snapshot',stream_id:'trend-qa',sequence:1,current_job_id:'trend-job',
  job:{id:'trend-job',dataset_id:'trend',status:'running',total:32,completed:5,current_sample_id:'trend-6',summary:{OK:2,NOK:2,WARN:1}},
  results:Array.from({length:5},(_,i)=>result(i+1))};
const dataset = {id:'trend',name:'Trend fixture',source_type:'upload',source_path:'/fixture',sample_count:32,image_count:128,
  categories:{Inspection:32},channels:Object.fromEntries(channels.map(channel=>[channel,32])),created_at:new Date(epoch-7200000).toISOString()};
const previousSamples=samples.slice(0,16).map((sample,index)=>({...sample,id:`previous-${index+1}`}));
const previousDataset={...dataset,id:'previous',name:'Previous tray fixture',sample_count:16,image_count:64,created_at:new Date(epoch-10800000).toISOString()};
let fixtureLegend={statuses:[
  {key:'OK',label:'Inspection OK',color:'#14b8a6',symbol:'check'},
  {key:'NOK',label:'Inspection NOK',color:'#e64669',symbol:'x'},
  {key:'WARN',label:'Warning',color:'#efb84c',symbol:'triangle'},
  {key:'IDLE',label:'Not inspected',color:'#6b7280',symbol:'dot'},
],defects:[
  {key:'surface',label:'Surface Imperfection',match_terms:['Surface Imperfection'],color:'#a86af5',symbol:'S'},
  {key:'non-circular',label:'NonCircular',match_terms:['NonCircular'],color:'#25c0d7',symbol:'NC'},
],fallback_defect:{key:'DEFECT',label:'Unclassified defect',color:'#e64669',symbol:'x'}};
const viewers = [];
const reports = [];
let browser, chrome;

function connect(url) {
  const ws = new WebSocket(url), pending = new Map(), listeners = new Map();
  let id = 0;
  const ready = new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  ws.on('message',raw=>{
    const value=JSON.parse(String(raw));
    if(value.id){const call=pending.get(value.id);if(!call)return;pending.delete(value.id);value.error?call.reject(Error(value.error.message)):call.resolve(value.result);}
    else for(const listener of listeners.get(value.method)||[])listener(value.params);
  });
  return {ready,on(method,callback){listeners.set(method,[...(listeners.get(method)||[]),callback]);},
    send(method,params={}){return new Promise((resolve,reject)=>{const serial=++id;pending.set(serial,{resolve,reject});ws.send(JSON.stringify({id:serial,method,params}));});},
    close(){ws.close();}};
}

async function fulfill(viewer,event) {
  const url=new URL(event.request.url),route=url.pathname,method=event.request.method;
  let body={},contentType='application/json';
  if(!['GET','HEAD','OPTIONS'].includes(method))viewer.mutations.push({route,method});
  if(route==='/api/image'){
    contentType='image/svg+xml';
    body='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#050505"/><circle cx="320" cy="240" r="190" fill="#777"/></svg>';
  }else if(route==='/api/ui-config/access')body={canCustomize:false};
  else if(route==='/api/ui-config')body={manualSkeleton:viewer.classic,theme:'graphite'};
  else if(route.endsWith('/system/info'))body={app:'Trend fixture',version:'3',mode:'AUTO',bridge:'fixture',
    settings:{station_name:'Station 1',installation_name:'Fixture',line_name:'Fixture',station_index:1,wt_capacity:16,role:'Operator',channel_labels:{h:'Telecentric',d:'Dark Field',n:'Diffuse',p:'Phase Contrast'},image_format:'BMP'},
    session:{username:'qa-fixture',role:'Operator',logged_in:true}};
  else if(route.endsWith('/inspection/live'))body=viewer.empty?{type:'snapshot',stream_id:'empty',sequence:0,current_job_id:null,job:null,results:[]}:snapshot;
  else if(route.endsWith('/datasets'))body=viewer.empty?[]:[previousDataset,dataset];
  else if(route.endsWith('/datasets/trend/samples'))body={total:samples.length,items:samples};
  else if(route.endsWith('/datasets/previous/samples'))body={total:previousSamples.length,items:previousSamples};
  else if(route.endsWith('/results/trend'))body={items:snapshot.results};
  else if(route.endsWith('/results/previous'))body={items:[]};
  else if(route.endsWith('/storage/state'))body={active:false,saved_lenses:0,saved_images:0,event_count:0,position_counts:{},error_counts:{}};
  else if(route.endsWith('/config/status-symbol-legend'))body=fixtureLegend;
  else if(route.endsWith('/config/image-filters'))body={positions:Array.from({length:16},(_,i)=>i+1),result_types:['OK','NOK','WARN'],error_classes:[],apply_to_display:false};
  else if(route.endsWith('/logs'))body={items:[]};
  else if(route.endsWith('/auth/current'))body={username:'qa-fixture',role:'Operator',logged_in:true};
  await viewer.cdp.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,
    responseHeaders:[{name:'Content-Type',value:contentType},{name:'Cache-Control',value:'no-store'}],
    body:Buffer.from(typeof body==='string'?body:JSON.stringify(body)).toString('base64')});
}

function socketFixture(initial) {
  return `(()=>{
    window.__trendSnapshot=${JSON.stringify(initial)};window.__trendSockets=[];
    const Native=window.WebSocket;
    class FixtureSocket extends EventTarget {
      static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
      constructor(url,protocols){super();if(!String(url).endsWith('/ws/inspection'))return new Native(url,protocols);this.readyState=0;window.__trendSockets.push(this);setTimeout(()=>{if(this.readyState===3)return;this.readyState=1;this.onopen?.({});this.onmessage?.({data:JSON.stringify(window.__trendSnapshot)});},20);}
      close(){this.readyState=3;this.onclose?.({code:1000});}send(){}
    }
    window.WebSocket=FixtureSocket;
    window.__trendBroadcast=message=>{window.__trendSnapshot=message;for(const socket of window.__trendSockets)if(socket.readyState===1)socket.onmessage?.({data:JSON.stringify(message)});};
  })()`;
}

async function waitFor(viewer,expression,label,timeout=15000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await viewer.evaluate(expression))return;await pause(100);}
  throw Error(`${viewer.classic?'Classic':'Modern'} ${viewer.empty?'empty':'live'}: ${label}; DOM=${await viewer.evaluate('document.body.innerText.slice(0,1200)')}; errors=${JSON.stringify(viewer.errors)}`);
}

async function makeViewer(classic,empty=false) {
  const {browserContextId}=await browser.send('Target.createBrowserContext');
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId});
  const targets=await fetch(`http://127.0.0.1:${port}/json`).then(response=>response.json());
  const cdp=connect(targets.find(target=>target.id===targetId).webSocketDebuggerUrl);await cdp.ready;
  const viewer={cdp,classic,empty,errors:[],mutations:[]};viewers.push(viewer);
  viewer.evaluate=async expression=>{const output=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(output.exceptionDetails)throw Error(output.exceptionDetails.exception?.description||output.exceptionDetails.text);return output.result.value;};
  cdp.on('Runtime.exceptionThrown',event=>viewer.errors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
  cdp.on('Fetch.requestPaused',event=>fulfill(viewer,event).catch(error=>{if(!/Invalid InterceptionId/.test(String(error)))viewer.errors.push(String(error));}));
  await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
  await resize(viewer,1920,1080);
  const initial=empty?{type:'snapshot',stream_id:'empty',sequence:0,current_job_id:null,job:null,results:[]}:snapshot;
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:socketFixture(initial)});
  await cdp.send('Page.navigate',{url:`${base}/?trend-ui-qa=${Date.now()}`});
  await waitFor(viewer,'!!document.querySelector(".inspectionLogTabs,.referencePanelTabs")','dashboard hydration');
  // Server-rendered dashboard markup exists before the provider's storage
  // listener mounts. Wait for its first preference effect, not just SSR DOM.
  await waitFor(viewer,`!!localStorage.getItem('lens-ui-prefs-v13')`,'appearance provider hydration');
  if(!empty)await waitFor(viewer,`!!document.querySelector('.historyTable .matrixDot.selected')`,'live snapshot hydration');
  else await waitFor(viewer,`document.body.innerText.includes('qa-fixture')`,'empty dashboard client hydration');
  await viewer.evaluate(`(()=>{const prefs=JSON.parse(localStorage.getItem('lens-ui-prefs-v13')||'{}');prefs.manualSkeleton=${classic};prefs.theme='graphite';window.dispatchEvent(new StorageEvent('storage',{key:'lens-ui-prefs-v13',newValue:JSON.stringify(prefs)}));})()`);
  await waitFor(viewer,`document.documentElement.dataset.workspace===${JSON.stringify(classic?'manual':'modern')}`,'appearance fixture');
  await waitFor(viewer,classic?`!!document.querySelector('.inspectionLogTabs')`:`!!document.querySelector('.referenceTrendPanel')`,'selected layout rendered');
  for(let attempt=0;attempt<10;attempt++){
    await viewer.evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Trend Line').click()`);
    await pause(100);
    if(await viewer.evaluate('!!document.querySelector(".trendLineWorkspace")'))break;
  }
  await waitFor(viewer,'!!document.querySelector(".trendLineWorkspace")','new Trend Line tab');
  // Classic now intentionally starts with a five-minute live defect window.
  // Select its longest rolling preset for this all-history fixture matrix;
  // Modern retains the existing All results choice.
  if(classic)await range(viewer,'24h');
  return viewer;
}

async function resize(viewer,width,height){await viewer.cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(120);}
async function select(viewer,label){await viewer.evaluate(`Array.from(document.querySelectorAll('.trendLineWorkspace [role="tab"]')).find(tab=>tab.textContent.trim()===${JSON.stringify(label)}).click()`);await pause(100);}
async function range(viewer,value){const selected=viewer.classic&&value==='all'?'24h':value;await viewer.evaluate(`(()=>{const input=document.querySelector('.trendLineWorkspace [aria-label="Trend time range"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,${JSON.stringify(selected)});input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(100);}
async function screenshot(viewer,name){const value=await viewer.cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(temporaryRoot,name),Buffer.from(value.data,'base64'));}
async function appearance(viewer,theme){
  await viewer.evaluate(`(()=>{const prefs=JSON.parse(localStorage.getItem('lens-ui-prefs-v13')||'{}');prefs.theme=${JSON.stringify(theme)};for(const key of Object.keys(prefs))if(key.startsWith('custom'))prefs[key]='';for(const style of Object.values(prefs.componentStyles||{})){style.background='';style.text='';style.border='';style.opacity=1;}for(const gradient of Object.values(prefs.layerGradients||{}))gradient.enabled=false;window.dispatchEvent(new StorageEvent('storage',{key:'lens-ui-prefs-v13',newValue:JSON.stringify(prefs)}));})()`);
  await waitFor(viewer,`document.documentElement.dataset.theme===${JSON.stringify(theme)}`,'theme fixture applied without page refresh');
  await pause(250);
}
async function touchTab(viewer,label){
  const point=await viewer.evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.trendLineWorkspace [role="tab"]')).find(tab=>tab.textContent.trim()===${JSON.stringify(label)});button.scrollIntoView({block:'nearest'});const rect=button.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`);
  await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:4,radiusY:4}]});
  await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await waitFor(viewer,`document.querySelector('.trendLineWorkspace [aria-selected="true"]').textContent.trim()===${JSON.stringify(label)}`,'touch selects graph tab');
  // The new measured analytics resize their SVGs after the selected view has
  // committed. Validate the settled view, rather than its first fallback frame.
  await pause(140);
}
async function chartSafety(viewer,label){
  const safety=await viewer.evaluate(`(()=>{const root=document.querySelector('.trendLineWorkspace');const box=root.getBoundingClientRect();const panel=root.closest('.inspectionLogPanel,.referenceBottomPanel')?.getBoundingClientRect();const tabs=Array.from(root.querySelectorAll('[role="tab"]'));const svg=root.querySelector('svg[role="img"]');return {nan:/NaN|Infinity|undefined/.test(root.innerHTML),pageOverflow:document.documentElement.scrollWidth>innerWidth+1,workspaceOverflow:root.scrollWidth>root.clientWidth+1,insidePanel:!panel||(box.left>=panel.left-1&&box.right<=panel.right+1&&box.bottom<=panel.bottom+1),selected:tabs.filter(tab=>tab.getAttribute('aria-selected')==='true').length,chartLabel:svg?.getAttribute('aria-label'),chartHeight:svg?.getBoundingClientRect().height};})()`);
  assert(!safety.nan,`${label}: no NaN/Infinity/undefined chart attributes`);
  assert(!safety.pageOverflow,`${label}: no page horizontal overflow`);
  if(safety.workspaceOverflow){
    const diagnostic=await viewer.evaluate(`(()=>{const root=document.querySelector('.trendLineWorkspace');return {width:root.clientWidth,scrollWidth:root.scrollWidth,children:Array.from(root.children).map(child=>({name:child.className,width:child.clientWidth,scrollWidth:child.scrollWidth,left:child.getBoundingClientRect().left,right:child.getBoundingClientRect().right})),tabs:Array.from(root.querySelectorAll('[role="tab"]')).map(tab=>({text:tab.textContent,width:tab.clientWidth,scrollWidth:tab.scrollWidth}))};})()`);
    await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-overflow-qa.png`);
    assert.fail(`${label}: workspace horizontal overflow ${JSON.stringify(diagnostic)}`);
  }
  assert(safety.insidePanel,`${label}: chart contained within existing resizable panel`);
  if(safety.chartHeight<30){
    const diagnostic=await viewer.evaluate(`(()=>{const root=document.querySelector('.trendLineWorkspace');const parent=root.closest('.inspectionLogPanel,.referenceBottomPanel');return {root:root.getBoundingClientRect().toJSON(),parent:parent?.getBoundingClientRect().toJSON(),parentStyle:parent?{display:getComputedStyle(parent).display,flex:getComputedStyle(parent).flex}:null,ancestors:Array.from((function*(element){for(let index=0;element&&index<4;index++,element=element.parentElement)yield element})(root.parentElement)).map(element=>({name:element.className,height:element.clientHeight,display:getComputedStyle(element).display})),children:Array.from(root.children).map(child=>({name:child.className,height:child.clientHeight,scrollHeight:child.scrollHeight}))};})()`);
    await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-collapsed-qa.png`);
    assert.fail(`${label}: chart collapsed (${safety.chartHeight}px) ${JSON.stringify(diagnostic)}`);
  }
  assert.equal(safety.selected,1,`${label}: exactly one accessible selected graph tab`);
}

// Accuracy assertions use the exact measured fixture source, not UI text
// scraping or assumed NOK=one-defect arithmetic. A repeated class can affect
// one lens while contributing several actual defect occurrences.
function analyticsTotals(source) {
  const latest=new Map();
  for(const inspection of source){
    const key=JSON.stringify([inspection.dataset_id,inspection.sample_id]);
    const previous=latest.get(key);
    if(!previous||Date.parse(inspection.created_at)>=Date.parse(previous.created_at))latest.set(key,inspection);
  }
  const excludedNames=new Set(['nolens','lensnotfound','nolensfound','missinglens','klnichtgefunden','klnotfound','notestjob','noinspectiontask','notestparameters','noverificationtask']);
  const classes=new Map(),eligible=[],excluded=[];
  let occurrences=0,affected=0;
  for(const inspection of latest.values()){
    (inspection.defects.some(defect=>excludedNames.has(defect.name.toLowerCase().replace(/[^a-z]/g,'')))?excluded:eligible).push(inspection);
    const seen=new Set();
    for(const defect of inspection.defects){
      const key=defect.name.trim().replace(/\s+/g,' ').toLowerCase();if(!key)continue;
      const entry=classes.get(key)||{key,lenses:0,occurrences:0};
      entry.occurrences+=1;occurrences+=1;
      if(!seen.has(key)){entry.lenses+=1;seen.add(key)}
      classes.set(key,entry);
    }
    if(seen.size)affected+=1;
  }
  return {total:latest.size,eligible:eligible.length,excluded:excluded.length,
    yield:eligible.length?eligible.filter(inspection=>inspection.status==='OK').length/eligible.length*100:null,
    occurrences,affected,classes:[...classes.values()].sort((a,b)=>a.key.localeCompare(b.key))};
}

async function qualityAccuracy(viewer,expected,label){
  await select(viewer,'Yield');
  await waitFor(viewer,`!!document.querySelector('.yieldQualityAnalysis')`,`${label}: enhanced Yield view`);
  await waitFor(viewer,`(()=>{const root=document.querySelector('.yieldQualityAnalysis');return Number(root.getAttribute('data-total'))===${expected.total}&&Number(root.getAttribute('data-occurrences'))===${expected.occurrences};})()`,`${label}: latest measured quality snapshot`);
  const actual=await viewer.evaluate(`(()=>{const root=document.querySelector('.yieldQualityAnalysis');return Object.fromEntries(['total','eligible','excluded','occurrences','affected','yield'].map(key=>[key,root.getAttribute('data-'+key)]));})()`);
  for(const key of ['total','eligible','excluded','occurrences','affected'])assert.equal(Number(actual[key]),expected[key],`${label}: Yield ${key} uses measured results`);
  if(expected.yield===null)assert.equal(actual.yield,'',`${label}: unmeasured yield is empty, never fabricated zero`);
  else assert(Math.abs(Number(actual.yield)-expected.yield)<.001,`${label}: yield denominator excludes reported no-lens/no-job results`);
  const classes=await viewer.evaluate(`Array.from(document.querySelectorAll('.yieldClassImpact [data-quality-class]')).map(item=>({key:item.getAttribute('data-quality-class'),lenses:Number(item.getAttribute('data-lenses')),occurrences:Number(item.getAttribute('data-occurrences'))})).sort((a,b)=>a.key.localeCompare(b.key))`);
  assert.deepEqual(classes,expected.classes,`${label}: class impact separates affected lenses from actual occurrences`);
  const points=await viewer.evaluate(`Array.from(document.querySelectorAll('.yieldQualityAnalysis [data-quality-time]')).map(point=>({time:Number(point.getAttribute('data-quality-time')),yield:Number(point.getAttribute('data-quality-yield'))}))`);
  assert(points.every(point=>Number.isFinite(point.time)&&Number.isFinite(point.yield)&&point.yield>=0&&point.yield<=100),`${label}: timeline contains valid measured yield values`);
  assert(points.length<=expected.eligible,`${label}: empty intervals are not fabricated as yield measurements`);
  if(!expected.eligible)assert.equal(points.length,0,`${label}: no yield dots when every lens is excluded`);
}

async function defectAccuracy(viewer,expected,label){
  await select(viewer,'Defects');
  await waitFor(viewer,`!!document.querySelector('.defectAnalysis')`,`${label}: enhanced Defects view`);
  await waitFor(viewer,`(()=>{const root=document.querySelector('.defectAnalysis');return Number(root.getAttribute('data-total'))===${expected.total}&&Number(root.getAttribute('data-occurrences'))===${expected.occurrences};})()`,`${label}: latest measured defect snapshot`);
  const actual=await viewer.evaluate(`(()=>{const root=document.querySelector('.defectAnalysis');return Object.fromEntries(['total','occurrences','affected','classes'].map(key=>[key,Number(root.getAttribute('data-'+key))]));})()`);
  for(const key of ['total','occurrences','affected'])assert.equal(actual[key],expected[key],`${label}: Defects ${key} uses measured results`);
  assert.equal(actual.classes,expected.classes.length,`${label}: every observed class is available`);
  const classes=await viewer.evaluate(`Array.from(document.querySelectorAll('.defectClassButton')).map(item=>({key:item.getAttribute('data-class-key'),lenses:Number(item.getAttribute('data-lenses')),occurrences:Number(item.getAttribute('data-occurrences'))})).sort((a,b)=>a.key.localeCompare(b.key))`);
  assert.deepEqual(classes,expected.classes,`${label}: defect class totals are accurate and not truncated`);
  const shares=await viewer.evaluate(`Array.from(document.querySelectorAll('.defectClassButton')).map(item=>Number(item.getAttribute('data-share')))`);
  assert(Math.abs(shares.reduce((sum,value)=>sum+value,0)-(expected.occurrences?100:0))<.001,`${label}: occurrence shares sum to 100%, not lens coverage`);
}

async function defectCounting(viewer,expected){
  for(const [name,metric] of [['Affected lenses','lenses'],['Occurrences','occurrences']]){
    await viewer.evaluate(`Array.from(document.querySelectorAll('[aria-label="Defect counting method"] button')).find(button=>button.textContent.trim()===${JSON.stringify(name)}).click()`);
    await waitFor(viewer,`document.querySelector('.defectAnalysis').getAttribute('data-metric')===${JSON.stringify(metric)}`,'defect counting method updates immediately');
    const bars=await viewer.evaluate(`Array.from(document.querySelectorAll('.defectAnalysis svg [data-defect-class]')).map(item=>({key:item.getAttribute('data-defect-class'),count:Number(item.getAttribute('data-count'))})).sort((a,b)=>a.key.localeCompare(b.key))`);
    assert.deepEqual(bars,expected.classes.map(item=>({key:item.key,count:item[metric]})),`Defect ${name} bars use the selected real metric`);
  }
  if(expected.classes.length){
    await viewer.evaluate(`document.querySelector('.defectClassButton').click()`);
    assert(await viewer.evaluate(`document.querySelector('.defectClassButton[aria-pressed="true"]')!==null`),'A class tap selects its detailed outcome information');
  }
}

async function analyticsFit(viewer,label){
  const safety=await viewer.evaluate(`(()=>{const root=document.querySelector('.yieldQualityAnalysis,.defectQualityAnalysis,.defectAnalysisView,.defectAnalysis');if(!root)return {found:false};const box=root.getBoundingClientRect(),plot=root.closest('.trendPlot').getBoundingClientRect();return {found:true,height:box.height,plotHeight:plot.height,scrollX:root.scrollWidth>root.clientWidth+1,scrollY:root.scrollHeight>root.clientHeight+1,clipped:box.bottom>plot.bottom+1||box.right>plot.right+1,nan:/NaN|Infinity|undefined/.test(root.innerHTML)};})()`);
  assert(safety.found,`${label}: rich analytics component is mounted`);
  assert(!safety.nan,`${label}: no invalid measured graph attributes`);
  assert(!safety.scrollX&&!safety.scrollY,`${label}: analytics fits without a scrollbar ${JSON.stringify(safety)}`);
  assert(!safety.clipped,`${label}: analytics contained in selected panel ${JSON.stringify(safety)}`);
  const classes=await viewer.evaluate(`Array.from(document.querySelectorAll('.yieldClassImpact button,.defectClassButton')).filter(button=>button.getClientRects().length).map(button=>{const box=button.getBoundingClientRect(),parent=button.parentElement.getBoundingClientRect();return {name:button.getAttribute('aria-label'),width:box.width,height:box.height,outside:box.top<parent.top-1||box.bottom>parent.bottom+1||box.left<parent.left-1||box.right>parent.right+1};})`);
  assert(classes.every(item=>!item.outside&&item.height>=12&&item.width>=28),`${label}: visible class entries fit their grid with readable hit areas ${JSON.stringify(classes.filter(item=>item.outside||item.height<12||item.width<28))}`);
}

// The 3D comparison counts every named instance on its actual tray. Neither
// NOK status nor the four copies in per-channel output create extra columns.
function trayDefectTotals(source){
  const latest=new Map();
  for(const inspection of source){
    const key=JSON.stringify([inspection.dataset_id,inspection.sample_id]);
    const previous=latest.get(key);
    if(!previous||Date.parse(inspection.created_at)>=Date.parse(previous.created_at))latest.set(key,inspection);
  }
  const trays=new Map(),classes=new Map();
  for(const inspection of latest.values()){
    const key=JSON.stringify([inspection.dataset_id,inspection.wt_index]);
    const tray=trays.get(key)||{key,total:0,classes:new Map()};
    tray.total+=1;
    for(const defect of inspection.defects){
      const name=defect.name.trim().replace(/\s+/g,' '),classKey=name.toLocaleLowerCase('en-US');
      if(!classKey)continue;
      tray.classes.set(classKey,(tray.classes.get(classKey)||0)+1);
      classes.set(classKey,(classes.get(classKey)||0)+1);
    }
    trays.set(key,tray);
  }
  const bars=[...trays.values()].flatMap(tray=>[...tray.classes].map(([classKey,count])=>({tray:tray.key,key:classKey,count})))
    .sort((a,b)=>a.tray.localeCompare(b.tray)||a.key.localeCompare(b.key));
  return {trays:[...trays.values()].map(({key,total})=>({key,total})).sort((a,b)=>a.key.localeCompare(b.key)),
    bars,classes:[...classes].map(([key,count])=>({key,count})).sort((a,b)=>a.key.localeCompare(b.key)),
    occurrences:bars.reduce((sum,bar)=>sum+bar.count,0)};
}

async function trayAccuracy(viewer,source,label){
  const expected=trayDefectTotals(source);
  await select(viewer,'3D Trays');
  await waitFor(viewer,`!!document.querySelector('.trayDefectChart')`,`${label}: grouped 3D tray view`);
  await waitFor(viewer,`Number(document.querySelector('.trayDefectChart').getAttribute('data-total-defects'))===${expected.occurrences}`,`${label}: latest tray occurrence counts`);
  const trays=await viewer.evaluate(`Array.from(document.querySelectorAll('.trayDefectChart [data-trend-tray]')).map(item=>({key:item.getAttribute('data-trend-tray'),total:Number(item.getAttribute('data-total'))})).sort((a,b)=>a.key.localeCompare(b.key))`);
  assert.deepEqual(trays,expected.trays,`${label}: complete and partial trays retain measured inspection totals`);
  const bars=await viewer.evaluate(`Array.from(document.querySelectorAll('.trayDefectChart [data-tray-key][data-defect-class]')).map(item=>({tray:item.getAttribute('data-tray-key'),key:item.getAttribute('data-defect-class'),count:Number(item.getAttribute('data-count'))})).filter(item=>item.count>0).sort((a,b)=>a.tray.localeCompare(b.tray)||a.key.localeCompare(b.key))`);
  assert.deepEqual(bars,expected.bars,`${label}: one 3D column per tray/class counts actual reported instances`);
  const classes=await viewer.evaluate(`Array.from(document.querySelectorAll('.trayDefectChart button[data-class-key]')).map(item=>({key:item.getAttribute('data-class-key'),count:Number(item.getAttribute('data-count'))})).sort((a,b)=>a.key.localeCompare(b.key))`);
  assert.deepEqual(classes,expected.classes,`${label}: every observed class is named in the side legend`);
  assert.equal(await viewer.evaluate(`document.querySelector('.trayDefectChart svg[role="img"]').getAttribute('aria-label')`),'3D tray defect comparison',`${label}: accessible chart explains its actual dimensions`);
  assert.equal(await viewer.evaluate(`Number(document.querySelector('.trayDefectChart').getAttribute('data-displayed-defects'))`),expected.occurrences,`${label}: displayed total agrees with bar counts`);
  return expected;
}

async function trayFit(viewer,label){
  const safety=await viewer.evaluate(`(()=>{const root=document.querySelector('.trayDefectChart');if(!root)return {found:false};const rect=root.getBoundingClientRect(),parent=root.closest('.trendPlot').getBoundingClientRect();const classes=Array.from(root.querySelectorAll('button[data-class-key]')).filter(item=>item.getClientRects().length).map(item=>{const box=item.getBoundingClientRect(),grid=item.parentElement.getBoundingClientRect(),code=item.querySelector('.trayDefectClassCode');return {key:item.getAttribute('data-class-key'),height:box.height,width:box.width,truncated:!!code?.getClientRects().length&&code.scrollWidth>code.clientWidth+1,outside:box.top<grid.top-1||box.bottom>grid.bottom+1||box.left<grid.left-1||box.right>grid.right+1}});const svg=root.querySelector('svg').getBoundingClientRect(),labels=Array.from(root.querySelectorAll('.trayClassFloorLabel text')).map(item=>({name:item.textContent,box:item.getBoundingClientRect()})),overlaps=[];for(let index=0;index<labels.length;index++)for(const other of labels.slice(index+1)){const first=labels[index].box,second=other.box;if(Math.min(first.right,second.right)-Math.max(first.left,second.left)>1&&Math.min(first.bottom,second.bottom)-Math.max(first.top,second.top)>1)overlaps.push({first:labels[index].name,firstBox:first.toJSON(),second:other.name,secondBox:second.toJSON()});}return {found:true,nan:/NaN|Infinity|undefined/.test(root.innerHTML),scrollX:root.scrollWidth>root.clientWidth+1,scrollY:root.scrollHeight>root.clientHeight+1,clipped:rect.bottom>parent.bottom+1||rect.right>parent.right+1,classes,floorLabelOverlaps:overlaps,floorLabelsClipped:labels.filter(item=>item.box.left<svg.left-1||item.box.right>svg.right+1||item.box.top<svg.top-1||item.box.bottom>svg.bottom+1).map(item=>item.name)};})()`);
  assert(safety.found&&!safety.nan,`${label}: measured 3D component has valid geometry`);
  assert(!safety.scrollX&&!safety.scrollY&&!safety.clipped,`${label}: 3D chart fits without a scrollbar ${JSON.stringify(safety)}`);
  assert(safety.classes.every(item=>!item.outside&&item.height>=12&&item.width>=28),`${label}: every visible class legend fits its grid ${JSON.stringify(safety.classes.filter(item=>item.outside||item.height<12||item.width<28))}`);
  if(safety.floorLabelOverlaps.length||safety.floorLabelsClipped.length||safety.classes.some(item=>item.truncated))await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-3d-label-diagnostic-qa.png`);
  assert.deepEqual(safety.floorLabelOverlaps,[],`${label}: geometric floor initials never overlap ${JSON.stringify(safety.floorLabelOverlaps)}`);
  assert.deepEqual(safety.floorLabelsClipped,[],`${label}: geometric class labels remain inside the SVG`);
  if(await viewer.evaluate(`!!document.querySelector('.trendExplorerWindow')`))assert(safety.classes.every(item=>!item.truncated),`${label}: expanded legend keeps collision-free class initials fully readable ${JSON.stringify(safety.classes.filter(item=>item.truncated))}`);
}

async function traySelection(viewer,label){
  const bar=await viewer.evaluate(`(()=>{const bar=document.querySelector('.trayDefectChart [data-tray-key][data-defect-class][data-count]:not([data-count="0"])');if(!bar)return null;bar.focus();return {tray:bar.getAttribute('data-tray-key'),key:bar.getAttribute('data-defect-class'),count:Number(bar.getAttribute('data-count'))};})()`);
  if(!bar)return;
  await viewer.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await viewer.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await waitFor(viewer,`(()=>{const readout=document.querySelector('.trayDefectReadout');return readout?.getAttribute('data-selected-class')===${JSON.stringify(bar.key)}&&readout.getAttribute('data-selected-tray')===${JSON.stringify(bar.tray)}})()`,`${label}: keyboard reveals selected tray/class details`);
  assert(await viewer.evaluate(`document.querySelector('.trayDefectReadout').textContent.includes(${JSON.stringify(String(bar.count))})`),`${label}: selection exposes the actual defect occurrence count`);
}

async function trayFiltering(viewer,label){
  const selected=await viewer.evaluate(`(()=>{const button=document.querySelector('.trayDefectChart button[data-class-key]');if(!button)return null;const key=button.getAttribute('data-class-key'),count=Number(button.getAttribute('data-count'));button.click();return {key,count};})()`);
  if(!selected)return;
  await waitFor(viewer,`Array.from(document.querySelectorAll('.trayDefectChart button[data-class-key]')).find(button=>button.getAttribute('data-class-key')===${JSON.stringify(selected.key)})?.getAttribute('aria-pressed')==='false'`,`${label}: class tap hides its columns`);
  assert.equal(await viewer.evaluate(`Array.from(document.querySelectorAll('.trayDefectChart [data-tray-key][data-defect-class]')).filter(bar=>bar.getAttribute('data-defect-class')===${JSON.stringify(selected.key)}).length`),0,`${label}: hidden class is removed from plotted columns`);
  assert.equal(await viewer.evaluate(`Number(document.querySelector('.trayDefectChart').getAttribute('data-visible-defects'))`),await viewer.evaluate(`Number(document.querySelector('.trayDefectChart').getAttribute('data-displayed-defects'))`)-selected.count,`${label}: visible subtotal explains the class filter`);
  await viewer.evaluate(`Array.from(document.querySelectorAll('.trayDefectChart button[data-class-key]')).find(button=>button.getAttribute('data-class-key')===${JSON.stringify(selected.key)}).click()`);
  await waitFor(viewer,`Number(document.querySelector('.trayDefectChart').getAttribute('data-visible-defects'))===Number(document.querySelector('.trayDefectChart').getAttribute('data-displayed-defects'))`,`${label}: class restored without data loss`);
}

async function cumulativeAccuracy(viewer,source,label){
  await select(viewer,'Live');
  const expected=analyticsTotals(source);
  await waitFor(viewer,`document.querySelector('.classicDefectTrend')?.getAttribute('data-count-mode')==='cumulative'`,`${label}: cumulative defect lines in both layouts`);
  await waitFor(viewer,`Number(document.querySelector('.classicDefectTrend').getAttribute('data-count'))===${expected.occurrences}`,`${label}: retained overall defect count`);
  const classes=await viewer.evaluate(`Array.from(document.querySelectorAll('.liveDefectLegendItem')).map(item=>({key:item.getAttribute('data-defect-key'),count:Number(item.getAttribute('data-class-total')),window:Number(item.getAttribute('data-window-total'))})).sort((a,b)=>a.key.localeCompare(b.key))`);
  assert.deepEqual(classes.map(({key,count})=>({key,count})),expected.classes.map(({key,occurrences})=>({key,count:occurrences})),`${label}: rolling display retains each class's complete running total`);
  const series=await viewer.evaluate(`Array.from(document.querySelectorAll('.classicDefectTrend [data-defect-series]')).map(path=>{const key=path.getAttribute('data-defect-series');const points=Array.from(document.querySelectorAll('.classicDefectTrend [data-defect-point]')).filter(point=>point.getAttribute('data-defect-point')===key).map(point=>({time:Number(point.getAttribute('data-time')),interval:Number(point.getAttribute('data-count')),cumulative:Number(point.getAttribute('data-cumulative-count')),y:Number(point.getAttribute('cy'))})).sort((a,b)=>a.time-b.time);return {key,total:Number(path.getAttribute('data-overall-count')),mode:path.getAttribute('data-count-mode'),lastY:Number(path.getAttribute('data-latest-y')),path:path.getAttribute('d'),points};}).sort((a,b)=>a.key.localeCompare(b.key))`);
  assert.deepEqual(series.map(({key,total})=>({key,count:total})),expected.classes.map(({key,occurrences})=>({key,count:occurrences})),`${label}: classes with no recent detection still have a retained line`);
  for(const line of series){
    assert.equal(line.mode,'cumulative',`${label}: ${line.key} plots cumulative values`);
    assert(!/NaN|Infinity|undefined/.test(line.path)&&Number.isFinite(line.lastY),`${label}: ${line.key} has a valid held baseline`);
    assert(line.points.every((point,index)=>point.cumulative>=point.interval&&(!index||point.cumulative>=line.points[index-1].cumulative&&point.y<=line.points[index-1].y+.01)),`${label}: ${line.key} never drops to zero between detections`);
    if(line.points.length){
      const last=line.points.at(-1);
      assert.equal(last.cumulative,line.total,`${label}: ${line.key} latest measured point reaches its running total`);
      assert(Math.abs(last.y-line.lastY)<.01,`${label}: ${line.key} tail holds its last cumulative level`);
    }
  }
  return classes;
}

(async()=>{
  chrome=spawn(process.env.CHROME_BINARY||'/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',env:{...process.env,TMPDIR:temporaryRoot,TMP:temporaryRoot,TEMP:temporaryRoot}});
  let version;for(let i=0;i<100;i++){try{version=await fetch(`http://127.0.0.1:${port}/json/version`).then(response=>response.json());break;}catch{await pause(100);}}
  assert(version,'Chrome started');browser=connect(version.webSocketDebuggerUrl);await browser.ready;
  const classic=await makeViewer(true),modern=await makeViewer(false);
  const labels=['Live','Yield','Defects','3D Trays','Timing'];
  for(const viewer of [classic,modern]){
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='5'`,'partial-tray data is visible without waiting for16');
    const clock=await viewer.evaluate(`document.querySelector('.trendLiveClock time,time.trendLiveClock,.trendLiveClock[datetime]')?.getAttribute('datetime')`);
    assert(clock,'Live clock has machine-readable time');await pause(1150);
    assert.notEqual(await viewer.evaluate(`document.querySelector('.trendLiveClock time,time.trendLiveClock,.trendLiveClock[datetime]')?.getAttribute('datetime')`),clock,'Live clock advances without data refresh');
    const initialAnalytics=analyticsTotals(snapshot.results);
    await cumulativeAccuracy(viewer,snapshot.results,`${viewer.classic?'Classic':'Modern'} retained running totals`);
    await qualityAccuracy(viewer,initialAnalytics,`${viewer.classic?'Classic':'Modern'} all retained results`);
    await defectAccuracy(viewer,initialAnalytics,`${viewer.classic?'Classic':'Modern'} all retained results`);
    await defectCounting(viewer,initialAnalytics);
    const skipTablet=process.env.TREND_QA_SKIP_TABLET==='1'||viewer.classic&&process.env.TREND_QA_SKIP_CLASSIC_TABLET==='1';
    const dimensionsToCheck=skipTablet?[[1920,1080],[1366,768]]:[[1920,1080],[1366,768],[1024,768]];
    for(const dimensions of dimensionsToCheck){
      await resize(viewer,...dimensions);
      for(const label of labels){await select(viewer,label);await chartSafety(viewer,`${viewer.classic?'Classic':'Modern'} ${dimensions} ${label}`);if(label==='Yield'||label==='Defects')await analyticsFit(viewer,`${viewer.classic?'Classic':'Modern'} ${dimensions} ${label}`);if(label==='3D Trays')await trayFit(viewer,`${viewer.classic?'Classic':'Modern'} ${dimensions} ${label}`);}
      if(dimensions[0]===1024){await viewer.evaluate(`document.querySelector('.trendLineWorkspace').scrollIntoView({block:'nearest'})`);await pause(150);await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-1024-qa.png`);}
    }
    await range(viewer,'5m');
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='3'`,'5m rolling range excludes two older fixture frames');
    const recentAnalytics=analyticsTotals(snapshot.results.filter(inspection=>Date.parse(inspection.created_at)>=Date.now()-300000));
    const retainedClasses=await cumulativeAccuracy(viewer,snapshot.results,`${viewer.classic?'Classic':'Modern'} five-minute cumulative baseline`);
    assert(retainedClasses.some(item=>item.key==='noncircular'&&item.count===1&&item.window===0),'Older class remains at its running total when no detections exist in the visible period');
    await qualityAccuracy(viewer,recentAnalytics,`${viewer.classic?'Classic':'Modern'} selected five-minute period`);
    await defectAccuracy(viewer,recentAnalytics,`${viewer.classic?'Classic':'Modern'} selected five-minute period`);
    await range(viewer,'all');await trayAccuracy(viewer,snapshot.results,`${viewer.classic?'Classic':'Modern'} partial tray`);
    const trays=await viewer.evaluate(`Array.from(document.querySelectorAll('.trendLineWorkspace [data-trend-tray]')).map(bar=>Number(bar.getAttribute('data-total')))`);
    assert.deepEqual(trays,[5],'3D chart represents measured partial-tray totals, not dummy bars');
    assert(await viewer.evaluate(`document.querySelector('.trendLineWorkspace [data-trend-tray]').getAttribute('aria-label').startsWith('WT 2,')`),'Trend tray label matches globally numbered WT History, not dataset-local WT1');
    assert.deepEqual(await viewer.evaluate(`Array.from(document.querySelectorAll('.trayDefectChart [data-tray-key][data-defect-class]')).map(bar=>[bar.getAttribute('data-defect-class'),bar.getAttribute('data-color')]).sort((a,b)=>a[0].localeCompare(b[0]))`),[['noncircular','#25c0d7'],['surface imperfection','#a86af5']],'3D columns use configured defect class colors, not generic status stacks');
    await traySelection(viewer,`${viewer.classic?'Classic':'Modern'} tray columns`);
    await trayFiltering(viewer,`${viewer.classic?'Classic':'Modern'} tray legend filtering`);
    await viewer.evaluate(`(()=>{const input=document.querySelector('[aria-label="3D chart rotation"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'60');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await waitFor(viewer,`document.querySelector('.trendRotation output').textContent==='60°'`,'rotation slider updates 3D perspective');
    await viewer.evaluate(`document.querySelector('.trendViewTabs [aria-selected="true"]').focus()`);
    await viewer.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await viewer.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-view')==='timing'`,'arrow-key navigation selects Timing');
    assert.equal(await viewer.evaluate(`document.activeElement.getAttribute('role')==='tab'&&document.activeElement.getAttribute('aria-selected')`),'true','Keyboard navigation retains focus on selected graph tab');
    await select(viewer,'3D Trays');
    await viewer.evaluate(`document.querySelector('.trendLineWorkspace [aria-label="Expand Trend Line"]').click()`);
    await waitFor(viewer,'!!document.querySelector(".trendExplorerWindow")','expanded graph explorer');
    await pause(220); // Let the optional 180ms entrance transition finish.
    assert(await viewer.evaluate(`(()=>{const rect=document.querySelector('.trendExplorerWindow').getBoundingClientRect();return rect.left>=0&&rect.top>=0&&rect.right<=innerWidth+1&&rect.bottom<=innerHeight+1;})()`),'Expanded explorer fits viewport');
    for(const label of ['Yield','Defects']){
      await select(viewer,label);await chartSafety(viewer,`${viewer.classic?'Classic':'Modern'} expanded ${label}`);await analyticsFit(viewer,`${viewer.classic?'Classic':'Modern'} expanded ${label}`);
      await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-${label.toLowerCase()}-expanded-qa.png`);
    }
    await select(viewer,'3D Trays');await trayFit(viewer,`${viewer.classic?'Classic':'Modern'} expanded 3D Trays`);
    await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-3d-expanded-qa.png`);
    await viewer.evaluate(`document.querySelector('[aria-label="Close Trend Line"]').click()`);
    await waitFor(viewer,'!document.querySelector(".trendExplorerWindow")','explorer dismisses to same page');
    await select(viewer,'Timing');
    for(const dimensions of [[1920,1080],[1366,768]]){
      await resize(viewer,...dimensions);await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-${dimensions[0]}-qa.png`);
    }
    reports.push({mode:viewer.classic?'Classic':'Modern',responsiveSizes:dimensionsToCheck,cases:'live clock, cumulative defect lines with retained five-minute baseline, 5 graph tabs, keyboard navigation, time range, partial-tray per-class 3D counts/colors/filter/rotation, expanded explorer'});
  }
  fixtureLegend={...fixtureLegend,defects:fixtureLegend.defects.map(defect=>defect.key==='surface'?{...defect,color:'#d35bf7'}:defect)};
  for(const viewer of [classic,modern]){
    await viewer.evaluate(`window.dispatchEvent(new Event('lens-status-legend-changed'))`);
    await select(viewer,'3D Trays');
    await waitFor(viewer,`document.querySelector('.trayDefectChart [data-defect-class="surface imperfection"]')?.getAttribute('data-color')==='#d35bf7'`,'defect legend color change applies immediately to 3D columns');
    await select(viewer,'Timing');
  }
  const increment=result(6,'NOK',Date.now());
  increment.defects=['Surface Imperfection','Surface Imperfection','NonCircular'].map(name=>({name,confidence:1,severity:'major',channel:'h'}));
  increment.channels=increment.channels.map(channel=>({...channel,defects:channel.channel==='h'?increment.defects:[]}));
  snapshot={...snapshot,sequence:2,job:{...snapshot.job,completed:6,current_sample_id:'trend-7',summary:{OK:2,NOK:3,WARN:1}},results:[...snapshot.results,increment]};
  const update={type:'result',stream_id:snapshot.stream_id,sequence:2,current_job_id:snapshot.current_job_id,job:snapshot.job,result:snapshot.results.at(-1)};
  for(const viewer of [classic,modern]){
    await viewer.evaluate(`window.__trendBroadcast(${JSON.stringify(update)})`);
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='6'`,'live incremental result updates chart');
    assert.equal(await viewer.evaluate(`document.querySelector('.trendLineWorkspace').getAttribute('data-view')`),'timing','Streaming results retain the selected graph tab');
    await trayAccuracy(viewer,snapshot.results,`${viewer.classic?'Classic':'Modern'} repeated-instance incremental frame`);
    assert.deepEqual(await viewer.evaluate(`Array.from(document.querySelectorAll('.trendLineWorkspace [data-trend-tray]')).map(bar=>Number(bar.getAttribute('data-total')))`),[6],'3D counts update on every frame');
    await cumulativeAccuracy(viewer,snapshot.results,`${viewer.classic?'Classic':'Modern'} live cumulative increments`);await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-qa.png`);
  }
  snapshot={...snapshot,sequence:3,job:{...snapshot.job,completed:18,current_sample_id:'trend-19'},results:Array.from({length:18},(_,i)=>result(i+1))};
  for(const viewer of [classic,modern]){
    await viewer.evaluate(`window.__trendBroadcast(${JSON.stringify(snapshot)})`);
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='18'`,'multiple measured trays');
    await trayAccuracy(viewer,snapshot.results,`${viewer.classic?'Classic':'Modern'} multiple trays`);
    assert.deepEqual(await viewer.evaluate(`Array.from(document.querySelectorAll('.trendLineWorkspace [data-trend-tray]')).map(bar=>Number(bar.getAttribute('data-total')))`),[16,2],'3D chart supports complete and partial trays simultaneously');
    assert.deepEqual(await viewer.evaluate(`Array.from(document.querySelectorAll('.trendLineWorkspace [data-trend-tray]')).map(bar=>bar.getAttribute('aria-label').split(',')[0])`),['WT 2','WT 3'],'Multiple tray labels remain aligned with global history numbering');
    await select(viewer,'Timing');
    await viewer.evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(viewer.classic?'Trend statistics':'Yield Trend')}).click()`);
    await waitFor(viewer,`!document.querySelector('.trendLineWorkspace')`,'existing trend tab remains available');
    await viewer.evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Trend Line').click()`);
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace')?.getAttribute('data-view')==='timing'`,'graph choice restored when reopening Trend Line');
  }
  reports.push({cases:'Repeated-class incremental frame increases each cumulative series; 18 live results compare complete/partial tray/class columns and preserve graph choice across existing trend tabs'});
  for(const viewer of [classic,modern]){
    await appearance(viewer,'premium-white');
    for(const dimensions of [[1920,1080],[1366,768],[1024,768]]){
      await resize(viewer,...dimensions);
      for(const label of labels){await select(viewer,label);await chartSafety(viewer,`${viewer.classic?'Classic':'Modern'} White ${dimensions} ${label}`);if(label==='Yield'||label==='Defects')await analyticsFit(viewer,`${viewer.classic?'Classic':'Modern'} White ${dimensions} ${label}`);if(label==='3D Trays')await trayFit(viewer,`${viewer.classic?'Classic':'Modern'} White ${dimensions} ${label}`);}
      if(dimensions[0]===1024){await viewer.evaluate(`document.querySelector('.trendLineWorkspace').scrollIntoView({block:'nearest'})`);await pause(150);await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-white-1024-qa.png`);}
    }
    const contrast=await viewer.evaluate(`(()=>{const root=document.querySelector('.trendLineWorkspace'),style=getComputedStyle(root);const luminance=color=>{const rgb=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(value=>{value/=255;return value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4)});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);})()`);
    assert(contrast>=4.5,'White trend panel maintains readable primary text contrast');
    await resize(viewer,1920,1080);await select(viewer,'Yield');await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-white-qa.png`);
    await appearance(viewer,'graphite');
    await viewer.cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    assert(await viewer.evaluate(`matchMedia('(pointer:coarse)').matches`),'Touch fixture activates coarse-pointer styles');
    for(const label of labels){await touchTab(viewer,label);await chartSafety(viewer,`${viewer.classic?'Classic':'Modern'} touch ${label}`);if(label==='Yield'||label==='Defects')await analyticsFit(viewer,`${viewer.classic?'Classic':'Modern'} touch ${label}`);if(label==='3D Trays')await trayFit(viewer,`${viewer.classic?'Classic':'Modern'} touch ${label}`);}
    const touchSizes=await viewer.evaluate(`Array.from(document.querySelectorAll('.trendLineWorkspace [role="tab"]')).map(button=>button.getBoundingClientRect().height)`);
    assert(touchSizes.every(height=>height>=40),'Touch graph tabs have at least40px targets');
    await touchTab(viewer,'Live');
    const chartPoint=await viewer.evaluate(`(()=>{const rect=document.querySelector('.trendPlot svg[role="img"]').getBoundingClientRect();return {x:rect.left+rect.width*.7,y:rect.top+rect.height*.5};})()`);
    await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...chartPoint,radiusX:4,radiusY:4}]});
    await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await waitFor(viewer,`!!document.querySelector('.trendReadout,.liveDefectReadout')`,'touch tap reveals time-bucket details');
    await pause(250);
    assert(await viewer.evaluate(`!!document.querySelector('.trendReadout,.liveDefectReadout')`),'Touch details stay readable after finger release');
    await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-touch-qa.png`);
    await touchTab(viewer,'3D Trays');
    const trayPoint=await viewer.evaluate(`(()=>{const bar=document.querySelector('.trayDefectChart [data-tray-key][data-defect-class]');if(!bar)return null;const rect=bar.getBoundingClientRect();return {x:rect.left+rect.width*.5,y:rect.top+rect.height*.6,key:bar.getAttribute('data-defect-class'),tray:bar.getAttribute('data-tray-key')};})()`);
    if(trayPoint){
      await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:trayPoint.x,y:trayPoint.y,radiusX:4,radiusY:4}]});
      await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await waitFor(viewer,`!!document.querySelector('.trayDefectReadout[data-selected-tray][data-selected-class]')`,'touch selects a tray/class column');await pause(250);
      assert(await viewer.evaluate(`!!document.querySelector('.trayDefectReadout[data-selected-tray][data-selected-class]')`),'3D tray details remain visible after finger release');
    }
    await viewer.cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    reports.push({mode:viewer.classic?'Classic':'Modern',cases:'Premium White three-size graph matrix, accessible contrast, real touch graph selection and40px targets'});
  }
  const ahead=result(19,'OK',Date.now()+120000);
  snapshot={...snapshot,sequence:4,job:{...snapshot.job,completed:19,current_sample_id:'trend-20'},results:[...snapshot.results,ahead]};
  const aheadUpdate={type:'result',stream_id:snapshot.stream_id,sequence:4,current_job_id:snapshot.current_job_id,job:snapshot.job,result:ahead};
  for(const viewer of [classic,modern]){
    await range(viewer,'5m');await select(viewer,'Live');
    await viewer.evaluate(`window.__trendBroadcast(${JSON.stringify(aheadUpdate)})`);
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='17'`,'ahead-of-browser backend timestamp remains visible in rolling window');
    await range(viewer,'all');
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='19'`,'all measured results include newest backend frame');
  }
  reports.push({cases:'Backend clock two minutes ahead: newest streaming frame remains visible immediately in rolling and all-results windows'});
  const behind=result(20,'OK',Date.now());
  snapshot={...snapshot,sequence:5,job:{...snapshot.job,completed:20,current_sample_id:'trend-21'},results:[...snapshot.results,behind]};
  const behindUpdate={type:'result',stream_id:snapshot.stream_id,sequence:5,current_job_id:snapshot.current_job_id,job:snapshot.job,result:behind};
  for(const viewer of [classic,modern]){
    await viewer.evaluate(`window.__trendRealNow=Date.now;Date.now=()=>window.__trendRealNow()+360000`);
    await range(viewer,'5m');
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='0'`,'historical results do not pull an idle rolling window into the past',5000);
    await cumulativeAccuracy(viewer,snapshot.results.filter(inspection=>inspection.sample_id!=='trend-20'),`${viewer.classic?'Classic':'Modern'} no current intervals`);
    await viewer.evaluate(`window.__trendBroadcast(${JSON.stringify(behindUpdate)})`);
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='18'`,'fresh active frame corrects client clock ahead of backend');
    await viewer.evaluate('Date.now=window.__trendRealNow');
    await range(viewer,'all');
  }
  reports.push({cases:'Client clock six minutes ahead: idle historical window stays expired; fresh live frame corrects skew and restores measured rolling-window results'});
  // Use a dedicated snapshot after legacy clock/range checks so repeated
  // defects and no-lens diagnostics do not change the old tray expectations.
  const savedSnapshot=snapshot;
  fixtureLegend={...fixtureLegend,defects:[
    {key:'bubble',label:'Bubble',match_terms:['Bubble'],color:'#25c0d7',symbol:'B'},
    {key:'surface',label:'Surface Imperfection',match_terms:['Surface Imperfection'],color:'#a86af5',symbol:'S'},
    {key:'no-lens',label:'No Lens',match_terms:['No Lens'],color:'#f4b348',symbol:'L'},
  ]};
  const qualityDefects=[[],['Bubble','Bubble','Surface Imperfection'],['Bubble'],['No Lens'],['Surface Imperfection']];
  const qualityResults=qualityDefects.map((names,index)=>{
    const inspection=result(index+1,['OK','NOK','WARN','NOK','OK'][index],Date.now()-1000*(5-index));
    inspection.defects=names.map(name=>({name,confidence:1,severity:'major',channel:'h'}));
    inspection.channels=inspection.channels.map(channel=>({...channel,defects:channel.channel==='h'?inspection.defects:[]}));
    return inspection;
  });
  snapshot={...snapshot,sequence:snapshot.sequence+1,results:qualityResults,job:{...snapshot.job,completed:5,current_sample_id:'trend-6'}};
  for(const viewer of [classic,modern]){
    await viewer.evaluate(`window.__trendBroadcast(${JSON.stringify(snapshot)})`);
    await viewer.evaluate(`window.dispatchEvent(new Event('lens-status-legend-changed'))`);
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='5'`,'quality diagnostic snapshot replaces current results');
    const expected=analyticsTotals(qualityResults);
    await qualityAccuracy(viewer,expected,`${viewer.classic?'Classic':'Modern'} repeated-class/no-lens fixture`);
    await waitFor(viewer,`document.querySelector('.yieldClassImpact [data-quality-class="bubble"]').style.getPropertyValue('--quality-class-color')==='#25c0d7'`,'Yield class coverage uses centrally configured class colors');
    assert.equal(expected.yield,50,'Fixture demonstrates actual excluded-lens yield denominator');
    const ring=await viewer.evaluate(`Array.from(document.querySelectorAll('.yieldQualityAnalysis [data-quality-status]')).map(item=>[item.getAttribute('data-quality-status'),Number(item.getAttribute('data-count'))]).filter(([,count])=>count>0).sort((a,b)=>a[0].localeCompare(b[0]))`);
    assert.deepEqual(ring,[['NOK',1],['OK',2],['WARN',1]],'Eligible outcome ring agrees with yield and does not count the No Lens NOK');
    await defectAccuracy(viewer,expected,`${viewer.classic?'Classic':'Modern'} repeated-class/no-lens fixture`);
    await waitFor(viewer,`document.querySelector('.defectClassButton[data-class-key="bubble"]').style.getPropertyValue('--defect-class-color')==='#25c0d7'`,'Defects class key uses centrally configured class colors');
    await defectCounting(viewer,expected);
    await viewer.evaluate(`document.querySelector('.trendLineWorkspace [aria-label="Expand Trend Line"]').click()`);
    await waitFor(viewer,'!!document.querySelector(".trendExplorerWindow")','quality explorer expands');await pause(220);
    for(const theme of ['graphite','premium-white']){
      await appearance(viewer,theme);
      for(const dimensions of [[1920,1080],[1366,768],[1024,768],[768,768]]){
        await resize(viewer,...dimensions);
        for(const label of ['Yield','Defects','3D Trays']){
          await select(viewer,label);await chartSafety(viewer,`${viewer.classic?'Classic':'Modern'} expanded ${theme} ${dimensions} ${label}`);if(label==='3D Trays')await trayFit(viewer,`${viewer.classic?'Classic':'Modern'} expanded ${theme} ${dimensions} ${label}`);else await analyticsFit(viewer,`${viewer.classic?'Classic':'Modern'} expanded ${theme} ${dimensions} ${label}`);
          if(dimensions[0]===1366)await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-${label.toLowerCase().replaceAll(' ','-')}-${theme}-expanded-qa.png`);
        }
      }
    }
    await viewer.evaluate(`document.querySelector('[aria-label="Close Trend Line"]').click()`);
    await waitFor(viewer,'!document.querySelector(".trendExplorerWindow")','quality explorer closes');
    await resize(viewer,1920,1080);await appearance(viewer,'graphite');
  }
  // Two trays, repeated occurrences on one lens, a named defect even when
  // status is OK, and a blank detector label all stay separate dimensions.
  const secondTray=result(17,'NOK',Date.now());
  secondTray.defects=['Bubble','Bubble','Surface Imperfection'].map(name=>({name,confidence:1,severity:'major',channel:'h'}));
  secondTray.channels=secondTray.channels.map(channel=>({...channel,defects:channel.channel==='h'?secondTray.defects:[]}));
  const blankLabel=result(18,'NOK',Date.now());
  blankLabel.defects=[{name:'   ',confidence:1,severity:'major',channel:'h'}];
  blankLabel.channels=blankLabel.channels.map(channel=>({...channel,defects:channel.channel==='h'?blankLabel.defects:[]}));
  snapshot={...snapshot,sequence:snapshot.sequence+1,results:[...qualityResults,secondTray,blankLabel],job:{...snapshot.job,completed:7,current_sample_id:'trend-19'}};
  for(const viewer of [classic,modern]){
    await viewer.evaluate(`window.__trendBroadcast(${JSON.stringify(snapshot)})`);
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='7'`,'3D grouped multi-tray fixture');
    await cumulativeAccuracy(viewer,snapshot.results,`${viewer.classic?'Classic':'Modern'} repeated classes across trays`);
    await trayAccuracy(viewer,snapshot.results,`${viewer.classic?'Classic':'Modern'} real tray/class occurrence grid`);
    await traySelection(viewer,`${viewer.classic?'Classic':'Modern'} grouped column selection`);
    await trayFiltering(viewer,`${viewer.classic?'Classic':'Modern'} grouped class filter`);
    assert.deepEqual(await viewer.evaluate(`Array.from(document.querySelectorAll('.trayDefectChart [data-trend-tray]')).map(bar=>bar.getAttribute('aria-label').split(',')[0])`),['WT 2','WT 3'],'Grouped 3D tray labels preserve globally numbered WT History');
    await viewer.evaluate(`document.querySelector('.trendLineWorkspace [aria-label="Expand Trend Line"]').click()`);await waitFor(viewer,'!!document.querySelector(".trendExplorerWindow")','grouped 3D explorer expands');await pause(220);
    for(const theme of ['graphite','premium-white']){
      await appearance(viewer,theme);await resize(viewer,1366,768);await trayFit(viewer,`${viewer.classic?'Classic':'Modern'} ${theme} multi-tray 3D`);
      await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-3d-${theme}-grouped-qa.png`);
    }
    await viewer.evaluate(`document.querySelector('[aria-label="Close Trend Line"]').click()`);await waitFor(viewer,'!document.querySelector(".trendExplorerWindow")','grouped 3D explorer closes');await appearance(viewer,'graphite');
  }
  const manyClasses=result(1,'NOK',Date.now());
  manyClasses.defects=Array.from({length:20},(_,index)=>({name:`HALCON detailed category ${index+1}`,confidence:1,severity:'major',channel:'h'}));
  manyClasses.channels=manyClasses.channels.map(channel=>({...channel,defects:channel.channel==='h'?manyClasses.defects:[]}));
  snapshot={...snapshot,sequence:snapshot.sequence+1,results:[manyClasses],job:{...snapshot.job,completed:1,current_sample_id:'trend-2'}};
  for(const viewer of [classic,modern]){
    await viewer.evaluate(`window.__trendBroadcast(${JSON.stringify(snapshot)})`);
    await waitFor(viewer,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='1'`,'many-class snapshot');
    const expected=analyticsTotals(snapshot.results);
    await qualityAccuracy(viewer,expected,`${viewer.classic?'Classic':'Modern'} all twenty HALCON classes`);
    await defectAccuracy(viewer,expected,`${viewer.classic?'Classic':'Modern'} all twenty HALCON classes`);
    await viewer.evaluate(`document.querySelector('.trendLineWorkspace [aria-label="Expand Trend Line"]').click()`);
    await waitFor(viewer,'!!document.querySelector(".trendExplorerWindow")','many-class explorer expands');await pause(220);
    for(const theme of ['graphite','premium-white'])for(const dimensions of [[1366,768],[768,768]]){
      await appearance(viewer,theme);await resize(viewer,...dimensions);
      for(const label of ['Yield','Defects','3D Trays']){await select(viewer,label);await chartSafety(viewer,`${viewer.classic?'Classic':'Modern'} ${theme} ${dimensions} twenty classes ${label}`);if(label==='3D Trays')await trayFit(viewer,`${viewer.classic?'Classic':'Modern'} ${theme} ${dimensions} twenty classes ${label}`);else await analyticsFit(viewer,`${viewer.classic?'Classic':'Modern'} ${theme} ${dimensions} twenty classes ${label}`);if(dimensions[0]===768)await screenshot(viewer,`trend-line-${viewer.classic?'classic':'modern'}-${label.toLowerCase().replaceAll(' ','-')}-${theme}-twenty-classes-768-qa.png`);}
    }
    await viewer.evaluate(`document.querySelector('[aria-label="Close Trend Line"]').click()`);
    await waitFor(viewer,'!document.querySelector(".trendExplorerWindow")','many-class explorer closes');
  }
  snapshot={...snapshot,sequence:snapshot.sequence+1,results:[qualityResults[3]],job:{...snapshot.job,completed:1}};
  for(const viewer of [classic,modern]){
    await viewer.evaluate(`window.__trendBroadcast(${JSON.stringify(snapshot)})`);
    await qualityAccuracy(viewer,analyticsTotals(snapshot.results),`${viewer.classic?'Classic':'Modern'} excluded-only No Lens result`);
    await defectAccuracy(viewer,analyticsTotals(snapshot.results),`${viewer.classic?'Classic':'Modern'} excluded-only diagnostics remain visible`);
  }
  snapshot={...snapshot,sequence:snapshot.sequence+1,results:[blankLabel],job:{...snapshot.job,completed:1}};
  for(const viewer of [classic,modern]){
    await viewer.evaluate(`window.__trendBroadcast(${JSON.stringify(snapshot)})`);
    await trayAccuracy(viewer,snapshot.results,`${viewer.classic?'Classic':'Modern'} NOK with no named defect`);
    assert.equal(await viewer.evaluate(`document.querySelectorAll('.trayDefectChart [data-tray-key][data-defect-class]').length`),0,'NOK status alone never fabricates an unnamed 3D defect column');
  }
  snapshot={...savedSnapshot,sequence:snapshot.sequence+1};
  for(const viewer of [classic,modern])await viewer.evaluate(`window.__trendBroadcast(${JSON.stringify(snapshot)})`);
  reports.push({cases:'Yield/Defects actual occurrence vs affected-lens counts, repeated classes, no-lens yield exclusion; grouped 3D multi-tray class columns, global WT labels, selection, class filters, blank-label NOK; all20classes, no-scroll four-size dark/White popup matrix'});
  for(const classicMode of [true,false]){
    const empty=await makeViewer(classicMode,true);
    await waitFor(empty,`document.querySelector('.trendLineWorkspace').getAttribute('data-count')==='0'`,'empty inspection history');
    for(const label of labels){await select(empty,label);await chartSafety(empty,`${classicMode?'Classic':'Modern'} empty ${label}`);if(label==='Yield'||label==='Defects')await analyticsFit(empty,`${classicMode?'Classic':'Modern'} empty ${label}`);if(label==='3D Trays')await trayFit(empty,`${classicMode?'Classic':'Modern'} empty ${label}`);}
    await cumulativeAccuracy(empty,[],`${classicMode?'Classic':'Modern'} empty cumulative trend`);
    await trayAccuracy(empty,[],`${classicMode?'Classic':'Modern'} empty grouped tray chart`);
    await qualityAccuracy(empty,analyticsTotals([]),`${classicMode?'Classic':'Modern'} empty Yield`);
    await defectAccuracy(empty,analyticsTotals([]),`${classicMode?'Classic':'Modern'} empty Defects`);
    reports.push({mode:classicMode?'Classic':'Modern',cases:'all5 empty-state graphs, no synthetic values or invalid attributes'});
  }
  for(const viewer of viewers){assert.deepEqual(viewer.errors,[],'No browser runtime/interception errors');assert.deepEqual(viewer.mutations,[],'Trend viewing must not mutate config or backend');}
  console.log(JSON.stringify({passed:reports,liveResultUpdate:true,selectedTabRetained:true,apiMutations:0,browserErrors:0},null,2));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{
  for(const viewer of viewers)viewer.cdp.close();
  if(browser){try{await browser.send('Browser.close');}catch{}browser.close();}
  if(chrome&&!chrome.killed)chrome.kill('SIGTERM');
  fs.rmSync(profile,{recursive:true,force:true});
});
