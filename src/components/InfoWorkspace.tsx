'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Activity,Database,RefreshCw,ShieldCheck,X} from 'lucide-react';
import {api} from '@/lib/api';
import type {SystemInfo} from '@/types';

type VersionInfo={
  software_version:string;
  parameter_versions:Record<string,string|Record<string,unknown>>;
  parameter_details?:Record<string,Record<string,unknown>>;
  library_version:string;
  machine_learning_active:boolean;
  ml_model_id:string;
  smart_cuvette_memory_active:boolean;
  last_registration:string;
  lookup_table:string|Record<string,unknown>;
  lookup_tables?:string[]|Record<string,unknown>[]|Record<string,unknown>;
  lookup_table_versions?:Record<string,string>;
};

const display=(value?:string|null)=>value?.trim()||'—';
const asRecord=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const fromFields=(value:Record<string,unknown>|null,keys:string[]):unknown=>keys.map(key=>value?.[key]).find(item=>item!==undefined&&item!==null);
const showField=(value:unknown):string=>typeof value==='boolean'?value?'Active':'Inactive':typeof value==='string'||typeof value==='number'?String(value).trim()||'—':'—';

function parameterRows(version:VersionInfo|null){
  return Object.entries(version?.parameter_versions||{}).map(([name,raw])=>{
    const data={...(version?.parameter_details?.[name]||{}),...(asRecord(raw)||{})};
    return {
      name,
      version:showField(typeof raw==='string'?raw:fromFields(data,['version','parameter_version'])),
      angle:showField(fromFields(data,['permanent_angle_measurement','permanent_angle_measurement_active','angle_measurement','angle_measurement_active','angle'])),
      scm:showField(fromFields(data,['scm_active','smart_cuvette_memory_active','scm'])),
      ml:showField(fromFields(data,['ml_active','machine_learning_active','ml'])),
    };
  });
}

function lookupRows(version:VersionInfo|null){
  if(!version)return [];
  const source=version.lookup_tables??version.lookup_table;
  const versions=version.lookup_table_versions||{};
  const rows:{name:string;version:string}[]=[];
  const add=(name:unknown,reportedVersion:unknown)=>{
    if(typeof name!=='string'||!name.trim())return;
    rows.push({name:name.trim(),version:showField(reportedVersion??versions[name])});
  };
  if(typeof source==='string')add(source,null);
  else if(Array.isArray(source))for(const item of source){
    if(typeof item==='string')add(item,null);
    else{const record=asRecord(item);add(fromFields(record,['name','file','filename','lookup_table']),fromFields(record,['version','table_version']))}
  }
  else{
    const record=asRecord(source);
    if(record&&fromFields(record,['name','file','filename','lookup_table']))add(fromFields(record,['name','file','filename','lookup_table']),fromFields(record,['version','table_version']));
    else for(const [name,detail] of Object.entries(record||{}))add(name,asRecord(detail)?.version??detail);
  }
  return rows;
}

