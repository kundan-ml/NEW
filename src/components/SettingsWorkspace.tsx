'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Clock3,Database,HardDrive,Loader2,Network,Save,Settings2,ShieldCheck,X} from 'lucide-react';
import {api,type MachineSettings} from '@/lib/api';
import type {SystemInfo} from '@/types';
import '@/app/settings-manual.css';

/** Keep the complete backend object when saving: PUT /system/settings replaces it. */
type SystemSettingsPayload=MachineSettings;

type SettingsDraft={
  plc_ams_net_id:string;
  plc_port:string;
  triggerbox_ip:string;
  autologoff_minutes:string;
  spc_image_path:string;
  csv_memory_interval_minutes:string;
  csv_memory_enabled:boolean;
  csv_retention_minutes:string;
  image_format:'BMP'|'TIF';
  camera_trigger_pulse_distance_ms:string;
  image_processing_timeout_ms:string;
};

function toDraft(settings:SystemSettingsPayload):SettingsDraft{
  return {
    plc_ams_net_id:settings.plc_ams_net_id,
    plc_port:String(settings.plc_port),
    triggerbox_ip:settings.triggerbox_ip,
    autologoff_minutes:String(settings.autologoff_minutes),
    spc_image_path:settings.spc_image_path,
    csv_memory_interval_minutes:String(settings.csv_memory_interval_minutes),
    csv_memory_enabled:settings.csv_memory_enabled,
    csv_retention_minutes:String(settings.csv_retention_minutes),
    image_format:settings.image_format||'BMP',
    camera_trigger_pulse_distance_ms:String(settings.camera_trigger_pulse_distance_ms??150),
    image_processing_timeout_ms:String(settings.image_processing_timeout_ms??2500),
  };
}

function validWholeNumber(value:string,min:number,max?:number){
  const number=Number(value);
  return value.trim()!==''&&Number.isInteger(number)&&number>=min&&(max===undefined||number<=max);
}

function validDottedAddress(value:string,partCount:number){
  const parts=value.trim().split('.');
  return parts.length===partCount&&parts.every(part=>/^\d{1,3}$/.test(part)&&Number(part)<=255);
}

function validate(draft:SettingsDraft,original:SettingsDraft):string|null{
  if(!draft.plc_ams_net_id.trim())return 'Enter the PLC AMS-Net ID.';
  if(draft.plc_ams_net_id!==original.plc_ams_net_id&&!validDottedAddress(draft.plc_ams_net_id,6))return 'PLC AMS-Net ID must contain six numbers from 0 to 255.';
  if(!validWholeNumber(draft.plc_port,1,65535))return 'PLC port must be from 1 to 65535.';
  if(!draft.triggerbox_ip.trim())return 'Enter the trigger box IP address.';
  if(draft.triggerbox_ip!==original.triggerbox_ip&&!validDottedAddress(draft.triggerbox_ip,4))return 'Trigger box IP must contain four numbers from 0 to 255.';
  if(!validWholeNumber(draft.autologoff_minutes,1,120))return 'Auto-logoff must be from 1 to 120 minutes.';
  if(!draft.spc_image_path.trim())return 'Enter the SPC image path.';
  if(!validWholeNumber(draft.csv_memory_interval_minutes,1,1440))return 'CSV interval must be from 1 to 1440 minutes.';
  if(!validWholeNumber(draft.csv_retention_minutes,0))return 'CSV delete-after must be zero or more minutes.';
  if(!validWholeNumber(draft.camera_trigger_pulse_distance_ms,1))return 'Trigger spacing must be a positive whole number of milliseconds.';
  if(!validWholeNumber(draft.image_processing_timeout_ms,1))return 'Processing timeout must be a positive whole number of milliseconds.';
  return null;
}

