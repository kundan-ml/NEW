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
  category: 'Inspection', base_name: `${dataset}_Position${i % 16 + 1}`, metadata: {},
  images: Object.fromEntries(channels.map(channel => [channel, {
    channel, filename: `${dataset}_Position${i % 16 + 1}.${channel}.bmp`,
    relative_path: `${dataset}-${i + 1}.${channel}.bmp`, absolute_path: `/fixture/${dataset}-${i + 1}.${channel}.bmp`,
  }])),
}));
const sampleRows = { old: makeSamples('old', 16), live: makeSamples('live', 32) };
const fixtureDefect={name:'Surface Imperfection',confidence:1,channel:'h',severity:'major',bbox_xywh_norm:[.65,.3,.12,.1]};
const result = (dataset, index, run = 'a') => ({
  dataset_id: dataset, sample_id: `${dataset}-${index}`, position: (index - 1) % 16 + 1,
  wt_index: Math.floor((index - 1) / 16) + 1, category: 'Inspection',
  status: index % 3 ? 'OK' : 'NOK', defects: index===5?[fixtureDefect]:[],
  channels: channels.map(channel => ({ channel, image_path: '/fixture/image.bmp', status: index % 3 ? 'OK' : 'NOK', defects: index===5&&channel==='h'?[fixtureDefect]:[], measurements: {}, engine: 'dsm-bv-4cam-halcon-26.05', elapsed_ms: 12.345 })),
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
let setupPreviewFixtures=false;
let setupSession=0;
const setupFixtureWrites=[];
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
    if (!small) await pause(800);
    body = `<svg xmlns="http://www.w3.org/2000/svg" width="${small ? 160 : 640}" height="${small ? 120 : 480}" viewBox="0 0 640 480"><rect width="640" height="480" fill="#050505"/><circle cx="320" cy="240" r="190" fill="#777"/><text x="20" y="35" fill="white">${url.searchParams.get('sampleId')}</text></svg>`;
  } else if (setupPreviewFixtures && route.endsWith('/datasets/uploads') && method==='POST') {
    assert.equal(JSON.parse(event.request.postData).purpose,'setup','Preview uploads must be isolated from inspection history');
    body={upload_id:(++setupSession).toString(16).padStart(32,'0'),chunk_bytes:2*1024*1024};
  } else if (setupPreviewFixtures && /\/datasets\/uploads\/[^/]+\/files\/0$/.test(route)) {
    const offset=Number(url.searchParams.get('offset')),size=Number(url.searchParams.get('size'));
    body={next_offset:offset+Math.min(2*1024*1024,size-offset)};
  } else if (setupPreviewFixtures && /\/datasets\/uploads\/[^/]+\/finish$/.test(route)) {
    body={id:'setup-preview',sample_count:1,samples:[{id:'one',images:{h:{channel:'h'}}}]};
  } else if (route === '/api/ui-config/access') body = { canCustomize: false };
  else if (route === '/api/ui-config') body = { manualSkeleton: viewer.classic, theme: 'graphite' };
  else if (route.endsWith('/inspection/live')) {
    body = structuredClone(snapshot);
    if (delayedLive && !delayedLive.used) { delayedLive.used = true; body = delayedLive.value; await pause(delayedLive.delay); }
  } else if (route.endsWith('/system/info')) body = { app: 'Lens Inspection', version: '3', mode: 'AUTO', bridge: 'HALCON fixture', settings: { station_name: 'Station 1', line_name: 'Fixture', installation_name: 'Fixture', station_index: 1, wt_capacity: 16, role: viewer.classic ? 'Administrator' : 'Operator', channel_labels: { h: 'Telecentric', d: 'Dark Field', n: 'Diffuse', p: 'Phase Contrast' }, image_format: 'BMP' }, session: { username: viewer.classic ? 'admin-fixture' : 'operator-fixture', role: viewer.classic ? 'Administrator' : 'Operator', logged_in: true } };
  else if (route.endsWith('/storage/state')) body = { active: false, saved_lenses: 0, saved_images: 0, event_count: 0, position_counts: {}, error_counts: {}, reason: 'Fixture' };
  else if (route.endsWith('/config/status-symbol-legend')) body = { statuses: [], defects: [] };
  else if (route.endsWith('/config/image-filters')) body = { error_classes: [] };
  else if (route.endsWith('/datasets')) body = datasets;
  else if (/\/datasets\/[^/]+\/samples$/.test(route)) { const id = route.split('/').at(-2); body = { total: sampleRows[id].length, items: sampleRows[id] }; }
  else if (/\/results\/[^/]+$/.test(route)) { const id = route.split('/').at(-1); body = { items: id === 'old' ? Array.from({ length: 16 }, (_, i) => result('old', i + 1)) : snapshot.job?.dataset_id === id ? snapshot.results : [] }; }
  else if (route.endsWith('/logs')) body = { items: [] };
  else if (route.endsWith('/auth/current')) body = { username: 'fixture', role: 'Operator', logged_in: true };
  else body = {};
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if(setupPreviewFixtures && route.includes('/datasets/uploads'))setupFixtureWrites.push({route,method});
    else viewer.mutations.push({ route, method });
  }
  await viewer.cdp.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Cache-Control', value: 'no-store' }],
    body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
}

