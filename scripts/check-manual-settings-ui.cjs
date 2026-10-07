/* Isolated browser fixtures: no API request or preference write reaches a real backend.
 * Usage: node scripts/check-manual-settings-ui.cjs http://localhost:3011
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const WebSocket=require('next/dist/compiled/ws');
const base=process.argv[2]||'http://localhost:3011';
const port=Number(process.env.SETTINGS_QA_CHROME_PORT||9358);
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'manual-settings-qa-'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errors=[],saved=[];
let chrome,browser,tab,role='Service',mode='SETUP';
let config={station_name:'Fixture Station',line_name:'Fixture Line',installation_name:'Fixture',station_index:1,wt_capacity:16,role:'Service',plc_ams_net_id:'5.1.204.160.1.1',plc_port:801,triggerbox_ip:'192.168.10.40',autologoff_minutes:30,spc_image_path:'./storage/spc',csv_memory_interval_minutes:10,csv_memory_enabled:true,csv_retention_minutes:10080,camera_trigger_pulse_distance_ms:150,image_processing_timeout_ms:2500,channel_labels:{h:'Telecentric',d:'Dark Field',n:'Diffuse',p:'Phase'},image_format:'BMP',manual_path:'fixture.pdf'};
function connect(url){
  const ws=new WebSocket(url),pending=new Map(),events=new Map();let id=0;
  const ready=new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
  ws.on('message',raw=>{const value=JSON.parse(String(raw));if(value.id){const call=pending.get(value.id);if(!call)return;pending.delete(value.id);value.error?call.reject(Error(value.error.message)):call.resolve(value.result)}else for(const callback of events.get(value.method)||[])callback(value.params)});
  return {ready,on(name,fn){events.set(name,[...(events.get(name)||[]),fn])},send(method,params={}){return new Promise((resolve,reject)=>{const serial=++id;pending.set(serial,{resolve,reject});ws.send(JSON.stringify({id:serial,method,params}))})},close(){ws.close()}};
}
async function evaluate(expression){const value=await tab.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value}
async function waitFor(expression,label){for(let index=0;index<200;index++){if(await evaluate(expression))return;await delay(100)}throw Error(`Timed out: ${label}`)}
async function fixture(event){
  const route=new URL(event.request.url).pathname,method=event.request.method;
  let body={};
  if(route.endsWith('/system/info'))body={app:'Fixture',version:'3',mode,bridge:'fixture-offline',settings:config,session:{username:'fixture',role,logged_in:true}};
  else if(route.endsWith('/system/settings')){if(method==='PUT'){config=JSON.parse(event.request.postData);saved.push(config)}body=config}
  else if(route==='/api/ui-config/access')body={canCustomize:false};
  else if(route==='/api/ui-config')body={manualSkeleton:true,theme:'graphite'};
  else if(route.endsWith('/inspection/live'))body={type:'snapshot',stream_id:'fixture',sequence:0,current_job_id:null,job:null,results:[]};
  else if(route.endsWith('/datasets'))body=[];
  else if(route.endsWith('/logs'))body={items:[]};
  else if(route.endsWith('/config/image-filters'))body={error_classes:[]};
  else if(route.endsWith('/config/status-symbol-legend'))body={statuses:[],defects:[]};
  else if(route.endsWith('/storage/state'))body={active:false,saved_lenses:0,saved_images:0,event_count:0,position_counts:{},error_counts:{}};
  else if(route.endsWith('/auth/current'))body={username:'fixture',role,logged_in:true};
  if(!['GET','HEAD','OPTIONS'].includes(method)&&!route.endsWith('/system/settings'))throw Error(`Unexpected mutation intercepted: ${method} ${route}`);
  await tab.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
}
async function size(width,height){await tab.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150)}
async function appearance(theme,classic){await evaluate(`(()=>{const prefs=JSON.parse(localStorage.getItem('lens-ui-prefs-v13')||'{}');prefs.theme=${JSON.stringify(theme)};prefs.manualSkeleton=${classic};for(const key of ['customBg','customPanel','customHeader','customButton','customBorder','customText','customAccent'])prefs[key]='';prefs.componentStyles={};prefs.layerGradients={};prefs.themeProfiles={};window.dispatchEvent(new StorageEvent('storage',{key:'lens-ui-prefs-v13',newValue:JSON.stringify(prefs)}));})()`);await delay(150)}
async function screenshot(filename){const value=await tab.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),filename),Buffer.from(value.data,'base64'))}
async function alignment(){return evaluate(`(()=>{const section=document.querySelector('.settingsManualWindow');const fields=document.querySelector('.settingsFields:not([hidden])')||document.querySelector('.settingsTimingFields');const rect=section.getBoundingClientRect();return {width:rect.width,height:rect.height,x:rect.x,y:rect.y,pageOverflow:document.documentElement.scrollWidth>innerWidth,fieldsOverflow:fields.scrollHeight>fields.clientHeight+1,footerBottom:section.querySelector('footer').getBoundingClientRect().bottom,windowBottom:rect.bottom};})()`)}
(async()=>{
  chrome=spawn(process.env.CHROME_BINARY||'/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let version;for(let i=0;i<100;i++){try{version=await fetch(`http://127.0.0.1:${port}/json/version`).then(response=>response.json());break}catch{await delay(100)}}
  assert(version,'Chrome started');browser=connect(version.webSocketDebuggerUrl);await browser.ready;
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});
  const targets=await fetch(`http://127.0.0.1:${port}/json`).then(response=>response.json());tab=connect(targets.find(item=>item.id===targetId).webSocketDebuggerUrl);await tab.ready;
  tab.on('Runtime.exceptionThrown',value=>errors.push(value.exceptionDetails.exception?.description||value.exceptionDetails.text));
  tab.on('Fetch.requestPaused',event=>fixture(event).catch(error=>errors.push(String(error))));
  await tab.send('Runtime.enable');await tab.send('Page.enable');await tab.send('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
  await tab.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.WebSocket=class{constructor(){this.readyState=3}close(){}send(){}}`});
  await size(1920,1080);await tab.send('Page.navigate',{url:`${base}/?settings=1`});
  await waitFor(`document.querySelector('.settingsImageFormat')&&!document.querySelector('.settingsImageFormat').disabled`,'service editable settings');
  await appearance('graphite',true);
  for(const dimensions of [[1920,1080],[1366,768],[1024,768]]){
    await size(...dimensions);const result=await alignment();assert(!result.pageOverflow,`Horizontal overflow at ${dimensions}`);assert(!result.fieldsOverflow,`Unexpected normal-desktop scrollbar at ${dimensions}`);assert(result.footerBottom<=result.windowBottom+1,'Footer inside dialog');
  }
  await screenshot('settings-manual-general-dark.png');
  await evaluate(`document.querySelector('input[value="TIF"]').click()`);
  await evaluate(`document.querySelectorAll('.settingsManualTabs button')[1].click()`);
  await waitFor(`document.querySelectorAll('.settingsTimeoutRow').length===16`,'16-position preview');
  assert.equal(await evaluate(`document.querySelector('.settingsTimeoutRow strong').textContent`),'4,750');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.settingsTimeoutRow strong')).at(-1).textContent`),'2,500');
  await evaluate(`(()=>{const input=document.querySelector('.settingsTimingInputs input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'200');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(`document.querySelector('.settingsTimeoutRow strong').textContent==='5,500'`,'immediate timing preview');
  await appearance('premium-white',false);await screenshot('settings-manual-timing-white.png');
  await evaluate(`document.querySelector('.settingsApply').click()`);
  await waitFor(`document.querySelector('.settingsFooter').innerText.includes('saved to Outbox')`,'apply success');
  assert.equal(saved.length,1);assert.equal(saved[0].image_format,'TIF');assert.equal(saved[0].camera_trigger_pulse_distance_ms,200);assert.deepEqual(saved[0].channel_labels,{h:'Telecentric',d:'Dark Field',n:'Diffuse',p:'Phase'});assert.equal(saved[0].manual_path,'fixture.pdf');
  role='Operator';await tab.send('Page.navigate',{url:`${base}/?settings=1&readonly=1`});
  await waitFor(`document.querySelector('.settingsImageFormat')&&document.querySelector('.settingsImageFormat').disabled`,'operator read-only settings');
  assert(await evaluate(`document.querySelector('.settingsApply').disabled`));
  assert.deepEqual(errors,[],'No browser runtime/interception errors');
  console.log('Settings browser checks passed: Service editing, 3 desktop sizes without scrollbars, Classic dark / Modern white, live 16-position timing, format save, metadata preservation, Operator read-only. All API traffic was intercepted.');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1}).finally(async()=>{
  if(tab)tab.close();if(browser){try{await browser.send('Browser.close')}catch{}browser.close()}if(chrome&&!chrome.killed)chrome.kill('SIGTERM');fs.rmSync(profile,{recursive:true,force:true});
});