export function InfoWorkspace({onClose}:{onClose:()=>void}){
  const[version,setVersion]=useState<VersionInfo|null>(null);
  const[system,setSystem]=useState<SystemInfo|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const requestId=useRef(0);
  const dialogRef=useRef<HTMLDivElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;

  const refresh=useCallback(async()=>{
    const id=++requestId.current;
    setLoading(true);
    const[versionResult,systemResult]=await Promise.allSettled([api.version() as Promise<VersionInfo>,api.system()]);
    if(id!==requestId.current)return;
    setVersion(versionResult.status==='fulfilled'?versionResult.value:null);
    setSystem(systemResult.status==='fulfilled'?systemResult.value:null);
    setError(versionResult.status==='rejected'&&systemResult.status==='rejected'?'Backend unavailable. Version information could not be loaded.':versionResult.status==='rejected'?'Version details are unavailable.':systemResult.status==='rejected'?'Station details are unavailable.':'');
    setLoading(false);
  },[]);

  useEffect(()=>{
    const bodyOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    void refresh();
    return()=>{requestId.current++;document.body.style.overflow=bodyOverflow};
  },[refresh]);

  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    closeRef.current?.focus();
    const keepFocus=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.stopPropagation();onCloseRef.current();return}
      if(event.key!=='Tab')return;
      const buttons=Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
      if(!buttons.length)return;
      const first=buttons[0],last=buttons[buttons.length-1];
      if(event.shiftKey&&(document.activeElement===first||!dialogRef.current?.contains(document.activeElement))){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||!dialogRef.current?.contains(document.activeElement))){event.preventDefault();first.focus()}
    };
    window.addEventListener('keydown',keepFocus,true);
    return()=>{window.removeEventListener('keydown',keepFocus,true);previous?.focus()};
  },[]);

  const scripts=parameterRows(version);
  const lookups=lookupRows(version);
  const bridgeAvailable=!!version?.library_version&&!['dsm-halcon-unavailable','unknown'].includes(version.library_version);

  return <div className="infoModal" role="dialog" aria-modal="true" aria-label="System information" onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <div className="infoWindow" ref={dialogRef}>
      <header className="infoHeader">
        <span className="infoHeaderIcon"><Activity/></span>
        <div><small>SYSTEM · VERSION INFORMATION</small><h2>Info</h2></div>
        <span className={`infoConnection ${error?'is-warning':''}`}><i/>{loading?'Loading':error?'Limited':'Connected'}</span>
        <button className="infoIconButton" onClick={()=>void refresh()} disabled={loading} title="Refresh information" aria-label="Refresh information"><RefreshCw className={loading?'infoSpin':''}/></button>
        <button className="infoIconButton" ref={closeRef} onClick={onClose} title="Close" aria-label="Close information"><X/></button>
      </header>

      <div className="infoBody">
        <div className="infoVersionBand">
          <span><small>SOFTWARE VERSION</small><strong>{display(version?.software_version)}</strong></span>
          <span><small>INSPECTION LIBRARY</small><strong title={version?.library_version}>{display(version?.library_version)}</strong></span>
          <span><small>STATION</small><strong title={system?.settings.station_name}>{display(system?.settings.station_name)}</strong></span>
        </div>

        <div className="infoGrid">
          <section className="infoSection infoScripts">
            <h3><Database/>Script parameters</h3>
            <div className="infoTable" role="table" aria-label="Parameter versions">
              <div className="infoTableHead" role="row"><span role="columnheader">Product</span><span role="columnheader">Version</span><span role="columnheader">Angle</span><span role="columnheader">SCM</span><span role="columnheader">ML</span></div>
              {scripts.length?scripts.map(script=><div className="infoTableRow" role="row" key={script.name}><span className="infoScriptName" role="cell" title={script.name}>{script.name}</span><b className="infoScriptVersion" role="cell">{script.version}</b><span className="infoScriptExtra" role="cell" data-label="Angle">{script.angle}</span><span className="infoScriptExtra" role="cell" data-label="SCM">{script.scm}</span><span className="infoScriptExtra" role="cell" data-label="ML">{script.ml}</span></div>):<p className="infoEmpty">{loading?'Loading script parameters…':'No script versions reported.'}</p>}
            </div>
            <p className="infoSectionNote">— means not reported by the backend.</p>
          </section>

          <section className="infoSection">
            <h3><Activity/>Inspection runtime</h3>
            <dl className="infoFacts">
              <div><dt>HALCON bridge</dt><dd className={bridgeAvailable?'infoGood':'infoMuted'}>{version?bridgeAvailable?'Available':'Unavailable':'—'}</dd></div>
              <div><dt>Machine learning</dt><dd>{version?version.machine_learning_active?'Active':'Inactive':'—'}</dd></div>
              <div><dt>Model ID</dt><dd title={version?.ml_model_id}>{display(version?.ml_model_id)}</dd></div>
              <div><dt>SmartCuvetteMemory</dt><dd>{version?version.smart_cuvette_memory_active?'Active':'Inactive':'—'}</dd></div>
            </dl>
          </section>

          <section className="infoSection">
            <h3><ShieldCheck/>Registration &amp; lookup</h3>
            <dl className="infoFacts">
              <div><dt>Last registration</dt><dd title={version?.last_registration}>{display(version?.last_registration)}</dd></div>
            </dl>
            <div className="infoLookupTable" role="table" aria-label="Look-up table versions">
              <div className="infoLookupHead" role="row"><span role="columnheader">Look-up table</span><span role="columnheader">Version</span></div>
              {lookups.length?lookups.map((table,index)=><div className="infoLookupRow" role="row" key={`${table.name}:${index}`}><span role="cell" title={table.name}>{table.name}</span><b role="cell">{table.version}</b></div>):<p className="infoEmpty">{loading?'Loading look-up tables…':'No look-up table reported.'}</p>}
            </div>
          </section>

          <section className="infoSection">
            <h3><Activity/>Workstation</h3>
            <dl className="infoFacts">
              <div><dt>Line</dt><dd>{display(system?.settings.line_name)}</dd></div>
              <div><dt>Operation</dt><dd>{system?.mode==='AUTO'?'Automatic':system?.mode==='SETUP'?'Setup':'—'}</dd></div>
              <div><dt>Signed in</dt><dd>{display(system?.session.username)}</dd></div>
            </dl>
          </section>
        </div>
      </div>

      <footer className="infoFooter"><span role="status">{error||'Backend-reported information'}</span><button onClick={onClose}>Close</button></footer>
    </div>
  </div>;
}