function socketFixture(initial) {
  return `(() => {
    window.__qaDraws=[];
    window.__qaOverlays=0;
    const rectangle=CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.strokeRect=function(...args){window.__qaOverlays++;return rectangle.apply(this,args);};
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image instanceof HTMLImageElement)window.__qaDraws.push(image.naturalWidth);return draw.call(this,image,...args);};
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
  for (const viewer of viewers) assert.equal((await inspect(viewer)).mode, 'MANUAL', 'Live following must preserve local manual upload policy');
  reports.push({ case: 'independent profiles late join + saved MANUAL', classic: await inspect(classic), modern: await inspect(modern) });
  await advance(6); await Promise.all(viewers.map(viewer => checkPosition(viewer, 6)));
  await modern.cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(modern, '!!document.querySelector(".viewerPositionPill")', 'reload hydration');
  await modern.evaluate(`window.__qaBroadcast(${JSON.stringify(snapshot)})`); await checkPosition(modern, 6);
  await applyAppearance(modern);
  for (let position = 7; position <= 16; position++) await advance(position);
  await Promise.all(viewers.map(viewer => checkPosition(viewer, 16)));
  await advance(17); await Promise.all(viewers.map(viewer => checkPosition(viewer, 1, 'WT 3')));
  await openWt(classic); await pause(150);
  assert.equal((await inspect(classic)).images, 1, 'Next tray must reset and show only its first inferred thumbnail');
  assert.equal((await inspect(modern)).images, 1, 'Modern next tray must reset and show only its first inferred thumbnail');
  reports.push({ case: 'reload + tray16 rollover', classic: await inspect(classic), modern: await inspect(modern) });
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
  await checkPosition(classic, 1, 'WT 1');
  assert.equal((await inspect(classic)).sockets, 1, 'Historical selection must not close the global observer');
  await advance(4, 'job-b', 'b'); await checkPosition(classic, 4, 'WT 2');
  snapshot = { ...snapshot, sequence: snapshot.sequence + 1, job: { ...snapshot.job, status: 'completed' } };
  await broadcast({ type: 'completed', stream_id: snapshot.stream_id, sequence: snapshot.sequence, current_job_id: 'job-b', job: snapshot.job });
  await classic.evaluate(`document.querySelector('.historyTable button[aria-label^="WT 1 position 1 "]').click()`);
  await checkPosition(classic, 1, 'WT 1');
  await broadcast({ type: 'heartbeat', stream_id: snapshot.stream_id, sequence: snapshot.sequence });
  await pause(250); assert((await inspect(classic)).selected.startsWith('WT 1 position 1'), 'Idle heartbeats must preserve historical selection');
  reports.push({ case: 'active history selection keeps observer + idle history preserved', classic: await inspect(classic) });
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
    assert.equal((await inspect(viewer)).mode, 'MANUAL', 'Standalone live follow must preserve manual upload policy');
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
    await idle.evaluate(`document.querySelector('[aria-label="${kind==='focus'?'Close Focus Check':'Close registration'}"]').click()`);
    assert.equal(await idle.evaluate('document.querySelectorAll(".historyTable tbody tr").length'),historyRows,'Setup preview selection must not create inspection trays');
    reports.push({case:`${kind} popup file upload: four TIFFs, automatic matching, no new history`});
  }
  for (const viewer of viewers) { assert.deepEqual(viewer.mutations, [], 'Observer browsers must never mutate backend/config'); assert.deepEqual(viewer.errors, [], 'No browser runtime errors'); }
  console.log(JSON.stringify({ passed: reports, apiMutations: 0, isolatedSetupFixtureWrites:setupFixtureWrites.length, browserErrors: 0 }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  for (const viewer of viewers) viewer.cdp.close();
  if (browser) { try { await browser.send('Browser.close'); } catch {} browser.close(); }
  if (chrome && !chrome.killed) chrome.kill('SIGTERM');
  fs.rmSync(profile,{recursive:true,force:true});
});
