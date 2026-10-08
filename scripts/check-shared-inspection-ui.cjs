/* Isolated Chrome regression checks. All API traffic is fulfilled by fixtures;
 * real uploads, inference, deletion, credentials, and UI preference writes are
 * never sent to the running application backend. No extra npm package needed.
 * Usage: node scripts/check-shared-inspection-ui.cjs [http://localhost:3000]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('next/dist/compiled/ws');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const base = process.argv[2] || 'http://localhost:3000';
const port = Number(process.env.UI_QA_CHROME_PORT || 9336);
const temporaryRoot = fs.existsSync(os.tmpdir()) ? os.tmpdir() : '/tmp';
const profile = fs.mkdtempSync(path.join(temporaryRoot, 'shared-inspection-qa-'));
const channels = ['h', 'd', 'n', 'p'];
const makeSamples = (dataset, count) => Array.from({ length: count }, (_, i) => ({
  id: `${dataset}-${i + 1}`, position: i % 16 + 1, wt_index: Math.floor(i / 16) + 1,
  category: 'Inspection', base_name: process.env.CANVAS_POPUP_QA_ONLY==='1'&&dataset==='live'&&i===4?'B03671_2024-12-05-215350_CV.4114_R_05_Position5_00000000000000000000000010000000':`${dataset}_Position${i % 16 + 1}`, metadata: {},
  images: Object.fromEntries(channels.map(channel => [channel, {
    channel, filename: `${dataset}_Position${i % 16 + 1}.${channel}.bmp`,
    relative_path: `${dataset}-${i + 1}.${channel}.bmp`, absolute_path: `/fixture/${dataset}-${i + 1}.${channel}.bmp`,
  }])),
}));
const sampleRows = { old: makeSamples('old', 16), live: makeSamples('live', 32), 'setup-preview':makeSamples('setup-preview',1) };
const fixtureDefect={name:'Surface Imperfection',confidence:1,channel:'h',severity:'major',bbox_xywh_norm:[.65,.3,.12,.1]};
const canvasPopupDefects=Array.from({length:13},(_,index)=>({...fixtureDefect,name:index===0?fixtureDefect.name:`Additional inspection defect ${index+1}`,bbox_xywh_norm:[.2+(index%4)*.16,.18+Math.floor(index/4)*.14,.1,.08]}));
const sampleDefects=()=>process.env.CANVAS_POPUP_QA_ONLY==='1'?canvasPopupDefects:[fixtureDefect];
const result = (dataset, index, run = 'a') => ({
  dataset_id: dataset, sample_id: `${dataset}-${index}`, position: (index - 1) % 16 + 1,
  wt_index: Math.floor((index - 1) / 16) + 1, category: 'Inspection',
  status: index % 3 ? 'OK' : 'NOK', defects: index===5?sampleDefects():[],
  channels: channels.map(channel => ({ channel, image_path: '/fixture/image.bmp', status: index % 3 ? 'OK' : 'NOK', defects: index===5&&channel==='h'?sampleDefects():[], measurements: {}, engine: 'dsm-bv-4cam-halcon-26.05', elapsed_ms: 12.345 })),
  created_at: `2026-10-05T${run === 'a' ? '08' : '09'}:00:${String(index).padStart(2, '0')}Z`,
});
const datasets = ['old', 'live'].map((id, index) => ({
  id, name: `${id} inspection`, source_type: 'upload', source_path: '/fixture',
  sample_count: sampleRows[id].length, image_count: sampleRows[id].length * 4,
  categories: { Inspection: sampleRows[id].length }, channels: Object.fromEntries(channels.map(channel => [channel, sampleRows[id].length])),
  created_at: `2026-10-05T0${index + 1}:00:00Z`,
}));
const makeJob = (id, completed, status = 'running') => ({ id, dataset_id: 'live', status, total: 32, completed, current_sample_id: `live-${completed + 1}`, summary: { OK: completed, NOK: 0, WARN: 0 } });
let snapshot = { type: 'snapshot', stream_id: 'fixture-stream', sequence: 100, current_job_id: 'job-a', job: makeJob('job-a', 5), results: Array.from({ length: 5 }, (_, i) => result('live', i + 1)) };
let delayedLive = null;
let delayedThumbnail = '';
let fixtureLogs = [];
let setupPreviewFixtures=false;
let machineMode='AUTO';
let setupSession=0;
const setupFixtureWrites=[];
let manualInspectionFixtures=false;
const manualFixtureWrites=[];
let imageFilterSettings={positions:Array.from({length:16},(_,index)=>index+1),result_types:['OK','NOK','WARN'],error_classes:[],apply_to_display:false};
let imageFilterFixtures=false;
const imageFilterWrites=[];
let filterStorageRuntime={active:false,saved_lenses:0,saved_images:0,event_count:0,position_counts:{},error_counts:{},reason:'Storage idle',schedule_key:''};
const reports = [];
const viewers = [];
let chrome;
let browser;

function connect(url) {
  const socket = new WebSocket(url);
  let serial = 0;
  const pending = new Map();
  const listeners = new Map();
  const ready = new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.on('message', raw => {
    const value = JSON.parse(String(raw));
    if (value.id) {
      const call = pending.get(value.id); if (!call) return; pending.delete(value.id);
      value.error ? call.reject(new Error(value.error.message)) : call.resolve(value.result);
    } else for (const listener of listeners.get(value.method) || []) listener(value.params);
  });
  return { ready, on(method, callback) { const list = listeners.get(method) || []; list.push(callback); listeners.set(method, list); },
    send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }, close() { socket.close(); } };
}

async function fixtureRequest(viewer, event) {
  const url = new URL(event.request.url);
  const route = url.pathname;
  const method = event.request.method;
  viewer.calls.push({ route, method });
  let body;
  let contentType = 'application/json';
  if (route === '/api/image') {
    contentType = 'image/svg+xml';
    const small = url.searchParams.get('thumbnail') === '1';
    if(small&&url.searchParams.get('sampleId')===delayedThumbnail)await pause(700);
    if (!small) await pause(800);
    body = `<svg xmlns="http://www.w3.org/2000/svg" width="${small ? 160 : 640}" height="${small ? 120 : 480}" viewBox="0 0 640 480"><rect width="640" height="480" fill="#050505"/><circle cx="320" cy="240" r="190" fill="#777"/><text x="20" y="35" fill="white">${url.searchParams.get('sampleId')}</text></svg>`;
  } else if (setupPreviewFixtures && route.endsWith('/datasets/uploads') && method==='POST') {
    assert.equal(JSON.parse(event.request.postData).purpose,'setup','Preview uploads must be isolated from inspection history');
    body={upload_id:(++setupSession).toString(16).padStart(32,'0'),chunk_bytes:2*1024*1024};
  } else if (setupPreviewFixtures && /\/datasets\/uploads\/[^/]+\/files\/\d+$/.test(route)) {
    const offset=Number(url.searchParams.get('offset')),size=Number(url.searchParams.get('size'));
    body={next_offset:offset+Math.min(2*1024*1024,size-offset)};
  } else if (setupPreviewFixtures && /\/datasets\/uploads\/[^/]+\/finish$/.test(route)) {
    body={id:'setup-preview',sample_count:1,samples:[{id:'one',images:Object.fromEntries(channels.map(channel=>[channel,{channel}]))}]};
  } else if (route.endsWith('/system/mode')&&method==='POST') {
    machineMode=JSON.parse(event.request.postData).mode;body={mode:machineMode};
  } else if (route.endsWith('/setup/focus-config')) {
    body={valid:true,limits:[{key:'brightness',label:'Brightness',enabled:true,min_role:'NoUser'},{key:'contrast',label:'Contrast',enabled:true,min_role:'NoUser'},{key:'focus_score',label:'Sharpness',enabled:true,min_role:'NoUser'},{key:'outer_circle_diameter',label:'Outer diameter',enabled:true,min_role:'NoUser'}],channel_limits:{h:[{key:'brightness',label:'Brightness',enabled:false,min_role:'NoUser'}]}};
  } else if (route.endsWith('/setup/focus-check')) {
    const request=JSON.parse(event.request.postData);
    body={channel:request.channel,tab:request.tab,status:'unavailable',metrics:[{key:'outer_circle_diameter',label:'Outer diameter',value:null,status:'unavailable',optimum:[96,104],acceptable:[92,108],reason:'Calibrated jig unavailable.'},{key:'focus_score',label:'Sharpness',value:31.2,status:'green',optimum:[12,100],acceptable:[7,120]}]};
  } else if (route.endsWith('/registration/run')) {
    const request=JSON.parse(event.request.postData);
    body={...request,created_at:new Date().toISOString(),user:'fixture',calibration_status:'offline-estimate',note:'Unverified estimate, not applied to production.',transforms:channels.map(channel=>({channel,tx_px:0,ty_px:0,rotation_deg:0,scale:1,um_per_pixel:6.25}))};
  } else if (route.endsWith('/setup/camera-system')) {
    body={head_count:2,cameras:[]};
  } else if (route.endsWith('/bv/scripts')) {
    body={scripts:[{lens_type:'DSM BV',name:'DSM_BV.hdev',loaded:true}]};
  } else if (route.includes('/inspect/setup-preview/sample/')) {
    body={...result('setup-preview',1),defects:[fixtureDefect]};
  } else if (manualInspectionFixtures&&route.endsWith('/inspect/old/sample/old-1')&&method==='POST') {
    const output=result('old',1),defect={...fixtureDefect,name:'Manual regression defect'};
    body={...output,status:'NOK',defects:[defect],created_at:'2026-10-05T12:00:01Z',channels:output.channels.map(channel=>({...channel,status:'NOK',defects:channel.channel==='h'?[defect]:[],elapsed_ms:78.901}))};
  } else if (route === '/api/ui-config/access') body = { canCustomize: false,loggedIn:true };
  else if (route === '/api/ui-config') body = { manualSkeleton: viewer.classic, theme: 'graphite' };
  else if (route.endsWith('/inspection/live')) {
    body = structuredClone(snapshot);
    if (delayedLive && !delayedLive.used) { delayedLive.used = true; body = delayedLive.value; await pause(delayedLive.delay); }
  } else if (route.endsWith('/system/info')) body = { app: 'Lens Inspection', version: '3', mode: viewer.forceMode||machineMode, bridge: 'HALCON fixture', settings: { station_name: 'Station 1', line_name: 'Fixture', installation_name: 'Fixture', station_index: 1, wt_capacity: 16, role: viewer.classic ? 'Administrator' : 'Operator', channel_labels: { h: 'Telecentric', d: 'Dark Field', n: 'Diffuse', p: 'Phase Contrast' }, image_format: 'BMP' }, session: { username: viewer.classic ? 'admin-fixture' : 'operator-fixture', role: viewer.classic ? 'Administrator' : 'Operator', logged_in: true } };
  else if(imageFilterFixtures&&route.endsWith('/storage/start')){filterStorageRuntime={...filterStorageRuntime,active:!imageFilterSettings.recurring.enabled,schedule_key:imageFilterSettings.recurring.enabled?'armed-fixture':'',reason:imageFilterSettings.recurring.enabled?'waiting for scheduled storage':'manual'};body=filterStorageRuntime;}
  else if(imageFilterFixtures&&route.endsWith('/storage/stop')){filterStorageRuntime={...filterStorageRuntime,active:false,schedule_key:'',reason:'manual stop'};imageFilterSettings={...imageFilterSettings,recurring:{...imageFilterSettings.recurring,enabled:false},storage_information:''};body=filterStorageRuntime;}
  else if (route.endsWith('/storage/state')) body = imageFilterFixtures?filterStorageRuntime:{ active: false, saved_lenses: 0, saved_images: 0, event_count: 0, position_counts: {}, error_counts: {}, reason: 'Fixture' };
  else if (route.endsWith('/config/status-symbol-legend')) body = { statuses: [], defects: [] };
  else if (route.endsWith('/config/image-filters')) {if(imageFilterFixtures&&method==='PUT')imageFilterSettings=JSON.parse(event.request.postData);body=imageFilterSettings;}
  else if (route.endsWith('/datasets')) body = datasets;
  else if (/\/datasets\/[^/]+\/samples$/.test(route)) { const id = route.split('/').at(-2); body = { total: sampleRows[id].length, items: sampleRows[id] }; }
  else if (/\/results\/[^/]+$/.test(route)) { const id = route.split('/').at(-1); body = { items: id === 'old' ? Array.from({ length: 16 }, (_, i) => result('old', i + 1)) : snapshot.job?.dataset_id === id ? snapshot.results : [] }; }
  else if (route.endsWith('/logs')) body = { items: fixtureLogs };
  else if (route.endsWith('/datasets/local-folders')) body = {path:'/fixture/images',parent:'/fixture',folders:[{name:'Inspection set',path:'/fixture/images/set'}],truncated:false};
  else if (route.endsWith('/auth/current')) body = { username: 'fixture', role: 'Operator', logged_in: true };
  else body = {};
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if(setupPreviewFixtures && (route.includes('/datasets/uploads')||route.endsWith('/setup/focus-check')||route.endsWith('/registration/run')||route.endsWith('/system/mode')||route.includes('/inspect/setup-preview/sample/')))setupFixtureWrites.push({route,method});
    else if(manualInspectionFixtures&&route.endsWith('/inspect/old/sample/old-1')&&method==='POST')manualFixtureWrites.push({route,method});
    else if(imageFilterFixtures&&(route.endsWith('/config/image-filters')||route.endsWith('/storage/start')||route.endsWith('/storage/stop')))imageFilterWrites.push({route,method});
    else viewer.mutations.push({ route, method });
  }
  await viewer.cdp.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Cache-Control', value: 'no-store' }],
    body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
}

function socketFixture(initial) {
  return `(() => {
    window.__qaDraws=[];
    window.__qaDrawCalls=[];
    window.__qaOverlays=0;
    const rectangle=CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.strokeRect=function(...args){window.__qaOverlays++;return rectangle.apply(this,args);};
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image instanceof HTMLImageElement){window.__qaDraws.push(image.naturalWidth);window.__qaLastCanvasPreview=image.dataset.previewUrl||'';if(args.length===4)window.__qaDrawCalls.push({x:args[0],y:args[1],width:args[2],height:args[3]});}return draw.call(this,image,...args);};
    localStorage.setItem('lens-operation-mode','MANUAL');
    window.__qaSnapshot=${JSON.stringify(initial)};
    window.__qaSockets=[];window.__qaSocketBlock=false;window.__qaSocketOpens=0;
    const Native=window.WebSocket;
    class FixtureSocket extends EventTarget {
      static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
      constructor(url,protocols) { super();if(!String(url).endsWith('/ws/inspection'))return new Native(url,protocols);this.url=url;this.readyState=0;window.__qaSockets.push(this);setTimeout(()=>{if(this.readyState===3)return;if(window.__qaSocketBlock){this.close();return;}this.readyState=1;window.__qaSocketOpens++;this.onopen?.({});this.onmessage?.({data:JSON.stringify(window.__qaSnapshot)});},25); }
      close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.({code:1000});}
      send(){}
    }
    window.WebSocket=FixtureSocket;
    window.__qaBroadcast=(message)=>{window.__qaSnapshot=message.type==='snapshot'?message:window.__qaSnapshot;for(const socket of window.__qaSockets)if(socket.readyState===1)socket.onmessage?.({data:JSON.stringify(message)});};
    window.__qaDisconnect=()=>{window.__qaSocketBlock=true;for(const socket of window.__qaSockets)socket.close();};
  })()`;
}

async function makeViewer(classic) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
  const cdp = connect(targets.find(item => item.id === targetId).webSocketDebuggerUrl); await cdp.ready;
  const viewer = { cdp, classic, browserContextId, targetId, errors: [], calls: [], mutations: [], cancelledFixtureRequests: 0 };
  viewers.push(viewer);
  cdp.on('Runtime.exceptionThrown', event => viewer.errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  cdp.on('Fetch.requestPaused', event => { fixtureRequest(viewer, event).catch(error => {
    // A scope change may abort an obsolete image request before the fixture
    // fulfills it. Chrome then invalidates its interception ID normally.
    if (/Invalid InterceptionId/.test(String(error))) viewer.cancelledFixtureRequests += 1;
    else viewer.errors.push(String(error));
  }); });
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: socketFixture(snapshot) });
  viewer.evaluate = async expression => { const output = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (output.exceptionDetails) throw new Error(output.exceptionDetails.exception?.description || output.exceptionDetails.text); return output.result.value; };
  await cdp.send('Page.navigate', { url: `${base}/?shared-ui-qa=${Date.now()}` });
  await waitFor(viewer, '!!document.querySelector(".viewerPositionPill")', 'dashboard hydration');
  await waitFor(viewer, '!!document.querySelector(".historyTable .matrixDot.selected")', 'shared snapshot hydration');
  await applyAppearance(viewer);
  return viewer;
}

async function applyAppearance(viewer) {
  await viewer.evaluate(`(()=>{const prefs=JSON.parse(localStorage.getItem('lens-ui-prefs-v13')||'{}');prefs.manualSkeleton=${viewer.classic};window.dispatchEvent(new StorageEvent('storage',{key:'lens-ui-prefs-v13',newValue:JSON.stringify(prefs)}));})()`);
  await waitFor(viewer, `document.documentElement.dataset.workspace===${JSON.stringify(viewer.classic ? 'manual' : 'modern')}`, 'appearance fixture');
}

async function waitFor(viewer, expression, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await viewer.evaluate(expression)) return; await pause(100); }
  throw new Error(`${viewer.classic ? 'Classic' : 'Modern'}: timeout waiting for ${label}; DOM=${await viewer.evaluate('document.body.innerText.slice(0,800)')}; errors=${JSON.stringify(viewer.errors)}`);
}

async function inspect(viewer) {
  return viewer.evaluate(`(()=>{
    const gallery=document.querySelector('.inspectionWtGallery')||document.querySelector('.oakTrayStrip');
    return {position:document.querySelector('.viewerPositionPill')?.innerText,selected:document.querySelector('.historyTable .matrixDot.selected')?.getAttribute('aria-label'),images:gallery?gallery.querySelectorAll('img').length:0,mode:localStorage.getItem('lens-operation-mode'),workspace:document.documentElement.dataset.workspace,sockets:window.__qaSockets.filter(socket=>socket.readyState===1).length};
  })()`);
}

async function openWt(viewer) {
  await viewer.evaluate(`(()=>{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='WT View');if(button)button.click();})()`);
}

async function checkPosition(viewer, position, expectedSample) {
  await waitFor(viewer, `document.querySelector('.viewerPositionPill')?.innerText.replace(/\\s+/g,' ').includes('Position ${position} / 16')`, `latest P${position}`);
  if (expectedSample) await waitFor(viewer, `document.querySelector('.historyTable .matrixDot.selected')?.getAttribute('aria-label')?.includes(${JSON.stringify(expectedSample)})`, 'selected WT');
}

async function broadcast(message) {
  for (const viewer of viewers) await viewer.evaluate(`window.__qaBroadcast(${JSON.stringify(message)})`);
}

async function advance(completed, id = 'job-a', run = 'a') {
  snapshot = { ...snapshot, sequence: snapshot.sequence + 1, current_job_id: id, job: makeJob(id, completed), results: Array.from({ length: completed }, (_, i) => result('live', i + 1, run)) };
  const message = { type: 'result', stream_id: snapshot.stream_id, sequence: snapshot.sequence, current_job_id: id, job: snapshot.job, result: snapshot.results.at(-1) };
  await broadcast(message);
}

async function checkGallery(viewer,expectedIds,label){
  await openWt(viewer);
  await waitFor(viewer,`(()=>{const gallery=document.querySelector('.inspectionWtGallery')||document.querySelector('.oakTrayStrip');if(!gallery)return false;const ids=Array.from(gallery.querySelectorAll('img')).map(image=>new URL(image.getAttribute('src'),location.href).searchParams.get('sampleId'));return JSON.stringify(ids)===${JSON.stringify(JSON.stringify(expectedIds))};})()`,label);
}

async function checkPinchDoesNotSelect(viewer){
  await waitFor(viewer,`document.querySelector('.canvasHost.canvas-ready')&&window.__qaDrawCalls.length>0`,'defect canvas ready for pinch');
  const point=await viewer.evaluate(`(()=>{const box=document.querySelector('.canvasHost').getBoundingClientRect(),draw=window.__qaDrawCalls.at(-1);return {x:box.left+draw.x+draw.width*.71,y:box.top+draw.y+draw.height*.35};})()`);
  assert.equal(await viewer.evaluate(`!!document.querySelector('.inspectionSelectedDefect')`),false,'Overview starts without a selected defect');
  await viewer.cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const fixed={id:1,x:point.x,y:point.y,radiusX:2,radiusY:2};
  const moving={id:2,x:point.x-60,y:point.y,radiusX:2,radiusY:2};
  await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[fixed,moving]});
  await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[fixed,{...moving,x:moving.x-30}]});
  await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[fixed]});
  await viewer.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await pause(200);
  assert.equal(await viewer.evaluate(`!!document.querySelector('.inspectionSelectedDefect')`),false,'Final stationary finger-up after pinch must not select a defect');
  await viewer.cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false,maxTouchPoints:1});
}

async function checkBvCanvasContainment(viewer,dimensions){
  const layout=await viewer.evaluate(`(()=>{
    const contained=(inner,outer)=>inner.left>=outer.left-1&&inner.top>=outer.top-1&&inner.right<=outer.right+1&&inner.bottom<=outer.bottom+1;
    const visibleOnTop=element=>{if(!element)return false;const box=element.getBoundingClientRect(),top=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return !!top&&(top===element||element.contains(top));};
    const cards=Array.from(document.querySelectorAll('.bvTestImageCard')).map(card=>{
      const stage=card.querySelector('.bvTestImageStage'),host=stage?.querySelector('.canvasHost'),image=host?.querySelector('canvas');
      if(!stage||!host||!image)return {complete:false};
      const cardBox=card.getBoundingClientRect(),stageBox=stage.getBoundingClientRect(),hostBox=host.getBoundingClientRect(),imageBox=image.getBoundingClientRect();
      return {complete:true,stageInCard:contained(stageBox,cardBox),hostInStage:contained(hostBox,stageBox),canvasInStage:contained(imageBox,stageBox),imageWidth:imageBox.width,imageHeight:imageBox.height,cardWidth:cardBox.width,cardHeight:cardBox.height,headerVisible:visibleOnTop(card.querySelector('header'))};
    });
    return {cards,headerVisible:visibleOnTop(document.querySelector('.bvTestHeader')),closeVisible:visibleOnTop(document.querySelector('.bvTestClose'))};
  })()`);
  assert.equal(layout.cards.length,4,`Four camera cards at ${dimensions}`);
  for(const [index,card] of layout.cards.entries()){
    assert(card.complete,`Camera ${index+1} has an actual image canvas at ${dimensions}`);
    assert(card.stageInCard&&card.hostInStage&&card.canvasInStage,`Camera ${index+1} canvas stays inside its stage/card at ${dimensions}: ${JSON.stringify(card)}`);
    assert(card.imageWidth<=card.cardWidth+1&&card.imageHeight<=card.cardHeight+1,`Camera ${index+1} displayed image coverage cannot escape its card at ${dimensions}`);
    assert(card.headerVisible,`Camera ${index+1} header is not occluded by image canvas at ${dimensions}`);
  }
  assert(layout.headerVisible,`BV modal header must not be covered by an escaped canvas at ${dimensions}`);
  assert(layout.closeVisible,`BV close button must be visible and hit-testable at ${dimensions}`);
}

async function checkCanvasPopupLayout(viewer,dimensions){
  const layout=await viewer.evaluate(`(()=>{
    const popup=document.querySelector('.canvasPopupWindow'),area=popup.querySelector('.canvasPopupImageArea'),stage=popup.querySelector('.canvasPopupStage'),host=popup.querySelector('.canvasPopupHost');
    const box=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const bounds=box(popup),stageBox=box(stage),hostBox=box(host),areaBox=box(area);
    const visible=element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1&&r.left>=bounds.left-1&&r.right<=bounds.right+1;};
    const scroll=Array.from(popup.querySelectorAll('.canvasPopupBody,.canvasPopupSidebar,.canvasPopupIdentity,.canvasPopupFacts,.canvasPopupDefectSection,.canvasPopupImageArea,.canvasPopupStage')).map(element=>({class:element.className,width:element.clientWidth,height:element.clientHeight,scrollWidth:element.scrollWidth,scrollHeight:element.scrollHeight}));
    const close=popup.querySelector('.canvasPopupHeader button'),r=close.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return {bounds,areaBox,stageBox,hostBox,scroll,tools:box(host.querySelector('.canvasTools')),ratio:Number(popup.style.getPropertyValue('--canvas-popup-ratio')),background:getComputedStyle(area).backgroundColor,backgroundImage:getComputedStyle(area).backgroundImage,viewport:{width:innerWidth,height:innerHeight},facts:popup.querySelector('.canvasPopupFacts').textContent,identity:popup.querySelector('.canvasPopupIdentity').textContent,identityTitle:popup.querySelector('.canvasPopupIdentity>div:last-child strong').title,factsVisible:Array.from(popup.querySelectorAll('.canvasPopupFacts>div,.canvasPopupIdentity>div')).every(visible),channelsVisible:Array.from(popup.querySelectorAll('.canvasPopupChannels button')).every(visible),closeVisible:visible(close)&&(hit===close||close.contains(hit)),draw:window.__qaDrawCalls.at(-1)};
  })()`);
  const label=`${viewer.classic?'Classic':'Modern'} ${dimensions.join('×')}`;
  assert(layout.bounds.left>=0&&layout.bounds.top>=0&&layout.bounds.right<=layout.viewport.width+1&&layout.bounds.bottom<=layout.viewport.height+1,`Expanded viewer fits viewport at ${label}: ${JSON.stringify(layout.bounds)}`);
  for(const region of layout.scroll){
    assert(region.width>0&&region.height>0,`${region.class} must have real space at ${label}`);
    assert(region.scrollWidth<=region.width+1&&region.scrollHeight<=region.height+1,`No scrollbar or clipped overflowing contents in ${region.class} at ${label}: ${JSON.stringify(region)}`);
  }
  assert(layout.facts.includes('Inference time')&&layout.facts.replace(/\s+/g,'').includes('Position5'),`Complete lens facts at ${label}`);
  assert(layout.identity.includes('live inspection')&&layout.identityTitle===sampleRows.live[4].base_name,`Full long lens identity remains available at ${label}`);
  assert(layout.factsVisible&&layout.channelsVisible&&layout.closeVisible,`Facts, illumination controls and Close remain visible at ${label}`);
  assert((layout.tools.width<=400&&layout.tools.height<=72)||(layout.tools.width<=72&&layout.tools.height<=400),`Image toolbar is compact instead of obscuring the preview at ${label}: ${JSON.stringify(layout.tools)}`);
  assert(Math.abs(layout.stageBox.width-layout.hostBox.width)<=1&&Math.abs(layout.stageBox.height-layout.hostBox.height)<=1,`Canvas fills its stage without outer host panels at ${label}`);
  assert(Math.abs(layout.stageBox.width/layout.stageBox.height-layout.ratio)<.02,`Canvas stage preserves its configured image aspect ratio at ${label}`);
  const hasHorizontalGutters=layout.areaBox.width-layout.stageBox.width>4;
  assert(!hasHorizontalGutters||layout.background!=='rgb(0, 0, 0)'||layout.backgroundImage!=='none',`Outer unused area is not rendered as black side panels at ${label}`);
  assert(layout.draw&&Math.abs(layout.draw.width/layout.draw.height-4/3)<.001,`Inspection image retains its 4:3 aspect ratio at ${label}`);
  return {mode:viewer.classic?'Classic':'Modern',viewport:dimensions.join('×'),popup:layout.bounds,stage:layout.stageBox};
}

(async () => {
  chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { env: { ...process.env, TMPDIR: '/tmp' }, stdio: 'ignore' });
  let version;
  for (let attempt = 0; attempt < 60; attempt++) { try { version = await fetch(`http://127.0.0.1:${port}/json/version`).then(response => response.json()); break; } catch { await pause(100); } }
  assert(version, 'Chrome debugging endpoint unavailable');
  browser = connect(version.webSocketDebuggerUrl); await browser.ready;
  const classic = await makeViewer(true); await checkPosition(classic, 5); await openWt(classic);
  const modern = await makeViewer(false); await checkPosition(modern, 5);
  for (const viewer of viewers) {
    await waitFor(viewer, 'window.__qaDraws.includes(640)', 'full-resolution canvas upgrade');
    assert(await viewer.evaluate('window.__qaDraws.includes(160)'), 'Canvas must draw a fast thumbnail before the delayed full-resolution image');
    await waitFor(viewer, `Array.from(document.querySelectorAll('.referenceInfoRow')).some(row=>row.innerText.includes('Width Px')&&row.innerText.includes('640 px'))`, 'actual image width fallback');
    await waitFor(viewer, `Array.from(document.querySelectorAll('.referenceInfoRow')).some(row=>row.innerText.includes('Height Px')&&row.innerText.includes('480 px'))`, 'actual image height fallback');
    for(const label of ['Dark Field','Diffuse','Phase Contrast','Telecentric']){
      const changed=await viewer.evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.channelTabs button')).find(button=>button.textContent.includes(${JSON.stringify(label)}));if(!button)return false;window.__qaOverlays=0;button.click();return true;})()`);
      // Channel labels are configurable; test every available matching entry.
      if(changed)await waitFor(viewer,'window.__qaOverlays>0',`registered defect overlays on ${label}`);
    }
  }
  for (const viewer of viewers) assert.equal((await inspect(viewer)).mode, 'AUTO', 'Backend mode must override stale local upload policy');
  for(const viewer of viewers)await checkPinchDoesNotSelect(viewer);
  reports.push({case:'two-touch pinch with stationary finger over defect does not select on final release'});
  reports.push({ case: 'independent profiles late join + backend-authoritative mode', classic: await inspect(classic), modern: await inspect(modern) });
  await classic.evaluate(`Array.from(document.querySelectorAll('.inspectionLogTabs button')).find(button=>button.textContent.trim()==='Trend statistics').click()`);
  for(const viewer of viewers){
    assert(await viewer.evaluate(`!document.querySelector('.productionTrend select')`),'Dashboard trend has no time filter');
    assert(await viewer.evaluate(`!Array.from(document.querySelectorAll('.inspectionLogTabs button,.trendOuterTabs button')).some(button=>button.textContent.trim()==='Trend Line')`),'Bottom workspace does not contain Trend Line');
    assert(await viewer.evaluate(`!!document.querySelector('.dashboardYieldDefects')`),'Dashboard uses the filled yield diagram');
    assert(await viewer.evaluate(`(()=>{const gauge=document.querySelector('.dashboardYield'),label=gauge.querySelector(':scope > span'),style=getComputedStyle(label),r=gauge.getBoundingClientRect();return style.backgroundColor==='rgba(0, 0, 0, 0)'&&style.borderTopWidth==='0px'&&Math.abs(r.width-r.height)<1})()`),'Yield is circular, with no rectangular label background covering its ring');
  }
  await openWt(classic);
  reports.push({case:'Bottom Trend Line removed in both layouts; refreshed yield gauge and no time filter'});
  if(process.env.CANVAS_POPUP_QA_ONLY==='1'){
    const popupReports=[];
    const screenshotDirectory=process.env.CANVAS_POPUP_SCREENSHOT_DIR;
    if(screenshotDirectory)fs.mkdirSync(screenshotDirectory,{recursive:true});
    for(const viewer of [classic,modern]){
      const beforeOpenZoom=await viewer.evaluate(`parseInt(document.querySelector('.canvasHost .canvasZoomControl output').textContent,10)`);
      await viewer.evaluate(`document.querySelector('button[aria-label="Open expanded viewer"]').click()`);
      await waitFor(viewer,`!!document.querySelector('.canvasPopupSidebar')`,'canvas information sidebar');
      await pause(300);
      assert(Math.abs(await viewer.evaluate(`parseInt(document.querySelector('.canvasPopupHost .canvasZoomControl output').textContent,10)`)-beforeOpenZoom)<=1,'Opening expanded viewer preserves image zoom');
      for(const dimensions of [[1920,1080],[1366,768],[1280,720],[1024,768]]){
        await viewer.cdp.send('Emulation.setDeviceMetricsOverride',{width:dimensions[0],height:dimensions[1],deviceScaleFactor:1,mobile:false});
        await pause(350);
        if(screenshotDirectory){const shot=await viewer.cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDirectory,`canvas-popup-${viewer.classic?'classic':'modern'}-${dimensions.join('x')}.png`),Buffer.from(shot.data,'base64'));}
        popupReports.push(await checkCanvasPopupLayout(viewer,dimensions));
        const seenDefects=new Set();
        for(let page=0;page<20;page++){
          for(const index of await viewer.evaluate(`Array.from(document.querySelectorAll('.canvasPopupDefectSection button[data-defect-index]')).map(button=>Number(button.dataset.defectIndex))`))seenDefects.add(index);
          const nextAvailable=await viewer.evaluate(`(()=>{const next=document.querySelector('button[aria-label="Next defect page"]');return !!next&&!next.disabled})()`);
          if(!nextAvailable)break;
          await viewer.evaluate(`document.querySelector('button[aria-label="Next defect page"]').click()`);
          await pause(50);
        }
        assert.equal(seenDefects.size,canvasPopupDefects.length,`All ${canvasPopupDefects.length} defects remain accessible without scrolling at ${dimensions}`);
        await checkCanvasPopupLayout(viewer,dimensions);
        for(let page=0;page<20;page++){
          const previousAvailable=await viewer.evaluate(`(()=>{const previous=document.querySelector('button[aria-label="Previous defect page"]');return !!previous&&!previous.disabled})()`);
          if(!previousAvailable)break;
          await viewer.evaluate(`document.querySelector('button[aria-label="Previous defect page"]').click()`);
          await pause(30);
        }
        await viewer.evaluate(`document.querySelector('.canvasPopupHost [aria-label="Fit image"]').click()`);
        await pause(150);
        assert(await viewer.evaluate(`(()=>{const host=document.querySelector('.canvasPopupHost').getBoundingClientRect(),draw=window.__qaDrawCalls.at(-1);return draw.x>=-1&&draw.y>=-1&&draw.x+draw.width<=host.width+1&&draw.y+draw.height<=host.height+1})()`),'Fit keeps the complete image visible without cropping');
        if(screenshotDirectory){const shot=await viewer.cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDirectory,`canvas-popup-${viewer.classic?'classic':'modern'}-${dimensions.join('x')}.png`),Buffer.from(shot.data,'base64'));}
      }
      const initialZoom=await viewer.evaluate(`parseInt(document.querySelector('.canvasPopupHost .canvasZoomControl output').textContent,10)`);
      await viewer.evaluate(`document.querySelector('.canvasPopupHost [aria-label="Zoom in"]').click()`);
      await pause(150);
      const zoomed=await viewer.evaluate(`parseInt(document.querySelector('.canvasPopupHost .canvasZoomControl output').textContent,10)`);
      assert(zoomed>initialZoom,'Expanded image zoom controls still work');
      await viewer.evaluate(`document.querySelector('.canvasPopupHost [aria-label="Zoom out"]').click()`);
      await pause(150);
      assert(await viewer.evaluate(`parseInt(document.querySelector('.canvasPopupHost .canvasZoomControl output').textContent,10)`)<zoomed,'Expanded image can zoom back out');
      const dragPoint=await viewer.evaluate(`(()=>{const r=document.querySelector('.canvasPopupHost').getBoundingClientRect();return {x:r.left+r.width*.45,y:r.top+r.height*.4,draw:window.__qaDrawCalls.at(-1)}})()`);
      await viewer.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:dragPoint.x,y:dragPoint.y,button:'left',clickCount:1});
      await viewer.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:dragPoint.x+35,y:dragPoint.y+20,button:'left',buttons:1});
      await viewer.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:dragPoint.x+35,y:dragPoint.y+20,button:'left',clickCount:1});
      await pause(150);
      assert(await viewer.evaluate(`(()=>{const draw=window.__qaDrawCalls.at(-1);return Math.abs(draw.x-${dragPoint.draw.x})>1||Math.abs(draw.y-${dragPoint.draw.y})>1})()`),'Expanded image retains drag-to-pan behavior');
      await viewer.evaluate(`document.querySelector('.canvasPopupDefectSection button[data-defect-index]').click()`);
      await waitFor(viewer,`!!document.querySelector('.canvasPopupDefectSection button[data-defect-index][aria-pressed="true"]')`,'sidebar defect selection');
      assert(await viewer.evaluate(`!document.querySelector('.canvasPopupHost [aria-label="Focus selected defect"]').disabled`),'Selected defect can be focused in the viewer');
      await viewer.evaluate(`document.querySelector('.canvasPopupDefectSection button[data-defect-index][aria-pressed="true"]').click()`);
      await waitFor(viewer,`!document.querySelector('.canvasPopupDefectSection button[data-defect-index][aria-pressed="true"]')`,'sidebar defect selection clears');
      await viewer.evaluate(`document.querySelector('.canvasPopupOverlayToggle').click()`);
      assert(await viewer.evaluate(`document.querySelector('.canvasPopupOverlayToggle').getAttribute('aria-pressed')==='false'`),'Defect overlays can be hidden');
      await viewer.evaluate(`document.querySelector('.canvasPopupOverlayToggle').click()`);
      await viewer.evaluate(`document.querySelector('.canvasPopupChannels button:not(.canvasPopupOverlayToggle):not([aria-pressed="true"])').click()`);
      await waitFor(viewer,`!!document.querySelector('.canvasPopupChannels button:not(.canvasPopupOverlayToggle)[aria-pressed="true"]')`,'popup illumination switching');
      await viewer.evaluate(`document.querySelector('.canvasPopupHeader button').click()`);
      await waitFor(viewer,`!document.querySelector('.canvasPopupWindow')`,'canvas popup closes');
      await viewer.cdp.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
      await viewer.evaluate(`document.querySelector('button[aria-label="Open expanded viewer"]').click()`);
      await waitFor(viewer,`!!document.querySelector('.canvasPopupWindow')`,'popup reopens');
      await viewer.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await viewer.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await waitFor(viewer,`!document.querySelector('.canvasPopupWindow')`,'Escape closes popup');
    }
    assert.deepEqual(classic.errors,[]);assert.deepEqual(modern.errors,[]);
    assert.deepEqual(classic.mutations,[]);assert.deepEqual(modern.mutations,[]);
    console.log(JSON.stringify({passed:['Classic and Modern no-scroll canvas/sidebar at four screen sizes','Complete lens information and usable controls','Image aspect ratio and Fit','Zoom/pan','Sidebar defect selection','Illumination/overlay switching','Close and Escape restore dashboard'],layouts:popupReports,browserErrors:0,realMutations:0},null,2));return;
  }
  if(process.env.TREND_GALLERY_QA_ONLY==='1'){
    await classic.evaluate(`document.querySelector('button[aria-label="Open Trend Line"]').click()`);
    await waitFor(classic,`!!document.querySelector('.trendViewTabs')`,'trend popup');
    await classic.evaluate(`Array.from(document.querySelectorAll('.trendViewTabs button')).find(button=>button.textContent==='Defects').click()`);
    await classic.evaluate(`(()=>{const select=document.querySelector('select[aria-label="Trend time range"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'all');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(classic,`!!document.querySelector('.defectClassButton')`,'defect classes');
    await classic.evaluate(`document.querySelector('.defectClassButton').click()`);
    await waitFor(classic,`document.querySelectorAll('.defectGalleryPreview img').length>=4`,'all illuminations');
    assert(await classic.evaluate(`!document.querySelector('.defectGalleryOverlay')`),'Raw default has no annotations');
    await classic.evaluate(`Array.from(document.querySelectorAll('.defectGalleryMode button')).find(button=>button.textContent==='Defects').click()`);
    await waitFor(classic,`document.querySelectorAll('.defectGalleryOverlay rect').length===document.querySelectorAll('.defectGalleryPreview img').length`,'all illumination boxes');
    assert(await classic.evaluate(`document.querySelectorAll('.defectGalleryOverlay text').length===document.querySelectorAll('.defectGalleryPreview img').length`),'Every illumination has defect labels');
    await classic.evaluate(`Array.from(document.querySelectorAll('.defectGalleryMode button')).find(button=>button.textContent==='Raw').click()`);
    assert(await classic.evaluate(`!document.querySelector('.defectGalleryOverlay')`),'Raw toggle removes overlays');
    assert.deepEqual(classic.errors,[]);assert.deepEqual(classic.mutations,[]);
    console.log(JSON.stringify({passed:['Raw default','All four illumination overlays and labels','Raw toggle restores originals'],browserErrors:0,realMutations:0},null,2));return;
  }
  if(process.env.IMAGE_FILTER_QA_ONLY==='1'){
    imageFilterFixtures=true;
    imageFilterSettings={...imageFilterSettings,storage_path:'optimization',storage_mode:'total',image_count:2,storage_information:'',recurring:{enabled:false,start_date:'',start_time:'09:00',interval_enabled:false,interval_minutes:30,pattern:'daily',every_n:1,weekdays:[0,1,2,3,4],end_mode:'never',end_date:'',end_after_events:2}};
    const click=async(selector,text)=>classic.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(button=>button.textContent.includes(${JSON.stringify(text)})).click()`);
    const input=async(selector,value)=>classic.evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await click('button','Image Filter');
    await waitFor(classic,`document.querySelectorAll('.positionFilterGrid button').length===16`,'WT positions load');
    await click('.filterSectionTitle button','Deactivate all');
    await classic.evaluate(`document.querySelectorAll('.positionFilterGrid button')[1].click()`);
    await click('.filterActionBar button','Save');
    await waitFor(classic,`document.querySelector('.filterActionBar')?.textContent.includes('configuration saved')`,'save selected WT position');
    assert.deepEqual(imageFilterSettings.positions,[2]);
    await click('.filterStepBar button','Storage mode');
    await click('.storageModeGrid button','Per position');
    await classic.evaluate(`document.querySelector('button[title="Browse folders on the backend PC"]').click()`);
    await waitFor(classic,`!!document.querySelector('.filterPickerDialog .filterFolderList button')`,'destination popup');
    assert(await classic.evaluate(`document.querySelector('.filterPickerDialog').getAttribute('role')==='dialog'`));
    await pause(250);
    assert(await classic.evaluate(`(()=>{const r=document.querySelector('.filterPickerDialog').getBoundingClientRect();return r.height===560&&r.width===640&&r.bottom<=innerHeight&&r.right<=innerWidth})()`),'Folder picker has stable dimensions and fits the viewport');
    await click('.filterPickerDialog button','Use this folder');
    await input('.storageFields textarea','Image filter QA');
    await click('.filterActionBar .filterPrimary','Start storage');
    await waitFor(classic,`document.querySelector('.filterActionBar .filterPrimary')?.textContent.includes('Stop storage')`,'storage starts');
    assert.equal(imageFilterSettings.storage_mode,'per-position');assert.equal(imageFilterSettings.storage_path,'/fixture/images');
    assert(await classic.evaluate(`document.querySelector('.storageFields input[readonly]').value==='8 maximum (4 channels)'`),'Per-position estimate respects selected positions and four camera images');
    await click('.filterActionBar .filterPrimary','Stop storage');
    await waitFor(classic,`document.querySelector('.filterActionBar .filterPrimary')?.textContent.includes('Start storage')`,'storage stops');
    await input('.storageFields textarea','Schedule QA');
    await click('.filterStepBar button','Schedule');
    await classic.evaluate(`document.querySelector('.scheduleMaster input[type=checkbox]').click()`);
    await classic.evaluate(`document.querySelector('.scheduleCards .filterDateTrigger').click()`);
    await pause(250);
    const calendarHeight=await classic.evaluate(`document.querySelector('.filterPickerDialog').getBoundingClientRect().height`);
    await input('.filterCalendar input[aria-label=Year]','2099');
    await classic.evaluate(`(()=>{const select=document.querySelector('.filterCalendar select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'0');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await classic.evaluate(`document.querySelector('.filterCalendar button[aria-label="2099-01-01"]').click()`);
    assert(Math.abs(await classic.evaluate(`document.querySelector('.filterPickerDialog').getBoundingClientRect().height`)-calendarHeight)<1,'Calendar dimensions do not change between months');
    await click('.filterPickerDialog button','Apply date');
    await classic.evaluate(`document.querySelectorAll('.scheduleCards .filterDateTrigger')[1].click()`);
    await waitFor(classic,`!!document.querySelector('.filterTimePicker')`,'time picker');
    await click('.filterPickerDialog button','Apply time');
    await click('.filterActionBar button','Save');
    await waitFor(classic,`document.querySelector('.filterActionBar')?.textContent.includes('configuration saved')`,'schedule saves');
    assert.equal(filterStorageRuntime.schedule_key,'','Saving must not arm automation');
    await click('.filterActionBar .filterPrimary','Arm schedule');
    await waitFor(classic,`document.querySelector('.filterActionBar')?.textContent.includes('Scheduled storage armed')`,'automation arms');
    assert.equal(filterStorageRuntime.active,false);assert.equal(filterStorageRuntime.schedule_key,'armed-fixture');
    await click('.filterActionBar button','Close');
    await click('button','Dataset');
    await waitFor(classic,`!!document.querySelector('.uploadModalWindow')`,'dataset popup');
    await click('.uploadModalWindow button','Browse server');
    await waitFor(classic,`!!document.querySelector('.filterFolderList button')`,'shared dataset folder picker');
    await click('.filterPickerDialog button','Use this folder');
    assert(await classic.evaluate(`document.querySelector('.uploadModalWindow .modalInline input').value==='/fixture/images'`),'Upload dataset receives selected backend path without loading it prematurely');
    assert(await classic.evaluate(`!document.querySelector('.filterPickerDialog')`),'Folder picker closes after selection');
    assert.deepEqual(classic.errors,[]);assert.deepEqual(classic.mutations,[]);
    console.log(JSON.stringify({passed:['WT position selection and persistence','backend destination browser','per-position counting estimate','manual start/stop','save versus arm schedule'],fixtureWrites:imageFilterWrites.length,browserErrors:0,realMutations:0},null,2));
    return;
  }
  if(process.env.DASHBOARD_YIELD_QA_IMAGE){
    await classic.evaluate(`Array.from(document.querySelectorAll('.inspectionLogTabs button')).find(button=>button.textContent.trim()==='Trend statistics').click()`);
    await pause(100);
    const bounds=await classic.evaluate(`(()=>{const r=document.querySelector('.dashboardYield').getBoundingClientRect();return {x:r.x-10,y:r.y-10,width:r.width+20,height:r.height+20,scale:3}})()`);
    const capture=await classic.cdp.send('Page.captureScreenshot',{format:'png',clip:bounds});
    fs.writeFileSync(process.env.DASHBOARD_YIELD_QA_IMAGE,Buffer.from(capture.data,'base64'));
    await openWt(classic);
  }
  if(process.env.DASHBOARD_STATS_QA_ONLY==='1'){
    for(const viewer of viewers){assert.deepEqual(viewer.errors,[]);assert.deepEqual(viewer.mutations,[]);}
    console.log(JSON.stringify({passed:reports,browserErrors:0,apiMutations:0},null,2));
    return;
  }
  delayedThumbnail='live-8';
  await advance(8);await pause(150);
  for(const viewer of viewers){
    await checkPosition(viewer,5);
    assert.equal((await inspect(viewer)).images,5,'WT View must retain the presented frame while the next preview is decoding');
  }
  await Promise.all(viewers.map(viewer => checkPosition(viewer, 8)));
  for(const viewer of viewers)assert(await viewer.evaluate(`window.__qaLastCanvasPreview.includes('sampleId=live-8')`),'Canvas must already have painted the same frame as the newly selected history position');
  delayedThumbnail='';
  reports.push({case:'Canvas, WT View and WT History advance together after delayed thumbnail decode'});
  fixtureLogs=[{time:new Date().toISOString(),level:'INFO',message:'Live fixture inspection message'}];
  await classic.evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='System messages').click()`);
  await waitFor(classic,`document.querySelector('.referenceMessageRows')?.textContent.includes('Live fixture inspection message')`,'system messages refresh during an active job');
  await openWt(classic);
  reports.push({case:'System messages refresh without waiting for job completion'});
  await classic.evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Dataset').click()`);
  await waitFor(classic,`!!document.querySelector('.uploadSourceSelector')`,'dataset source selector');
  await classic.evaluate(`Array.from(document.querySelectorAll('.uploadModalWindow button')).find(button=>button.textContent.includes('Browse server')).click()`);
  await waitFor(classic,`document.querySelector('.filterFolderList')?.textContent.includes('Inspection set')`,'backend folder popup');
  await classic.evaluate(`document.querySelector('.filterPickerDialog button[aria-label="Close picker"]').click()`);
  assert(await classic.evaluate(`(()=>{const element=document.querySelector('.uploadModalWindow'),r=element.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(document.querySelector('.uploadSourceSelector')).display==='grid'})()`),'Dataset popup and source options fit the viewport');
  if(process.env.UPLOAD_QA_SCREENSHOT){const capture=await classic.cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.UPLOAD_QA_SCREENSHOT,Buffer.from(capture.data,'base64'));}
  await classic.evaluate(`document.querySelector('.uploadModalWindow .modalClose').click()`);
  reports.push({case:'Theme-matched dataset popup and direct folder browser fit viewport'});
  await modern.cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(modern, '!!document.querySelector(".viewerPositionPill")', 'reload hydration');
  await modern.evaluate(`window.__qaBroadcast(${JSON.stringify(snapshot)})`); await checkPosition(modern, 8);
  await applyAppearance(modern);
  for (let position = 9; position <= 16; position++) await advance(position);
  await Promise.all(viewers.map(viewer => checkPosition(viewer, 16)));
  await advance(17); await Promise.all(viewers.map(viewer => checkPosition(viewer, 1, 'WT 3')));
  await openWt(classic); await pause(150);
  assert.equal((await inspect(classic)).images, 1, 'Next tray must reset and show only its first inferred thumbnail');
  assert.equal((await inspect(modern)).images, 1, 'Modern next tray must reset and show only its first inferred thumbnail');
  const rates=await modern.evaluate(`Array.from(document.querySelectorAll('.inspectionStackedBar>i')).map(bar=>Number.parseFloat(bar.style.width))`);
  assert.equal(rates.length,3,'Selected-dataset composition has three status bars');
  assert(Math.abs(rates.reduce((sum,rate)=>sum+rate,0)-100)<.001,'Status distribution must sum to 100% independently of rolling global yield');
  const selectedOk=snapshot.results.filter(row=>row.status==='OK').length/snapshot.results.length*100;
  assert(Math.abs(rates[0]-selectedOk)<.001,'OK distribution uses the same selected-dataset denominator as NOK/WARN');
  reports.push({case:'rolling yield stays separate from selected-dataset status composition',rates});
  reports.push({ case: 'reload + tray16 rollover', classic: await inspect(classic), modern: await inspect(modern) });
  imageFilterSettings={...imageFilterSettings,positions:[16],apply_to_display:true};
  for(const viewer of viewers)await viewer.evaluate(`window.dispatchEvent(new Event('lens-image-filter-changed'))`);
  await Promise.all(viewers.map(viewer=>checkPosition(viewer,1,'WT 3')));
  await advance(18);
  for(const viewer of viewers){
    await checkPosition(viewer,2,'WT 3');
    assert(await viewer.evaluate(`window.__qaLastCanvasPreview.includes('sampleId=live-18')`),'Restrictive position filter must not freeze the actual live canvas frame');
    await checkGallery(viewer,['live-17','live-18'],'live gallery follows the same tray as the canvas despite idle review filters');
  }
  snapshot={...snapshot,sequence:snapshot.sequence+1,job:{...snapshot.job,status:'completed'}};
  await broadcast({type:'completed',stream_id:snapshot.stream_id,sequence:snapshot.sequence,current_job_id:snapshot.current_job_id,job:snapshot.job});
  for(const viewer of viewers){await checkPosition(viewer,2,'WT 3');await checkGallery(viewer,['live-17','live-18'],'latest frame and tray remain synchronized after completion');}
  reports.push({case:'Restrictive idle display filter cannot freeze live canvas; canvas, history and WT stay synchronized through completion'});
  imageFilterSettings={...imageFilterSettings,positions:Array.from({length:16},(_,index)=>index+1),apply_to_display:false};
  for(const viewer of viewers)await viewer.evaluate(`window.dispatchEvent(new Event('lens-image-filter-changed'))`);
  await Promise.all(viewers.map(viewer=>checkPosition(viewer,2,'WT 3')));
  const prior = structuredClone(snapshot);
  snapshot = { ...snapshot, sequence: snapshot.sequence + 1, current_job_id: 'job-b', job: makeJob('job-b', 0, 'queued'), results: [] };
  await broadcast({ type: 'started', stream_id: snapshot.stream_id, sequence: snapshot.sequence, current_job_id: 'job-b', job: snapshot.job });
  await Promise.all(viewers.map(viewer => checkPosition(viewer, 1, 'WT 2'))); await openWt(classic);
  await waitFor(classic, `document.querySelector('.inspectionWtGallery')?.querySelectorAll('img').length===0`, 'same-dataset rerun resets stale previews');
  await waitFor(modern, `document.querySelector('.oakTrayStrip')?.querySelectorAll('img').length===0`, 'Modern rerun resets stale previews');
  await broadcast(prior); await pause(150);
  assert.equal((await inspect(classic)).images, 0, 'Stale snapshot must not resurrect prior job results');
  await advance(1, 'job-b', 'b'); await advance(2, 'job-b', 'b');
  await Promise.all(viewers.map(viewer => checkPosition(viewer, 2)));
  delayedLive = { value: structuredClone(snapshot), delay: 800, used: false };
  await classic.evaluate('window.dispatchEvent(new Event("online"))');
  await pause(100); await advance(3, 'job-b', 'b');
  await checkPosition(classic, 3); await pause(1000);
  assert((await inspect(classic)).position.replace(/\s+/g, ' ').includes('Position 3 / 16'), 'Delayed stale REST must not undo a newer streamed frame');
  delayedLive = null;
  reports.push({ case: 'same dataset rerun + stale snapshot', classic: await inspect(classic), modern: await inspect(modern) });
  await classic.evaluate(`document.querySelector('.historyTable button[aria-label^="WT 1 position 1 "]').click()`);
  await checkPosition(classic,3,'WT 2');
  reports.push({case:'Automatic inspection stays on the latest completed frame when history is clicked'});
  classic.forceMode='SETUP';
  await classic.evaluate(`window.dispatchEvent(new Event('lens-system-changed'))`);
  await waitFor(classic,`localStorage.getItem('lens-operation-mode')==='MANUAL'`,'Manual mode permits held historical inspection');
  await classic.evaluate(`document.querySelector('.historyTable button[aria-label^="WT 1 position 1 "]').click()`);
  await checkPosition(classic, 1, 'WT 1');
  assert.equal((await inspect(classic)).sockets, 1, 'Historical selection must not close the global observer');
  await advance(4, 'job-b', 'b'); await checkPosition(classic, 1, 'WT 1');
  assert.equal((await inspect(classic)).mode,'MANUAL','Manual history selection preserves review mode without stopping the observer');
  await checkGallery(classic,['live-1','live-2','live-3','live-4'],'held historic lens does not freeze live WT gallery');
  snapshot = { ...snapshot, sequence: snapshot.sequence + 1, job: { ...snapshot.job, status: 'completed' } };
  await broadcast({ type: 'completed', stream_id: snapshot.stream_id, sequence: snapshot.sequence, current_job_id: 'job-b', job: snapshot.job });
  await checkPosition(classic,1,'WT 1');
  await checkGallery(classic,['live-1','live-2','live-3','live-4'],'completion does not revert gallery to held historical tray');
  await classic.evaluate(`document.querySelector('.historyTable button[aria-label^="WT 1 position 1 "]').click()`);
  await checkPosition(classic, 1, 'WT 1');
  await checkGallery(classic,sampleRows.old.map(sample=>sample.id),'explicit idle history selection opens the selected historical tray');
  await broadcast({ type: 'heartbeat', stream_id: snapshot.stream_id, sequence: snapshot.sequence });
  await pause(250); assert((await inspect(classic)).selected.startsWith('WT 1 position 1'), 'Idle heartbeats must preserve historical selection');
  reports.push({ case: 'active history selection keeps observer + idle history preserved', classic: await inspect(classic) });
  manualInspectionFixtures=true;
  for(const viewer of viewers){
    await viewer.evaluate(`document.querySelector('.historyTable button[aria-label^="WT 1 position 1 "]').click()`);
    await checkPosition(viewer,1,'WT 1');
    await viewer.evaluate(`Array.from(document.querySelectorAll('button')).find(button=>['Inspect selected','Open in Viewer'].includes(button.textContent.trim())).click()`);
    await waitFor(viewer,`Array.from(document.querySelectorAll('.referenceInfoRow')).some(row=>row.innerText.includes('Inference time')&&row.innerText.includes('78.901 ms'))`,'manual reinspection updates the held inference timing');
    await waitFor(viewer,`(document.querySelector('.inspectionDefectList')||document.querySelector('.oakDefectList'))?.textContent.includes('Manual regression defect')`,'manual reinspection updates held defects');
    assert(await viewer.evaluate(`Array.from(document.querySelectorAll('.referenceInfoRow')).some(row=>row.innerText.includes('Result')&&row.innerText.includes('NOK'))`),'Held lens shows the new manual result');
    await viewer.evaluate(`document.querySelector('.viewerHoldControl')?.click()`);
  }
  manualInspectionFixtures=false;
  assert.equal(manualFixtureWrites.length,2,'Exactly two isolated manual inspections are intercepted');
  reports.push({case:'manual reinspection updates result, defects and exact timing of held lens in both modes'});
  delete classic.forceMode;
  await classic.evaluate(`window.dispatchEvent(new Event('lens-system-changed'))`);
  await waitFor(classic,`localStorage.getItem('lens-operation-mode')==='AUTO'`,'Restore automatic mode after manual hold test');
  // Standalone Inspect Selected is also shared: retain the other positions,
  // append the newly inspected lens last, and follow it in all idle viewers.
  snapshot = { ...snapshot, sequence: snapshot.sequence + 1, current_job_id: 'single-job',
    job: makeJob('single-job', 3, 'completed'),
    results: [result('live', 1, 'b'), result('live', 3, 'b'), { ...result('live', 2, 'b'), created_at: '2026-10-05T10:00:02Z' }] };
  await broadcast(snapshot);
  await Promise.all(viewers.map(viewer => checkPosition(viewer, 2, 'WT 2')));
  await openWt(classic);
  for (const viewer of viewers) {
    await waitFor(viewer, `(document.querySelector('.inspectionWtGallery')||document.querySelector('.oakTrayStrip'))?.querySelectorAll('img').length===3`, 'standalone inspection preserves three result thumbnails');
    assert.equal((await inspect(viewer)).mode, 'AUTO', 'Standalone live follow must preserve authoritative backend mode');
  }
  reports.push({ case: 'idle standalone Inspect Selected is shared across profiles', classic: await inspect(classic), modern: await inspect(modern) });
  snapshot = { ...snapshot, sequence: snapshot.sequence + 1, current_job_id: 'job-c', job: makeJob('job-c', 0, 'queued'), results: [] };
  await broadcast({ type: 'started', stream_id: snapshot.stream_id, sequence: snapshot.sequence, current_job_id: 'job-c', job: snapshot.job });
  await Promise.all(viewers.map(viewer => checkPosition(viewer, 1, 'WT 2')));
  delayedLive = { value: structuredClone(snapshot), delay: 1500, used: false };
  await classic.evaluate('window.__qaDisconnect()');
  await pause(100); await advance(1, 'job-c', 'b'); await advance(2, 'job-c', 'b');
  await modern.evaluate('window.__qaDisconnect()');
  await Promise.all(viewers.map(viewer => checkPosition(viewer, 2)));
  reports.push({ case: 'blocked websocket polling fallback + delayed REST recovery', classic: await inspect(classic), modern: await inspect(modern) });
  sampleRows.fresh = makeSamples('fresh', 18);
  datasets.push({ ...datasets[1], id: 'fresh', name: 'fresh inspection', sample_count: 18, image_count: 72, created_at: '2026-10-05T03:00:00Z' });
  snapshot = { ...snapshot, sequence: snapshot.sequence + 1, current_job_id: 'job-fresh', job: { ...makeJob('job-fresh', 2), dataset_id: 'fresh', total: 18 }, results: [result('fresh', 1), result('fresh', 2)] };
  await Promise.all(viewers.map(viewer => checkPosition(viewer, 2, 'WT 4')));
  reports.push({ case: 'new dataset is discovered without reload on polling observers', classic: await inspect(classic), modern: await inspect(modern) });
  snapshot = { ...snapshot, sequence: snapshot.sequence + 1, current_job_id: null, job: null, results: [] };
  const idle = await makeViewer(true);
  assert(await idle.evaluate('document.querySelectorAll(".historyTable tbody tr").length>0'), 'Initial idle snapshot must not cancel historical catalog hydration');
  await idle.evaluate(`document.querySelector('.historyTable button[aria-label^="WT 1 position 1 "]').click()`);
  await checkPosition(idle, 1, 'WT 1');
  await broadcast({ type: 'heartbeat', stream_id: snapshot.stream_id, sequence: snapshot.sequence });
  await pause(200);
  assert((await inspect(idle)).selected.startsWith('WT 1 position 1'), 'Idle bootstrap heartbeats must not undo explicit history selection');
  reports.push({ case: 'initial idle bootstrap preserves historical dataset loading', idle: await inspect(idle) });
  // Real file-input selection, but every upload/preview request is intercepted.
  // This catches popup/ref/event wiring errors in addition to transport tests.
  setupPreviewFixtures=true;
  const fixtureImage=await require('sharp')({create:{width:1300,height:1000,channels:3,background:'#777'}}).tiff({compression:'none'}).toBuffer();
  assert(fixtureImage.length>3*1024*1024,'TIFF fixture must exercise hosted chunking');
  const filePaths=[1,2,3,4].map(number=>{const filename=path.join(profile,`lens#${number}.tif`);fs.writeFileSync(filename,fixtureImage);return filename;});
  const historyRows=await idle.evaluate('document.querySelectorAll(".historyTable tbody tr").length');
  for(const kind of ['registration','focus']){
    await idle.evaluate(`window.dispatchEvent(new Event('lens-open-${kind}'))`);
    await waitFor(idle,`!!document.querySelector('.${kind}Modal')`,`${kind} popup`);
    const {result:input}=await idle.cdp.send('Runtime.evaluate',{expression:`document.querySelector('.${kind}Modal input[type=file][multiple]')`});
    assert(input.objectId,`${kind} batch input must be available`);
    await idle.cdp.send('DOM.setFileInputFiles',{objectId:input.objectId,files:filePaths});
    const imageSelector=kind==='registration'?'.registrationPreviewFrame img':'.focusCardImage img';
    await waitFor(idle,`Array.from(document.querySelectorAll('${imageSelector}')).filter(image=>image.complete&&image.naturalWidth>0).length===4`,`${kind} four large TIFF previews`,30000);
    if(kind==='focus'){
      assert.equal(await idle.evaluate('document.querySelectorAll(".focusHeads button").length'),2,'Configured head count');
      await idle.evaluate(`Array.from(document.querySelectorAll('.focusTabs button')).find(button=>button.innerText==='Lens').click()`);
      await waitFor(idle,`document.querySelector('.focusPrimary')?.textContent.includes('Run check')`,'lens tab render');
      await idle.evaluate(`document.querySelector('.focusPrimary').click()`);
      await waitFor(idle,`document.querySelector('.focusNotice')?.textContent.includes('complete')||document.querySelector('.focusFooter')?.textContent.includes('complete')`,'null geometric focus results');
      assert(await idle.evaluate(`Array.from(document.querySelectorAll('.focusCompactMetric')).some(row=>row.innerText.includes('Outer diameter')&&row.innerText.includes('—'))`),'Unavailable geometry rendered without a crash');
      assert(await idle.evaluate(`!Array.from(document.querySelector('.focusCameraCard').querySelectorAll('.focusCompactMetric')).some(row=>row.innerText.includes('Brightness'))`),'Channel-disabled metric is hidden');
    }else{
      assert.equal(await idle.evaluate('document.querySelectorAll(".registrationHeadTabs button").length'),2,'Configured registration heads');
      await idle.evaluate(`Array.from(document.querySelectorAll('.registrationActions button')).find(button=>button.innerText==='Switch to Setup').click()`);
      await waitFor(idle,`document.querySelector('.registrationPrimary')&&!document.querySelector('.registrationPrimary').disabled`,'setup registration enabled');
      await idle.evaluate(`document.querySelector('.registrationPrimary').click()`);
      await waitFor(idle,`document.querySelector('.registrationTransformList')?.textContent.includes('µm/px')`,'registration scale estimate and per-head response');
    }
    const shot=await idle.cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),`manual-${kind}-qa.png`),Buffer.from(shot.data,'base64'));
    await idle.evaluate(`document.querySelector('[aria-label="${kind==='focus'?'Close Focus Check':'Close registration'}"]').click()`);
    assert.equal(await idle.evaluate('document.querySelectorAll(".historyTable tbody tr").length'),historyRows,'Setup preview selection must not create inspection trays');
    reports.push({case:`${kind} popup file upload: four TIFFs, automatic matching, no new history`});
  }
  await idle.evaluate(`window.dispatchEvent(new Event('lens-open-bv-test'))`);
  await waitFor(idle,`!!document.querySelector('.bvTestModal')`,'BV Test popup');
  const {result:bvInput}=await idle.cdp.send('Runtime.evaluate',{expression:`document.querySelector('.bvTestModal input[type=file][multiple]:not([webkitdirectory])')`});
  await idle.cdp.send('DOM.setFileInputFiles',{objectId:bvInput.objectId,files:filePaths});
  await waitFor(idle,`document.querySelectorAll('.bvTestImageStage .canvas-ready').length===4`,'four reusable BV canvases',30000);
  assert(await idle.evaluate(`document.querySelector('.bvTestImageCard header').textContent.includes('Telecentric')`),'Correct h channel label');
  assert.equal(await idle.evaluate(`document.querySelector('.bvTestScripts').textContent.includes('TOR')`),false,'No fictional product scripts');
  await idle.evaluate(`document.querySelector('.bvTestEvaluate').click()`);
  await waitFor(idle,`document.querySelector('.bvTestDefects')?.textContent.includes('Surface Imperfection')`,'actual BV defect result',30000);
  await waitFor(idle,`document.querySelectorAll('.bvTestImageStage .canvas-ready').length===4`,'BV returned images ready');
  for(const dimensions of [[1366,768],[1024,768]]){
    await idle.cdp.send('Emulation.setDeviceMetricsOverride',{width:dimensions[0],height:dimensions[1],deviceScaleFactor:1,mobile:false});await pause(150);
    assert(await idle.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),`No BV horizontal overflow at ${dimensions}`);
    await checkBvCanvasContainment(idle,dimensions);
  }
  reports.push({case:'BV camera canvases contained inside their cards, with unoccluded headers and Close button at laptop/tablet sizes'});
  const bvShot=await idle.cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'manual-bv-qa.png'),Buffer.from(bvShot.data,'base64'));
  await idle.evaluate(`document.querySelector('.bvTestImageStage [aria-label="Open expanded viewer"]').click()`);
  await waitFor(idle,`!!document.querySelector('.canvasPopupBackdrop')`,'BV expanded image popup');
  await idle.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await idle.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor(idle,`!document.querySelector('.canvasPopupBackdrop')&&!!document.querySelector('.bvTestModal')`,'Escape closes expanded canvas without closing BV Test');
  reports.push({case:'BV expanded image Escape closes only image viewer, preserving parent test popup'});
  await idle.evaluate(`document.querySelector('.bvTestClose').click()`);
  assert.equal(await idle.evaluate('document.querySelectorAll(".historyTable tbody tr").length'),historyRows,'BV setup evaluation must not add WT history');
  reports.push({case:'BV Test four TIFF reusable canvases, real DSM script entry, shared defect regions, responsive layout and no new history'});
  for (const viewer of viewers) { assert.deepEqual(viewer.mutations, [], 'Observer browsers must never mutate backend/config'); assert.deepEqual(viewer.errors, [], 'No browser runtime errors'); }
  console.log(JSON.stringify({ passed: reports, apiMutations: 0, isolatedSetupFixtureWrites:setupFixtureWrites.length,isolatedManualFixtureWrites:manualFixtureWrites.length,browserErrors: 0 }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  for (const viewer of viewers) viewer.cdp.close();
  if (browser) { try { await browser.send('Browser.close'); } catch {} browser.close(); }
  if (chrome && !chrome.killed) chrome.kill('SIGTERM');
  fs.rmSync(profile,{recursive:true,force:true});
});
