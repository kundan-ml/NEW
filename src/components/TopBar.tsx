'use client';

import {useEffect,useMemo,useState} from 'react';
import {Activity,ChevronDown,CircleUserRound,Database,FolderUp,LogIn,Palette,RefreshCw,Settings2,ShieldCheck} from 'lucide-react';
import {api} from '@/lib/api';
import type {Role,SystemInfo} from '@/types';

type DashboardStats={yieldPct:number;total:number;nokRate:number;evaluated:number};
type Props={info:SystemInfo|null;onRefresh:()=>void;stats?:DashboardStats;workstation?:boolean;demo?:boolean;onUpload?:()=>void;onLayout?:()=>void};

export function TopBar({info,onRefresh,stats,workstation=false,demo=false,onUpload,onLayout}:Props){
  const[now,setNow]=useState(new Date());
  const[busy,setBusy]=useState(false);
  const[open,setOpen]=useState(false);
  const[notice,setNotice]=useState('');
  const[previewMode,setPreviewMode]=useState<'AUTO'|'SETUP'>('AUTO');
  const[user,setUser]=useState(info?.session.username||'service.dev');
  const[role,setRole]=useState<Role>(info?.session.role||'Administrator');
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t)},[]);
  useEffect(()=>{if(info){setUser(info.session.username);setRole(info.session.role)}},[info]);
  const mode=demo?previewMode:(info?.mode||'SETUP');
  const yieldPct=Math.max(0,Math.min(100,stats?.yieldPct||0));
  const halconOnline=useMemo(()=>!!info?.bridge&&!/offline|unavailable|none|disconnected/i.test(info.bridge),[info?.bridge]);

  async function toggle(){if(demo){setPreviewMode(mode==='AUTO'?'SETUP':'AUTO');return}setBusy(true);setNotice('');try{await api.setMode(mode==='AUTO'?'SETUP':'AUTO');onRefresh()}catch(e){setNotice((e as Error).message)}finally{setBusy(false)}}
  async function login(){setBusy(true);setNotice('');try{await api.login(user,role);setOpen(false);onRefresh()}catch(e){setNotice((e as Error).message)}finally{setBusy(false)}}

  if(workstation){
    return <header className="oakMachineHeader referenceMachineHeader">
      <div className="referenceTitle"><span><b>Lens Inspection Control Center</b><small>Optical Quality Inspection System</small></span><div className="referenceTitleActions"><button onClick={onUpload} title="Upload image folder"><FolderUp/></button><button onClick={onLayout} title="Adjust dashboard layout"><Settings2/></button></div></div>
      <div className="referenceContextCard"><small>Line 1</small><b>{info?.settings.line_name||'GDL6BV2'}</b></div>
      <div className="referenceContextCard"><small>Station 2</small><b>Inspection</b></div>
      <button className={`oakMode referenceMode ${mode.toLowerCase()}`} onClick={toggle} disabled={busy}><Activity/><span><b>{mode}</b><small>{mode==='AUTO'?'Automatic Operation':'Set-up Mode'}</small></span></button>
      <div className="referenceConnection" title={halconOnline?'All inspection services online':'Preview connection'}><i/><span><b>Connected</b><small><Database/> PLC / Camera / DB</small></span></div>
      {stats&&<div className="referenceYield"><i style={{'--yield':`${yieldPct*3.6}deg`} as React.CSSProperties}/><span><small>Yield (Current WT)</small><b>{yieldPct.toFixed(1)}%</b><em>{stats.evaluated.toLocaleString()} / 1,153</em></span></div>}
      {stats&&<div className="referenceTotal"><small>Total Lenses Today</small><b>{stats.total.toLocaleString()}</b><em>NOK: {stats.nokRate.toFixed(1)}%</em></div>}
      <div className="referenceClock"><small>{now.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</small><b>{now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</b></div>
      <div className="userMenu oakUserMenu">
        <button className="oakUser referenceUser" onClick={()=>setOpen(v=>!v)} title="User & workstation"><CircleUserRound/><span><b>{info?.session.username||'Operator'}</b><small>{info?.session.role||'Production'}</small></span><ChevronDown/></button>
        {open&&<div className="userPopover premiumUserPopover oakUserPopover">
          <div className="popoverTitle"><ShieldCheck/> User & workstation</div>
          <p className="popoverHint">Development identity. Production should obtain role/permissions from the authenticated backend.</p>
          <label>User<input value={user} onChange={e=>setUser(e.target.value)}/></label>
          <label>Role<select value={role} onChange={e=>setRole(e.target.value as Role)}><option>NoUser</option><option>Operator</option><option>Service</option><option>Administrator</option></select></label>
          <button onClick={login}><LogIn/> Apply user</button>
          <div className="userUtilityRow"><button onClick={()=>{setOpen(false);window.dispatchEvent(new Event('lens-open-customizer'))}}><Palette/>Interface Studio</button><button onClick={()=>{setOpen(false);onRefresh()}}><RefreshCw/>Refresh</button></div>
        </div>}
      </div>
      {notice&&<button className="oakHeaderNotice" onClick={()=>setNotice('')}>{notice}</button>}
    </header>
  }

  return <header className="topBar productionTopBar premiumTopBar">
    <div className="titleGroup productionTitle premiumTitleGroup"><div className="titleIcon apertureLogo" aria-hidden><span/><span/><span/><span/><span/><span/></div><div className="premiumTitleText"><div className="premiumTitleLine"><h1>Lens Inspection Control Center</h1><span>Dashboard</span></div><p>Optical Quality Inspection · Live workstation</p></div></div>
    <div className="premiumHeaderCenter"><div className="premiumMachineContext"><span><small>LINE</small><b>{info?.settings.line_name||'GDL6BV2'}</b></span><i/><span><small>STATION</small><b>{info?.settings.station_name||'Station 2'}</b></span></div><button className={`modePill productionMode premiumMode ${mode.toLowerCase()}`} onClick={toggle} disabled={busy}><i/><span><b>{mode}</b><small>{mode==='AUTO'?'Automatic':'Set-up'}</small></span></button><div className="connectionPill productionConnection premiumConnection" title="Backend / bridge status"><i/><span><b>{info?'Connected':'Unknown'}</b><small><Database/> API / HALCON</small></span></div></div>
    <div className="topStatus productionStatus premiumHeaderRight">{stats&&<><div className="premiumHeaderMetric yield"><small>YIELD</small><b>{yieldPct.toFixed(1)}%</b><em>{stats.evaluated} evaluated</em></div><div className="premiumHeaderMetric total"><small>LENSES</small><b>{stats.total.toLocaleString()}</b><em className={stats.nokRate>5?'dangerText':''}>{stats.nokRate.toFixed(1)}% NOK</em></div></>}<div className="premiumHeaderMetric clock"><small>{now.toLocaleDateString(undefined,{month:'short',day:'2-digit'})}</small><b>{now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</b><em>{now.toLocaleDateString(undefined,{weekday:'short'})}</em></div><div className="userMenu"><button className="userButton productionUser premiumUser" onClick={()=>setOpen(v=>!v)}><CircleUserRound/><span><b>{info?.session.username||'Operator'}</b><small>{info?.session.role||'Production'}</small></span><ChevronDown/></button>{open&&<div className="userPopover premiumUserPopover"><div className="popoverTitle"><ShieldCheck/> User & workstation</div><p className="popoverHint">Development identity. Production can be replaced with Active Directory / 5-2-1 authentication.</p><label>User<input value={user} onChange={e=>setUser(e.target.value)}/></label><label>Role<select value={role} onChange={e=>setRole(e.target.value as Role)}><option>NoUser</option><option>Operator</option><option>Service</option><option>Administrator</option></select></label><button onClick={login}><LogIn/> Apply user</button><div className="userUtilityRow"><button onClick={()=>{setOpen(false);window.dispatchEvent(new Event('lens-open-customizer'))}}><Palette/>Customize UI</button><button onClick={()=>{setOpen(false);onRefresh()}}><RefreshCw/>Refresh</button></div></div>}</div></div>
    {notice&&<button className="oakHeaderNotice legacy" onClick={()=>setNotice('')}>{notice}</button>}
  </header>
}