export function SettingsWorkspace({onClose}:{onClose:()=>void}){
  const[system,setSystem]=useState<SystemInfo|null>(null);
  const[settings,setSettings]=useState<SystemSettingsPayload|null>(null);
  const[draft,setDraft]=useState<SettingsDraft|null>(null);
  const[original,setOriginal]=useState<SettingsDraft|null>(null);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState('');
  const[notice,setNotice]=useState('');
  const[tab,setTab]=useState<'general'|'timing'>('general');
  const dialogRef=useRef<HTMLElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const openerRef=useRef<HTMLElement|null>(null);
  const onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;

  useEffect(()=>{
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=previous};
  },[]);

  const load=useCallback(async()=>{
    setLoading(true);
    setError('');
    setNotice('');
    const[systemResult,settingsResult]=await Promise.allSettled([
      api.system(),
      api.getSettings(),
    ]);
    setSystem(systemResult.status==='fulfilled'?systemResult.value:null);
    if(settingsResult.status==='fulfilled'){
      setSettings(settingsResult.value);
      const next=toDraft(settingsResult.value);
      setDraft(next);
      setOriginal(next);
      if(systemResult.status==='rejected')setNotice('Access status unavailable. Settings are read-only.');
    }else{
      setError(settingsResult.reason instanceof Error?settingsResult.reason.message:'Unable to load system settings.');
    }
    setLoading(false);
  },[]);

  useEffect(()=>{void load()},[load]);
  useEffect(()=>{
    if(!openerRef.current&&document.activeElement instanceof HTMLElement&&!dialogRef.current?.contains(document.activeElement))openerRef.current=document.activeElement;
    closeRef.current?.focus({preventScroll:true});
    const focusable=()=>Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )||[]).filter(element=>element.getClientRects().length>0&&!element.closest('[inert]'));
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if(event.key!=='Tab')return;
      const items=focusable();
      const first=items[0]||dialogRef.current;
      const last=items[items.length-1]||dialogRef.current;
      if(!first||!last)return;
      const active=document.activeElement;
      if(event.shiftKey&&(!dialogRef.current?.contains(active)||active===first)){
        event.preventDefault();
        last.focus({preventScroll:true});
      }else if(!event.shiftKey&&(!dialogRef.current?.contains(active)||active===last)){
        event.preventDefault();
        first.focus({preventScroll:true});
      }
    };
    const onFocusIn=(event:FocusEvent)=>{
      if(event.target instanceof Node&&!dialogRef.current?.contains(event.target))closeRef.current?.focus({preventScroll:true});
    };
    document.addEventListener('keydown',onKey,true);
    document.addEventListener('focusin',onFocusIn);
    return()=>{
      document.removeEventListener('keydown',onKey,true);
      document.removeEventListener('focusin',onFocusIn);
      const opener=openerRef.current;
      if(opener?.isConnected)queueMicrotask(()=>{if(opener.isConnected)opener.focus({preventScroll:true})});
    };
  },[]);

  const role=system?.session.role;
  const setup=system?.mode==='SETUP';
  // Machine settings follow the manual's Service/Admin permission. UI appearance
  // customization remains governed independently by UIProvider's admin lock.
  const editable=(role==='Administrator'||role==='Service')&&setup;
  const dirty=!!draft&&!!original&&JSON.stringify(draft)!==JSON.stringify(original);

  function patch<K extends keyof SettingsDraft>(key:K,value:SettingsDraft[K]){
    setDraft(current=>current?{...current,[key]:value}:current);
    setError('');
    setNotice('');
  }

  async function apply(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!draft||!original||!settings||!editable||!dirty||saving)return;
    const problem=validate(draft,original);
    if(problem){setError(problem);return}
    setSaving(true);
    setError('');
    setNotice('');
    try{
      // The endpoint replaces the entire object. Preserve fresh backend fields,
      // including settings another tab may have changed since this dialog opened.
      const[latestSystem,latestSettings]=await Promise.all([
        api.system(),
        api.getSettings(),
      ]);
      setSystem(latestSystem);
      if(latestSystem.mode!=='SETUP'||!['Administrator','Service'].includes(latestSystem.session.role)){
        setError('Switch to Setup mode and sign in as Service or Administrator to apply machine settings.');
        return;
      }
      const changedKeys=(Object.keys(draft) as (keyof SettingsDraft)[]).filter(key=>draft[key]!==original[key]);
      const latestDraft=toDraft(latestSettings);
      const conflictingKey=changedKeys.find(key=>latestDraft[key]!==original[key]&&latestDraft[key]!==draft[key]);
      if(conflictingKey){
        setError('This setting changed in another session. Reopen Settings to review the latest value.');
        return;
      }
      const payload:SystemSettingsPayload={
        ...latestSettings,
        ...(changedKeys.includes('plc_ams_net_id')?{plc_ams_net_id:draft.plc_ams_net_id.trim()}:{}),
        ...(changedKeys.includes('plc_port')?{plc_port:Number(draft.plc_port)}:{}),
        ...(changedKeys.includes('triggerbox_ip')?{triggerbox_ip:draft.triggerbox_ip.trim()}:{}),
        ...(changedKeys.includes('autologoff_minutes')?{autologoff_minutes:Number(draft.autologoff_minutes)}:{}),
        ...(changedKeys.includes('spc_image_path')?{spc_image_path:draft.spc_image_path.trim()}:{}),
        ...(changedKeys.includes('csv_memory_interval_minutes')?{csv_memory_interval_minutes:Number(draft.csv_memory_interval_minutes)}:{}),
        ...(changedKeys.includes('csv_memory_enabled')?{csv_memory_enabled:draft.csv_memory_enabled}:{}),
        ...(changedKeys.includes('csv_retention_minutes')?{csv_retention_minutes:Number(draft.csv_retention_minutes)}:{}),
        ...(changedKeys.includes('image_format')?{image_format:draft.image_format}:{}),
        ...(changedKeys.includes('camera_trigger_pulse_distance_ms')?{camera_trigger_pulse_distance_ms:Number(draft.camera_trigger_pulse_distance_ms)}:{}),
        ...(changedKeys.includes('image_processing_timeout_ms')?{image_processing_timeout_ms:Number(draft.image_processing_timeout_ms)}:{}),
      };
      const saved=await api.saveSettings(payload);
      setSettings(saved);
      const next=toDraft(saved);
      setDraft(next);
      setOriginal(next);
      setNotice('Settings applied and saved to Outbox.');
      window.dispatchEvent(new Event('lens-system-settings-changed'));
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Unable to apply system settings.');
    }finally{setSaving(false)}
  }

  const readOnlyMessage=!system?'Connection status unavailable. Changes are disabled.':!setup?'Switch to Setup mode to edit system settings.':!editable?'Service or Administrator access is required.':'';

  return <div className="settingsModal" role="presentation" onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section ref={dialogRef} className="settingsWindow settingsManualWindow" role="dialog" aria-modal="true" aria-labelledby="settings-title" aria-describedby="settings-subtitle" tabIndex={-1}>
      <header className="settingsHeader">
        <span className="settingsHeaderIcon"><Settings2 aria-hidden="true"/></span>
        <div className="settingsHeaderCopy"><span>Machine configuration</span><h2 id="settings-title">General Settings</h2></div>
        <span className={`settingsMode ${setup?'is-setup':'is-auto'}`}><i/>{system?.mode==='SETUP'?'Setup':system?.mode==='AUTO'?'Automatic':'Offline'}</span>
        <button ref={closeRef} type="button" className="settingsClose" onClick={onClose} aria-label="Close settings"><X/></button>
      </header>

      <div className="settingsContext" id="settings-subtitle">
        <span><small>LINE</small><b>{system?.settings.line_name||'—'}</b></span>
        <span><small>STATION</small><b>{system?.settings.station_name||'—'}</b></span>
        <span><small>ACCESS</small><b>{role||'Unavailable'}</b></span>
        <span className="settingsContextNote"><ShieldCheck aria-hidden="true"/>{editable?'Editing enabled':readOnlyMessage}</span>
      </div>

      {loading?<div className="settingsLoading"><Loader2 className="settingsSpinner"/><span>Loading system settings…</span></div>:!draft?<div className="settingsLoading settingsLoadError"><span>{error||'System settings are unavailable.'}</span><button type="button" onClick={()=>void load()}>Retry</button></div>:<form className="settingsForm" onSubmit={event=>void apply(event)}>
        <nav className="settingsManualTabs" aria-label="Machine settings sections">
          <button type="button" aria-pressed={tab==='general'} className={tab==='general'?'active':''} onClick={()=>setTab('general')}><Settings2/>General &amp; storage</button>
          <button type="button" aria-pressed={tab==='timing'} className={tab==='timing'?'active':''} onClick={()=>setTab('timing')}><Clock3/>Trigger timing</button>
          <span>{system?.settings.wt_capacity||16} positions / tray</span>
        </nav>
        <div className="settingsFields" hidden={tab!=='general'}>
          <section className="settingsSection settingsPlc" aria-labelledby="settings-plc-title">
            <div className="settingsSectionHeading"><span><Network/></span><div><small>01 / CONNECTION</small><h3 id="settings-plc-title">PLC</h3></div></div>
            <label>AMS-Net ID<input value={draft.plc_ams_net_id} onChange={event=>patch('plc_ams_net_id',event.target.value)} disabled={!editable||saving} autoComplete="off" spellCheck={false} placeholder="5.1.204.160.1.1"/></label>
            <label>Port<input type="number" min="1" max="65535" step="1" value={draft.plc_port} onChange={event=>patch('plc_port',event.target.value)} disabled={!editable||saving} placeholder="801"/><small>Typical ports: 801 or 811</small></label>
          </section>

          <section className="settingsSection settingsTrigger" aria-labelledby="settings-trigger-title">
            <div className="settingsSectionHeading"><span><Network/></span><div><small>02 / HARDWARE</small><h3 id="settings-trigger-title">Trigger box</h3></div></div>
            <label>IP address<input value={draft.triggerbox_ip} onChange={event=>patch('triggerbox_ip',event.target.value)} disabled={!editable||saving} autoComplete="off" spellCheck={false} inputMode="decimal" placeholder="192.168.10.40"/></label>
            <p>One controller address is supported by the current backend.</p>
          </section>

          <section className="settingsSection settingsSession" aria-labelledby="settings-session-title">
            <div className="settingsSectionHeading"><span><Clock3/></span><div><small>03 / ACCESS</small><h3 id="settings-session-title">Session</h3></div></div>
            <label>Auto-logoff<input type="number" min="1" max="120" step="1" value={draft.autologoff_minutes} onChange={event=>patch('autologoff_minutes',event.target.value)} disabled={!editable||saving}/><small title="The current backend uses a shared station session. Per-client idle logout is not enforced yet.">Minutes · 1–120 · Configuration only</small></label>
          </section>

          <section className="settingsSection settingsSpc" aria-labelledby="settings-spc-title">
            <div className="settingsSectionHeading"><span><HardDrive/></span><div><small>04 / STORAGE</small><h3 id="settings-spc-title">SPC images</h3></div></div>
            <label>Save path<input value={draft.spc_image_path} onChange={event=>patch('spc_image_path',event.target.value)} disabled={!editable||saving} autoComplete="off" spellCheck={false} placeholder="./storage/spc"/></label>
            <fieldset className="settingsImageFormat" disabled={!editable||saving}>
              <legend>Image output format <small>All illuminations</small></legend>
              <label className={draft.image_format==='BMP'?'selected':''}><input type="radio" name="settings-image-format" value="BMP" checked={draft.image_format==='BMP'} onChange={()=>patch('image_format','BMP')}/><b>BMP</b><span>Bitmap</span></label>
              <label className={draft.image_format==='TIF'?'selected':''}><input type="radio" name="settings-image-format" value="TIF" checked={draft.image_format==='TIF'} onChange={()=>patch('image_format','TIF')}/><b>TIFF</b><span>Metadata supported</span></label>
            </fieldset>
          </section>

          <section className="settingsSection settingsCsv" aria-labelledby="settings-csv-title">
            <div className="settingsSectionHeading"><span><Database/></span><div><small>05 / STATISTICS</small><h3 id="settings-csv-title">CSV memory</h3></div>
              <label className="settingsSwitch"><input type="checkbox" checked={draft.csv_memory_enabled} onChange={event=>patch('csv_memory_enabled',event.target.checked)} disabled={!editable||saving}/><span aria-hidden="true"/><b>{draft.csv_memory_enabled?'Enabled':'Disabled'}</b></label>
            </div>
            <div className="settingsCsvFields">
              <label>Save interval<input type="number" min="1" max="1440" step="1" value={draft.csv_memory_interval_minutes} onChange={event=>patch('csv_memory_interval_minutes',event.target.value)} disabled={!editable||saving}/><small>Minutes · 1–1440</small></label>
              <label>Delete after<input type="number" min="0" step="1" value={draft.csv_retention_minutes} onChange={event=>patch('csv_retention_minutes',event.target.value)} disabled={!editable||saving}/><small>Minutes</small></label>
            </div>
          </section>
        </div>
        {tab==='timing'&&<TimingPanel draft={draft} capacity={system?.settings.wt_capacity||16} disabled={!editable||saving} patch={patch}/>}

        <footer className="settingsFooter">
          <p className={error?'is-error':notice?'is-success':''} role="status" aria-live="polite">{error||notice||(dirty?'Unsaved changes':editable?'Ready to edit':readOnlyMessage||'Read-only')}</p>
          <span className="settingsOutboxNote" title="Apply preserves active settings and writes a complete Settings.json with the saving user and timestamp to Outbox/Machine.">JSON + audited Outbox</span>
          <button type="button" className="settingsCancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="settingsApply" disabled={!editable||!dirty||saving}>{saving?<Loader2 className="settingsSpinner"/>:<Save/>}Apply</button>
        </footer>
      </form>}
    </section>
  </div>;
}

