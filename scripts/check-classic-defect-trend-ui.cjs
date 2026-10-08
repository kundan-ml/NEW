/* Isolated Classic header/defect Trend Line browser regression checks. Every API request (including
 * config writes) and the inspection WebSocket is fulfilled by local fixtures.
 * No upload, inference, deletion or preference mutation reaches a real backend.
 * Usage: node scripts/check-classic-defect-trend-ui.cjs http://localhost:3107
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const WebSocket = require('next/dist/compiled/ws');

const base = process.argv[2] || 'http://localhost:3107';
const port = Number(process.env.CLASSIC_TREND_QA_CHROME_PORT || 9369);
const temporaryRoot = fs.existsSync(os.tmpdir()) ? os.tmpdir() : '/tmp';
const profile = fs.mkdtempSync(path.join(temporaryRoot, 'classic-defect-trend-qa-'));
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
const ages = [180000,120000,60000,30000,10000];
const statuses = ['OK','NOK','WARN','NOK','OK'];
const defectNames=['Bubble','NonCircular','Surface Imperfection','Edge defect','Particle Inclusion'];
const measuredDefects=[
  ['Bubble','Bubble','Surface Imperfection'],
  ['NonCircular','Bubble'],
  ['Particle Inclusion'],
  ['Edge defect','Edge defect'],
  [],
];
function result(index, status = statuses[(index-1)%statuses.length], at = epoch-(ages[index-1]||0)) {
  const names=measuredDefects[index-1]||['Custom HALCON defect'];
  const defects=names.map((name,i)=>({name,confidence:1,severity:'major',channel:'h',
    bbox_xywh_norm:[.15+i*.2,.2+i*.13,.07,.08]}));
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
],defects:defectNames.map((name,index)=>({key:name.toLowerCase().replaceAll(' ','-'),label:name,match_terms:[name],color:['#3b82f6','#e64669','#a96cf4','#efb84c','#14b8a6'][index],symbol:'D'})),fallback_defect:{key:'DEFECT',label:'Unclassified defect',color:'#e64669',symbol:'x'}};
const viewers = [];
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
  }else if(route==='/api/ui-config/access')body={canCustomize:false,loggedIn:true,role:'Operator'};
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

async function makeViewer(classic=true,empty=false) {
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
  await cdp.send('Page.navigate',{url:`${base}/?classic-defect-trend-qa=${Date.now()}`});
  await waitFor(viewer,`!!localStorage.getItem('lens-ui-prefs-v13')`,'appearance provider hydration');
  if(!empty)await waitFor(viewer,`!!document.querySelector('.historyTable .matrixDot.selected')`,'live snapshot hydration');
  else await waitFor(viewer,`document.body.innerText.includes('qa-fixture')`,'empty dashboard hydration');
  await viewer.evaluate(`(()=>{const prefs=JSON.parse(localStorage.getItem('lens-ui-prefs-v13')||'{}');prefs.manualSkeleton=${classic};prefs.theme='graphite';window.dispatchEvent(new StorageEvent('storage',{key:'lens-ui-prefs-v13',newValue:JSON.stringify(prefs)}));})()`);
  await waitFor(viewer,`document.documentElement.dataset.workspace===${JSON.stringify(classic?'manual':'modern')}`,'fixture layout');
  await waitFor(viewer,`document.documentElement.dataset.loggedIn==='true'`,'logged-in fixture access');
  return viewer;
}
async function resize(viewer,width,height){await viewer.cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(160);}
async function screenshot(viewer,name){const value=await viewer.cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(temporaryRoot,name),Buffer.from(value.data,'base64'));}
async function click(viewer,selector){await viewer.evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(selector)});button.focus();button.click();})()`);await pause(120);}
async function range(viewer,value){await viewer.evaluate(`(()=>{const input=document.querySelector('.trendExplorerWindow [aria-label="Trend time range"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(150);}
async function field(viewer,label,value,select=false){await viewer.evaluate(`(()=>{const input=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(${select?'HTMLSelectElement':'HTMLInputElement'}.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(${JSON.stringify(select?'change':'input')},{bubbles:true}));})()`);await pause(150);}
async function open(viewer){await click(viewer,'.sharedClassicHeader [aria-label="Open Trend Line"]');await waitFor(viewer,'!!document.querySelector(".trendExplorerWindow .classicDefectTrend,.trendExplorerWindow .overallDefectTrend")','header opens real popup in saved trend view');await pause(220);}
async function close(viewer){await click(viewer,'.trendExplorerWindow [aria-label="Close Trend Line"]');await waitFor(viewer,'!document.querySelector(".trendExplorerWindow")','popup closes');}
async function safety(viewer,label){
  const state=await viewer.evaluate(`(()=>{const dialog=document.querySelector('.trendExplorerWindow'),root=document.querySelector('.classicDefectTrend'),svg=root?.querySelector('svg[aria-label="Live defect count over time"]'),box=dialog?.getBoundingClientRect();return {exists:!!svg,nan:/NaN|Infinity|undefined/.test(root?.innerHTML||''),overflow:document.documentElement.scrollWidth>innerWidth+1,rootOverflow:root&&root.scrollWidth>root.clientWidth+1,fit:box&&box.left>=-1&&box.top>=-1&&box.right<=innerWidth+1&&box.bottom<=innerHeight+1,chartHeight:svg?.getBoundingClientRect().height,modal:dialog?.getAttribute('aria-modal')};})()`);
  assert(state.exists,`${label}: live defect chart exists`);assert(!state.nan,`${label}: finite chart coordinates`);assert(!state.overflow,`${label}: no page horizontal overflow`);assert(!state.rootOverflow,`${label}: no chart horizontal overflow`);assert(state.fit,`${label}: popup fits viewport`);assert(state.chartHeight>100,`${label}: usable plot height`);assert.equal(state.modal,'true',`${label}: accessible modal`);
  await sidePanelSafety(viewer,'live',label);
  await tipSafety(viewer,label);
}
async function tipSafety(viewer,label){
  const state=await viewer.evaluate(`(()=>{
    const root=document.querySelector('.classicDefectTrend'),svg=root?.querySelector('svg[aria-label="Live defect count over time"]'),box=svg?.getBoundingClientRect();
    const lines=Array.from(root?.querySelectorAll('[data-defect-series]')||[]),classes=Array.from(root?.querySelectorAll('.liveDefectLegendItem')||[]);
    const labels=Array.from(root?.querySelectorAll('[data-defect-tip]')||[]).map(tip=>{
      const text=tip.querySelector('text'),rect=text.getBoundingClientRect(),line=lines.find(line=>line.dataset.defectSeries===tip.dataset.defectTip),entry=classes.find(entry=>entry.dataset.defectKey===tip.dataset.defectTip);
      return {key:tip.dataset.defectTip,code:text.textContent,expected:entry?.dataset.defectCode,color:text.getAttribute('fill'),lineColor:line?.getAttribute('stroke'),tipY:Number(tip.dataset.tipY),expectedY:Number(line?.dataset.latestY),x:Number(text.getAttribute('x')),fixed:!tip.closest('[clip-path]')&&!tip.parentElement.hasAttribute('transform'),fullName:tip.querySelector('title')?.textContent.includes(tip.dataset.defectName)&&tip.getAttribute('aria-label')?.includes(tip.dataset.defectName),rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom}};
    });
    const overlaps=[];for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].rect,b=labels[j].rect;if(Math.min(a.right,b.right)>Math.max(a.left,b.left)+.5&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+.5)overlaps.push([labels[i].key,labels[j].key]);}
    return {count:lines.length,labels,overlaps,fit:labels.every(item=>box&&item.rect.left>=box.left&&item.rect.top>=box.top&&item.rect.right<=box.right+1&&item.rect.bottom<=box.bottom+1)};
  })()`);
  assert.equal(state.labels.length,state.count,`${label}: each visible defect line has initials at its tip`);
  assert(state.fit,`${label}: tip initials fit without clipping`);
  assert.deepEqual(state.overlaps,[],`${label}: tip initials never overlap`);
  for(const tip of state.labels){
    assert.equal(tip.code,tip.expected,`${label}: initials match the class list`);
    assert.equal(tip.color,tip.lineColor,`${label}: initials use their line color`);
    assert(Math.abs(tip.tipY-tip.expectedY)<.001,`${label}: label leader preserves the actual count endpoint`);
    assert(tip.fixed&&tip.fullName,`${label}: fixed live-edge labels retain full-name tooltips`);
  }
  return state.labels;
}
async function sidePanelSafety(viewer,mode,label){
  const state=await viewer.evaluate(`(()=>{const side=document.querySelector(${JSON.stringify(mode==='live'?'.liveDefectSidebar':'.overallTrendSidebar')}),list=side?.querySelector(${JSON.stringify(mode==='live'?'.liveDefectLegend':'.overallTrendClasses')}),chart=document.querySelector(${JSON.stringify(mode==='live'?'.liveDefectChartFrame':'.overallTrendChart')}),box=side?.getBoundingClientRect(),plot=chart?.getBoundingClientRect();return {right:box&&plot&&box.left>=plot.right-1,noScroll:list&&list.scrollHeight<=list.clientHeight+1&&list.scrollWidth<=list.clientWidth+1,allFit:box&&Array.from(list?.querySelectorAll('button')||[]).every(button=>{const r=button.getBoundingClientRect();return r.height>0&&r.top>=box.top-1&&r.bottom<=box.bottom+1}),count:list?.querySelectorAll('button').length};})()`);
  if(!state.noScroll){await screenshot(viewer,'trend-sidebar-overflow-qa.png');const diagnostic=await viewer.evaluate(`(()=>{const list=document.querySelector('.liveDefectLegend,.overallTrendClasses');return {width:list.clientWidth,scrollWidth:list.scrollWidth,height:list.clientHeight,scrollHeight:list.scrollHeight,rows:getComputedStyle(list).gridTemplateRows,cols:getComputedStyle(list).gridTemplateColumns,rect:list.getBoundingClientRect().toJSON(),parent:list.parentElement.getBoundingClientRect().toJSON(),buttons:Array.from(list.querySelectorAll('button')).map(button=>({rect:button.getBoundingClientRect().toJSON(),text:button.innerText}))};})()`);console.error(JSON.stringify(diagnostic));}
  assert(state.right,`${label}: class names are beside the graph`);assert(state.noScroll,`${label}: class list fits without scrolling`);assert(state.allFit,`${label}: every class entry is visible within the side panel`);
}
async function windowDuration(viewer){return viewer.evaluate(`(()=>{const root=document.querySelector('.classicDefectTrend');return Number(root.dataset.windowEnd)-Number(root.dataset.windowStart);})()`);}
async function series(viewer){return viewer.evaluate(`Array.from(document.querySelectorAll('.classicDefectTrend [data-defect-series]')).map(path=>({key:path.dataset.defectSeries,name:path.dataset.defectName,stroke:path.getAttribute('stroke'),d:path.getAttribute('d')}))`);}
async function occurrences(viewer,key){return viewer.evaluate(`Array.from(document.querySelectorAll('.classicDefectTrend [data-defect-point]')).filter(point=>point.dataset.defectPoint===${JSON.stringify(key)}).reduce((total,point)=>total+Number(point.dataset.count),0)`);}
async function touchClick(viewer,selector){
  await viewer.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'})`);await pause(150);
  const point=await viewer.evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(selector)}),rect=button.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);return {x,y,hit:hit?.outerHTML.slice(0,200),targetHit:button===hit||button.contains(hit)};})()`);
  if(!point.targetHit){await screenshot(viewer,'classic-defect-trend-touch-header-hit-qa.png');assert.fail(`Touch target is not reachable: ${JSON.stringify(point)}`);}
  await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,radiusX:4,radiusY:4}]});
  await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(200);
}

(async()=>{
  chrome=spawn(process.env.CHROME_BINARY||'/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',env:{...process.env,TMPDIR:temporaryRoot,TMP:temporaryRoot,TEMP:temporaryRoot}});
  let version;for(let i=0;i<100;i++){try{version=await fetch(`http://127.0.0.1:${port}/json/version`).then(response=>response.json());break;}catch{await pause(100);}}
  assert(version,'Chrome started');browser=connect(version.webSocketDebuggerUrl);await browser.ready;
  const classic=await makeViewer();
  const header=await classic.evaluate(`Array.from(document.querySelectorAll('.sharedClassicHeader button')).map(button=>button.textContent.trim())`);
  const index=header.indexOf('Trendline');assert(index>=0,'Header contains Trendline');assert.equal(header[index-1],'Help','Trendline follows Help');assert.equal(header[index+1],'Exit','Trendline precedes Exit');
  const selectedBottom=await classic.evaluate(`document.querySelector('.inspectionLogTabs button.active')?.textContent.trim()`);
  await open(classic);
  assert(await classic.evaluate(`document.querySelector('.trendExplorerWindow').getBoundingClientRect().width>1500`),'Large-monitor popup uses the increased width');
  assert.equal(await classic.evaluate(`document.querySelector('.inspectionLogTabs button.active')?.textContent.trim()`),selectedBottom,'Header action does not change the selected bottom tab');
  await waitFor(classic,`document.querySelector('.classicDefectTrend')?.dataset.inspected==='5'`,'five real measured results');
  assert.equal(await windowDuration(classic),300000,'Classic live chart defaults to a rolling five-minute window');
  const paths=await series(classic);
  for(const name of defectNames)assert(paths.some(item=>item.name===name),`Individual line for ${name}`);
  for(const [index,name] of defectNames.entries())assert.equal(paths.find(item=>item.name===name).stroke,fixtureLegend.defects[index].color,`${name}: configured legend color is used for its live line`);
  for(const [name,count] of [['Bubble',3],['NonCircular',1],['Surface Imperfection',1],['Edge defect',2],['Particle Inclusion',1]]){
    const item=paths.find(path=>path.name===name);assert.equal(await occurrences(classic,item.key),count,`${name}: true reported occurrence count rather than affected-lens binary count`);
  }
  assert.equal(await classic.evaluate(`Number(document.querySelector('.classicDefectTrend').dataset.count)`),8,'Chart total counts eight actual defect occurrences');
  const initialTips=await tipSafety(classic,'Initial defect lines');
  const summary=await classic.evaluate(`(()=>{const root=document.querySelector('.trendExplorerWindow'),summary=root.querySelector('.liveDefectWindowSummary');return {total:Number(summary?.dataset.total),period:summary?.textContent,metrics:Object.fromEntries(Array.from(root.querySelectorAll('[data-trend-metric]')).map(metric=>[metric.dataset.trendMetric,metric.textContent.trim()])),classes:Array.from(root.querySelectorAll('.liveDefectLegendItem')).map(button=>({key:button.dataset.defectKey,name:button.dataset.defectName,count:Number(button.dataset.classTotal),text:button.textContent}))};})()`);
  assert.equal(summary.total,8,'Readable running summary counts every retained defect occurrence');
  assert((summary.period?.match(/\d{1,2}:\d{2}/g)||[]).length>=2,'Period summary shows both visible start and end times');
  assert.equal(summary.metrics.defects,'8','Live summary emphasizes actual defect occurrences, not inference timing');
  assert.equal(summary.metrics.classes,'5','Live summary identifies five observed defect classes');
  assert.equal(summary.metrics.total,'5','Live summary distinguishes inspected lenses from eight defect occurrences');
  for(const [name,count] of [['Bubble',3],['NonCircular',1],['Surface Imperfection',1],['Edge defect',2],['Particle Inclusion',1]]){
    const item=summary.classes.find(item=>item.name===name);
    assert(item?.key,`${name}: class summary has a stable defect identity`);
    assert.equal(item.count,count,`${name}: class summary displays the exact cumulative total`);
    assert(item.text.includes('%'),`${name}: class summary also displays its share of retained defects`);
  }
  for(const path of paths){
    assert(path.d.startsWith('M')&&path.d.includes(' C'),`${path.name}: adjacent measured points connect with smooth cubic curves`);
    assert(!/NaN|Infinity|undefined/.test(path.d),`${path.name}: smooth path has finite coordinates`);
  }
  assert(await classic.evaluate(`document.querySelector('.liveDefectAxisTitle')?.textContent.includes('Cumulative')`),'Y axis explicitly identifies cumulative, not interval, counts');
  assert(await classic.evaluate(`document.querySelector('.classicDefectTrend')?.dataset.countMode==='cumulative'`),'Live plot advertises its cumulative counting contract');
  assert(await classic.evaluate(`(()=>{const root=document.querySelector('.classicDefectTrend');return Array.from(root.querySelectorAll('[data-defect-series]')).every(path=>{const points=Array.from(root.querySelectorAll('[data-defect-point]')).filter(point=>point.dataset.defectPoint===path.dataset.defectSeries).sort((a,b)=>Number(a.dataset.time)-Number(b.dataset.time));return points.every((point,index)=>!index||Number(point.dataset.cumulativeCount)>=Number(points[index-1].dataset.cumulativeCount));});})()`),'Every class plotted marker uses a nondecreasing running count');
  const interval=await classic.evaluate(`(()=>{const root=document.querySelector('.classicDefectTrend'),svg=root.querySelector('svg[aria-label="Live defect count over time"]'),point=Array.from(root.querySelectorAll('[data-defect-point]')).find(point=>point.dataset.defectPoint==='bubble'),time=point.dataset.time,rect=point.getBoundingClientRect(),total=Array.from(root.querySelectorAll('[data-defect-point]')).filter(point=>point.dataset.time===time).reduce((sum,point)=>sum+Number(point.dataset.count),0);svg.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,pointerType:'mouse'}));return {time,total};})()`);
  await waitFor(classic,`!!document.querySelector('.liveDefectIntervalTotal')`,'Inspecting a measured interval reveals a clear interval total');
  assert.equal(await classic.evaluate(`Number(document.querySelector('.liveDefectIntervalTotal').dataset.intervalTotal)`),interval.total,'Interval tooltip total equals the sum of actual class occurrences at that time');
  assert(await classic.evaluate(`Number(document.querySelector('.liveDefectCumulativeTotal').dataset.cumulativeTotal)>=Number(document.querySelector('.liveDefectIntervalTotal').dataset.intervalTotal)`),'Readout distinguishes cumulative history from new interval additions');
  assert(await classic.evaluate(`document.querySelector('.liveDefectReadout').textContent.includes('10 sec')`),'Raw contextual additions retain readable ten-second intervals');
  await classic.evaluate(`Array.from(document.querySelectorAll('.liveDefectLegendItem')).find(button=>button.dataset.defectName==='Bubble').click()`);
  await waitFor(classic,`!Array.from(document.querySelectorAll('[data-defect-series]')).some(line=>line.dataset.defectName==='Bubble')`,'Legend can hide one defect line');
  assert(!await classic.evaluate(`Array.from(document.querySelectorAll('[data-defect-tip]')).some(tip=>tip.dataset.defectName==='Bubble')`),'Hiding a line also hides its tip initials');
  assert.equal(await classic.evaluate(`Number(document.querySelector('.liveDefectWindowSummary').dataset.total)`),8,'Hiding a class line never changes the selected-period total');
  assert.equal(await classic.evaluate(`Number(document.querySelector('.liveDefectIntervalTotal').dataset.intervalTotal)`),interval.total,'Hiding a class line never silently reduces the interval total');
  await click(classic,'.liveDefectLegendAll');
  await waitFor(classic,`Array.from(document.querySelectorAll('[data-defect-series]')).some(line=>line.dataset.defectName==='Bubble')`,'All types restores every defect line');
  const anchor=await classic.evaluate(`(()=>{const point=Array.from(document.querySelectorAll('.classicDefectTrend [data-defect-point]')).find(point=>Number(point.dataset.count)>0);return {key:point.dataset.defectPoint,time:point.dataset.time,x:Number(point.getAttribute('cx')),end:Number(document.querySelector('.classicDefectTrend').dataset.windowEnd)};})()`);
  await pause(1350);
  const moved=await classic.evaluate(`(()=>{const point=Array.from(document.querySelectorAll('.classicDefectTrend [data-defect-point]')).find(point=>point.dataset.defectPoint===${JSON.stringify(anchor.key)}&&point.dataset.time===${JSON.stringify(anchor.time)});return {x:Number(point?.getAttribute('cx')),end:Number(document.querySelector('.classicDefectTrend').dataset.windowEnd)};})()`);
  assert(moved.end>anchor.end+500,'Live right edge advances while no frames arrive');assert(moved.x<anchor.x-.1,'Existing time point moves from right to left during idle monitoring');
  assert.equal(await classic.evaluate(`Number(document.querySelector('.classicDefectTrend').dataset.count)`),8,'An idle clock tick never resets the running defect total');
  assert.deepEqual((await tipSafety(classic,'Idle live-edge labels')).map(tip=>[tip.key,tip.x,tip.tipY]),initialTips.map(tip=>[tip.key,tip.x,tip.tipY]),'Tip initials stay anchored while the time axis scrolls');
  for(const [value,duration] of [['30m',1800000],['1h',3600000],['4h',14400000]]){await range(classic,value);assert.equal(await windowDuration(classic),duration,`${value}: exact selected visible time span`);}
  await range(classic,'custom');await field(classic,'Custom trend duration','2');await field(classic,'Trend duration unit','minutes',true);assert.equal(await windowDuration(classic),120000,'Custom two-minute rolling window');
  await field(classic,'Trend duration unit','hours',true);await field(classic,'Custom trend duration','3');assert.equal(await windowDuration(classic),10800000,'Custom three-hour rolling window');
  await range(classic,'5m');
  for(const dimensions of [[1920,1080],[1366,768],[1024,768],[768,1024]]){await resize(classic,...dimensions);await safety(classic,`Classic ${dimensions}`);if(dimensions[0]<=1024)assert(await classic.evaluate(`Array.from(document.querySelectorAll('.liveDefectLegendItem')).every(button=>getComputedStyle(button.querySelector('.trendClassInitial')).display!=='none'&&button.title.includes(button.dataset.defectName)&&button.getAttribute('aria-label').includes(button.dataset.defectName))`),'Narrow screens show compact initials while keeping accessible full names');await screenshot(classic,`classic-defect-trend-${dimensions[0]}-qa.png`);}
  // Focused visual regression for endpoint labels, independent of unrelated
  // popup lifecycle tests (including development Strict Mode focus replay).
  if(process.env.TREND_TIP_QA_ONLY==='1'){
    const crowded={...result(6,'NOK',Date.now()),defects:Array.from({length:15},(_,index)=>({name:`Additional HALCON defect class ${index+1}`,confidence:1,severity:'major',channel:'h',bbox_xywh_norm:[.1,.1,.05,.05]}))};
    snapshot={...snapshot,sequence:2,job:{...snapshot.job,completed:6,current_sample_id:'trend-7'},results:[...snapshot.results,crowded]};
    await classic.evaluate(`window.__trendBroadcast(${JSON.stringify({type:'result',stream_id:snapshot.stream_id,sequence:2,current_job_id:snapshot.current_job_id,job:snapshot.job,result:crowded})})`);
    await waitFor(classic,`document.querySelectorAll('[data-defect-tip]').length===20`,'All twenty class endpoints update with a new result');
    for(const dimensions of [[1920,1080],[1366,768],[1024,768],[768,1024]]){
      await resize(classic,...dimensions);await safety(classic,`Classic twenty tips ${dimensions}`);
      await screenshot(classic,`classic-trend-tips-20-${dimensions[0]}-qa.png`);
    }
    const modern=await makeViewer(false);
    await click(modern,'[aria-label="Open Trend Line"]');
    await waitFor(modern,`document.querySelectorAll('.trendExplorerWindow [data-defect-tip]').length===20`,'Modern shares all twenty class endpoint labels');
    for(const dimensions of [[1920,1080],[1366,768],[1024,768],[768,1024]]){
      await resize(modern,...dimensions);await safety(modern,`Modern twenty tips ${dimensions}`);
    }
    await screenshot(modern,'modern-trend-tips-20-qa.png');
    const empty=await makeViewer(true,true);await open(empty);await safety(empty,'No results, no tip labels');
    for(const viewer of viewers){assert.deepEqual(viewer.errors,[]);assert.deepEqual(viewer.mutations,[]);}
    console.log(JSON.stringify({passed:['Color-matched class initials at each live line tip','Full-name tooltips and unchanged count endpoints','Labels hide/restore with their series','Fixed labels during right-to-left scrolling','New result updates all twenty labels','Classic and Modern at four desktop/tablet sizes','Crowded equal-count labels fit without overlap or clipping','Empty state'],apiMutations:0,browserErrors:0},null,2));
    return;
  }
  await resize(classic,1366,768);
  await close(classic);assert.equal(await classic.evaluate(`document.activeElement.getAttribute('aria-label')`),'Open Trend Line','Focus returns to header opener');
  await open(classic);await classic.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await classic.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor(classic,'!document.querySelector(".trendExplorerWindow")','Escape dismisses popup');assert(await classic.evaluate(`document.body.style.overflow!=='hidden'`),'Closing restores body scrolling');
  await open(classic);await classic.evaluate(`document.querySelector('.trendExplorerBackdrop').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);await waitFor(classic,'!document.querySelector(".trendExplorerWindow")','Backdrop dismisses popup without activating dashboard');
  await classic.cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await touchClick(classic,'.sharedClassicHeader [aria-label="Open Trend Line"]');await waitFor(classic,'!!document.querySelector(".classicDefectTrend")','touch opens header popup');await safety(classic,'Classic touch');
  const point=await classic.evaluate(`(()=>{const rect=document.querySelector('.classicDefectTrend svg[aria-label="Live defect count over time"]').getBoundingClientRect();return {x:rect.left+rect.width*.7,y:rect.top+rect.height*.5};})()`);
  await classic.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:4,radiusY:4}]});await classic.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await waitFor(classic,`!!document.querySelector('.classicDefectTrend [role="status"]')`,'Touch chart reveals time and defect counts');
  await screenshot(classic,'classic-defect-trend-touch-qa.png');await classic.cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  const newResult=result(6,'NOK',Date.now());
  snapshot={...snapshot,sequence:2,job:{...snapshot.job,completed:6,current_sample_id:'trend-7'},results:[...snapshot.results,newResult]};
  await classic.evaluate(`window.__trendBroadcast(${JSON.stringify({type:'result',stream_id:snapshot.stream_id,sequence:2,current_job_id:snapshot.current_job_id,job:snapshot.job,result:newResult})})`);
  await waitFor(classic,`Array.from(document.querySelectorAll('[data-defect-series]')).some(line=>line.dataset.defectName==='Custom HALCON defect')`,'Unknown newly reported defect gets its own live line');
  await waitFor(classic,`document.querySelector('.classicDefectTrend').dataset.inspected==='6'`,'Live frame updates popup without refresh');
  assert.equal(await classic.evaluate(`Number(document.querySelector('.classicDefectTrend').dataset.count)`),9,'New live occurrence adds onto existing cumulative history');
  await close(classic);await open(classic);assert.equal(await windowDuration(classic),300000,'User time range persists when popup reopens');
  await classic.evaluate(`document.querySelector('.trendScopeSwitch button:nth-child(2)').click()`);
  await waitFor(classic,`!!document.querySelector('.overallDefectTrend')`,'Overall categorical chart opens');
  assert.equal(await classic.evaluate(`Number(document.querySelector('.overallDefectTrend').dataset.total)`),9,'Overall counts every reported defect');
  assert(!await classic.evaluate(`!!document.querySelector('.trendExplorerWindow [aria-label="Trend time range"],.trendExplorerWindow time')`),'Overall contains no clock or time-window controls');
  assert.equal(await classic.evaluate(`document.querySelectorAll('[data-overall-defect]').length`),6,'Overall includes every defect class');
  for(const dimensions of [[1366,768],[1024,768],[768,1024]]){await resize(classic,...dimensions);await sidePanelSafety(classic,'overall',`Overall ${dimensions}`);}
  await resize(classic,1366,768);
  await screenshot(classic,'classic-overall-trend-qa.png');
  await close(classic);await open(classic);
  await waitFor(classic,`!!document.querySelector('.overallDefectTrend')`,'Overall selection persists after reopening');
  await classic.evaluate(`document.querySelector('.trendScopeSwitch button:first-child').click()`);
  await waitFor(classic,`!!document.querySelector('.classicDefectTrend')`,'Live time-based chart returns');
  assert.equal(await windowDuration(classic),300000,'Switching scope retains live window');
  await range(classic,'custom');await field(classic,'Trend duration unit','minutes',true);await field(classic,'Custom trend duration','1');
  assert(await classic.evaluate(`Number(document.querySelector('.classicDefectTrend').dataset.windowCount)<9`),'Raw additions exclude results outside the selected minute');
  const shortWindow=await classic.evaluate(`(()=>{const root=document.querySelector('.classicDefectTrend');return {total:Number(root.dataset.count),window:Number(root.dataset.windowCount),summary:Number(root.querySelector('.liveDefectWindowSummary').dataset.total),classTotal:Array.from(root.querySelectorAll('.liveDefectLegendItem')).reduce((sum,button)=>sum+Number(button.dataset.classTotal),0),windowClassTotal:Array.from(root.querySelectorAll('.liveDefectLegendItem')).reduce((sum,button)=>sum+Number(button.dataset.windowTotal),0)};})()`);
  assert.equal(shortWindow.total,9,'Shortening the visible axis keeps all accumulated history');
  assert.equal(shortWindow.summary,shortWindow.total,'Running summary does not reset when the selected time period changes');
  assert.equal(shortWindow.classTotal,shortWindow.total,'Every class summary keeps its consistent cumulative total');
  assert.equal(shortWindow.windowClassTotal,shortWindow.window,'Raw period additions stay separately available');
  assert(await classic.evaluate(`(()=>{const root=document.querySelector('.classicDefectTrend'),button=Array.from(root.querySelectorAll('.liveDefectLegendItem')).find(button=>button.dataset.defectName==='Bubble'),line=Array.from(root.querySelectorAll('[data-defect-series]')).find(line=>line.dataset.defectName==='Bubble');if(!button||!line||Number(button.dataset.windowTotal)!==0||Number(button.dataset.classTotal)!==3)return false;const ys=Array.from(line.getAttribute('d').matchAll(/-?\\d+(?:\\.\\d+)?,-?\\d+(?:\\.\\d+)?/g),match=>Number(match[0].split(',')[1]));return ys.length>2&&ys.every(y=>Math.abs(y-Number(line.dataset.latestY))<.02);})()`),'Dormant historical Bubble line remains visible and flat at three, not zero');
  await classic.evaluate(`(()=>{const native=Date.now;window.__trendRestoreClock=()=>{Date.now=native;};Date.now=()=>native()+600000;})()`);
  await waitFor(classic,`document.querySelector('.classicDefectTrend')?.dataset.windowCount==='0'`,'Advancing the display clock expires all raw interval detections');
  assert.equal(await classic.evaluate(`Number(document.querySelector('.classicDefectTrend').dataset.count)`),9,'Running totals remain nine after every event rolls out of the visible window');
  assert(await classic.evaluate(`(()=>{const root=document.querySelector('.classicDefectTrend');return root.querySelectorAll('[data-defect-series]').length===6&&!root.querySelector('.liveDefectEmpty')&&Array.from(root.querySelectorAll('[data-defect-series]')).every(line=>{const ys=Array.from(line.getAttribute('d').matchAll(/-?\\d+(?:\\.\\d+)?,-?\\d+(?:\\.\\d+)?/g),match=>Number(match[0].split(',')[1]));return ys.every(y=>Math.abs(y-Number(line.dataset.latestY))<.02);});})()`),'All historical class lines stay level without an incorrect empty-state overlay');
  await classic.evaluate(`window.__trendRestoreClock()`);
  await waitFor(classic,`Number(document.querySelector('.classicDefectTrend')?.dataset.windowEnd)<${Date.now()+60000}`,'Restoring the real display clock preserves test isolation');
  await classic.evaluate(`document.querySelector('.trendScopeSwitch button:nth-child(2)').click()`);
  await waitFor(classic,`!!document.querySelector('.overallDefectTrend')`,'Overall opens from a short live window');
  assert.equal(await classic.evaluate(`Number(document.querySelector('.overallDefectTrend').dataset.total)`),9,'Overall includes defects outside the live window');
  await classic.evaluate(`document.querySelector('.trendScopeSwitch button:first-child').click()`);await range(classic,'5m');
  const manyResult={...result(7,'NOK',Date.now()),defects:Array.from({length:14},(_,index)=>({name:`Additional HALCON defect class ${index+1}`,confidence:1,severity:'major',channel:'h',bbox_xywh_norm:[.1,.1,.05,.05]}))};
  snapshot={...snapshot,sequence:3,job:{...snapshot.job,completed:7,current_sample_id:'trend-8'},results:[...snapshot.results,manyResult]};
  await classic.evaluate(`window.__trendBroadcast(${JSON.stringify({type:'result',stream_id:snapshot.stream_id,sequence:3,current_job_id:snapshot.current_job_id,job:snapshot.job,result:manyResult})})`);
  await waitFor(classic,`document.querySelectorAll('.liveDefectLegendItem').length===20`,'Every reported class appears in the fitted side panel');
  for(const dimensions of [[1366,768],[768,1024]]){await resize(classic,...dimensions);await sidePanelSafety(classic,'live',`Live twenty classes ${dimensions}`);await tipSafety(classic,`Live twenty classes ${dimensions}`);}
  await screenshot(classic,'classic-live-sidebar-many-qa.png');
  const liveCodes=await classic.evaluate(`Object.fromEntries(Array.from(document.querySelectorAll('.liveDefectLegendItem')).map(button=>[button.dataset.defectName,button.dataset.defectCode]))`);
  assert.equal(new Set(Object.values(liveCodes)).size,20,'Each crowded-list defect has its own initials');
  await classic.evaluate(`document.querySelector('.trendScopeSwitch button:nth-child(2)').click()`);
  await waitFor(classic,`document.querySelectorAll('.overallTrendClasses button').length===20`,'Overall retains every class in its side panel');
  assert.deepEqual(await classic.evaluate(`Object.fromEntries(Array.from(document.querySelectorAll('.overallTrendClasses button')).map(button=>[button.dataset.defectName,button.dataset.defectCode]))`),liveCodes,'Overall and Live use identical initials for each class');
  assert(await classic.evaluate(`Array.from(document.querySelectorAll('.overallTrendClasses button')).every(button=>getComputedStyle(button.querySelector('.trendClassInitial')).display!=='none'&&button.title.includes(button.dataset.defectName))`),'Crowded Overall lists use compact badges with full-name tooltips');
  assert(await classic.evaluate(`Array.from(document.querySelectorAll('.overallTrendClasses .trendClassInitial')).every(badge=>{const r=badge.getBoundingClientRect(),parent=badge.parentElement.getBoundingClientRect();return badge.scrollWidth<=badge.clientWidth+1&&r.left>=parent.left-1&&r.right<=parent.right+1})`),'Every compact Overall initial fits fully without cropping');
  await sidePanelSafety(classic,'overall','Overall twenty classes');await screenshot(classic,'classic-overall-sidebar-many-qa.png');
  const modern=await makeViewer(false);
  assert(!await modern.evaluate(`!!document.querySelector('.sharedClassicHeader [aria-label="Open Trend Line"]')`),'Classic navigation action does not leak into Modern header');
  await modern.evaluate(`Array.from(document.querySelectorAll('.referenceTrendPanel button')).find(button=>button.textContent.trim()==='Trend Line').click()`);
  await waitFor(modern,`!!document.querySelector('.trendLineWorkspace')`,'Modern existing trend tab remains available');
  await waitFor(modern,`!!document.querySelector('.classicDefectTrend')`,'Modern live analytics shares the same class-based cumulative chart');
  assert.equal(await modern.evaluate(`Number(document.querySelector('.classicDefectTrend').dataset.count)`),23,'Modern cumulative chart counts every retained instance too');
  await tipSafety(modern,'Modern defect lines');
  const empty=await makeViewer(true,true);await open(empty);await safety(empty,'Classic empty');assert.equal(await empty.evaluate(`Number(document.querySelector('.classicDefectTrend').dataset.count)`),0,'Empty history has zero measured defects');
  for(const viewer of viewers){assert.deepEqual(viewer.errors,[],'No browser runtime or fixture interception errors');assert.deepEqual(viewer.mutations,[],'Read-only trend viewing sends no backend/config mutations');}
  console.log(JSON.stringify({passed:['Header Help → Trendline → Exit','Real popup open/close/Escape/backdrop and focus restoration','Cumulative class totals and history-based shares','Separate raw interval totals remain correct when class lines are hidden','Smooth nondecreasing cumulative curves and readable intervals','Historical class lines stay flat when events roll out of the visible window','No reset during idle intervals or time-window changes','New live detection adds onto retained totals','Continuously moving right-to-left time axis','Preset minutes/hours and custom duration','All reported classes including unknown live defects','Four desktop/tablet sizes and touch inspection','Modern shares the cumulative per-class chart','Empty state and persisted duration'],apiMutations:0,browserErrors:0},null,2));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{
  for(const viewer of viewers)viewer.cdp.close();
  if(browser){try{await browser.send('Browser.close');}catch{}browser.close();}
  if(chrome&&!chrome.killed)chrome.kill('SIGTERM');
  fs.rmSync(profile,{recursive:true,force:true});
});