function TimingPanel({draft,capacity,disabled,patch}:{draft:SettingsDraft;capacity:number;disabled:boolean;patch:<K extends keyof SettingsDraft>(key:K,value:SettingsDraft[K])=>void}){
  const spacing=Number(draft.camera_trigger_pulse_distance_ms),processing=Number(draft.image_processing_timeout_ms);
  const valid=validWholeNumber(draft.camera_trigger_pulse_distance_ms,1)&&validWholeNumber(draft.image_processing_timeout_ms,1);
  const total=valid?(capacity-1)*spacing+processing:0;
  const positions=Array.from({length:capacity},(_,index)=>index+1);
  return <div className="settingsTimingFields">
    <section className="settingsSection settingsTimingInputs" aria-labelledby="settings-timing-title">
      <div className="settingsSectionHeading"><span><Clock3/></span><div><small>MANUAL / FIGURE 47</small><h3 id="settings-timing-title">Trigger parameters</h3></div></div>
      <label>Camera trigger spacing<input type="number" min="1" step="1" value={draft.camera_trigger_pulse_distance_ms} onChange={event=>patch('camera_trigger_pulse_distance_ms',event.target.value)} disabled={disabled}/><small>Milliseconds between lens triggers</small></label>
      <label>Image processing timeout<input type="number" min="1" step="1" value={draft.image_processing_timeout_ms} onChange={event=>patch('image_processing_timeout_ms',event.target.value)} disabled={disabled}/><small>Milliseconds after the final lens trigger</small></label>
      <div className="settingsTimeoutSummary"><small>COMMON TRAY DEADLINE</small><b>{valid?`${total.toLocaleString()} ms`:'—'}</b><span>{capacity} lenses / one aligned deadline</span></div>
      <p className="settingsTimingNotice">Configuration preview only. Hardware trigger and runtime timeout enforcement require a connected controller.</p>
    </section>
    <section className="settingsSection settingsTimingPreview" aria-labelledby="settings-timeout-title">
      <div className="settingsSectionHeading"><span><Network/></span><div><small>LIVE / PER-POSITION BUDGET</small><h3 id="settings-timeout-title">Time available after trigger</h3></div></div>
      <div className="settingsTimingLegend"><span><i/>Remaining triggers</span><span><i/>Processing timeout</span><em>ms</em></div>
      <div className={`settingsTimeoutRows ${capacity>16?'many-positions':''}`} role="list" aria-label="Per-position timeout preview">
        {positions.map(position=>{
          const offset=(position-1)*spacing,remaining=(capacity-position)*spacing+processing;
          return <div key={position} className="settingsTimeoutRow" role="listitem" aria-label={`Position ${position}: ${valid?`${remaining} milliseconds available, trigger at ${offset} milliseconds`:'enter valid timing values'}`}>
            <span>P{position}</span><i className="settingsTimeoutTrack" aria-hidden="true">{valid&&<><em style={{left:`${offset/total*100}%`,width:`${(capacity-position)*spacing/total*100}%`}}/><b style={{left:`${(capacity-1)*spacing/total*100}%`,width:`${processing/total*100}%`}}/></>}</i><strong>{valid?remaining.toLocaleString():'—'}</strong>
          </div>;
        })}
      </div>
      <p className="settingsTimingFormula">(Tray capacity − position) × trigger spacing + processing timeout</p>
    </section>
  </div>;
}
