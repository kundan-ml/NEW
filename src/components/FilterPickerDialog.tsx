"use client";

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {CalendarClock,ChevronLeft,ChevronRight,FolderOpen,Loader2,X} from 'lucide-react';
import type {api} from '@/lib/api';

export function FilterPickerDialog({title,subtitle,onClose,children,variant='folder'}:{title:string;subtitle:string;onClose:()=>void;children:ReactNode;variant?:'folder'|'date'|'time'}){
  const root=useRef<HTMLDivElement>(null);
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    root.current?.querySelector<HTMLElement>('button,input,select')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close.current();}
      if(event.key==='Tab'){
        const items=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')||[]);
        const first=items[0],last=items[items.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }
    };
    window.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('keydown',key,true);previous?.focus()};
  },[]);
  return createPortal(<div className="filterPickerBackdrop" onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <div ref={root} className={`filterPickerDialog filterPicker-${variant}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><i className="filterPickerBadge">{variant==='folder'?<FolderOpen size={22}/>:<CalendarClock size={22}/>}</i><span><small>{variant==='folder'?'BACKEND FOLDERS':'SCHEDULE TIMING'}</small><h2>{title}</h2><p>{subtitle}</p></span><button type="button" aria-label="Close picker" onClick={onClose}><X size={20}/></button></header>
      {children}
    </div>
  </div>,document.body);
}

export function BackendFolderPicker({folders,busy,error,onNavigate,onSelect,onClose,title='Choose a destination'}:{folders:Awaited<ReturnType<typeof api.localFolders>>|null;busy:boolean;error:string;onNavigate:(path:string)=>void;onSelect:(path:string)=>void;onClose:()=>void;title?:string}){
  return <FilterPickerDialog title={title} subtitle="Select a folder on the inspection backend computer." onClose={onClose}>
    <div className="filterFolderPath"><FolderOpen size={18}/><code>{folders?.path||'Loading folders…'}</code><button type="button" disabled={busy||!folders?.parent} onClick={()=>{if(folders?.parent)onNavigate(folders.parent)}}>Up one level</button></div>
    <div className="filterFolderList" aria-busy={busy}>{busy?<p><Loader2 className="spin"/>Loading folders…</p>:error?<p role="alert">{error}</p>:folders?.folders.map(folder=><button type="button" key={folder.path} onClick={()=>onNavigate(folder.path)}><FolderOpen size={20}/><span>{folder.name}</span><ChevronRight size={16}/></button>)}{!busy&&!error&&folders&&!folders.folders.length&&<p>No subfolders. You can select this folder.</p>}{folders?.truncated&&<p>Showing the first 500 folders. Enter an exact path in the main form if needed.</p>}</div>
    <footer><span>{busy?'Reading directory…':`${folders?.folders.length||0} folders`}</span><button type="button" onClick={onClose}>Cancel</button><button type="button" className="filterPickerConfirm" disabled={busy||!!error||!folders} onClick={()=>{if(folders)onSelect(folders.path)}}>Use this folder</button></footer>
  </FilterPickerDialog>;
}

const dateValue=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function SchedulePicker({kind,value,onChange,label}:{kind:'date'|'time';value:string;onChange:(value:string)=>void;label:string}){
  const[open,setOpen]=useState(false);
  const[draft,setDraft]=useState(value);
  const[month,setMonth]=useState(()=>new Date());
  const start=new Date(month.getFullYear(),month.getMonth(),1);
  const offset=(start.getDay()+6)%7;
  const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const display=value?(kind==='date'?new Date(`${value}T12:00:00`).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):value):'Choose date';
  function show(){setDraft(value||(kind==='date'?dateValue(new Date()):'00:00'));setMonth(value&&kind==='date'?new Date(`${value}T12:00:00`):new Date());setOpen(true)}
  return <><button type="button" className="filterDateTrigger" onClick={show}><CalendarClock size={17}/><span>{display}</span><ChevronRight size={15}/></button>
    {open&&<FilterPickerDialog variant={kind} title={label} subtitle="Schedule uses the backend PC’s local time." onClose={()=>setOpen(false)}>
      {kind==='date'?<div className="filterCalendar">
        <nav><button type="button" aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={18}/></button><select aria-label="Month" value={month.getMonth()} onChange={event=>setMonth(new Date(month.getFullYear(),Number(event.target.value),1))}>{Array.from({length:12},(_,index)=><option key={index} value={index}>{new Date(2026,index,1).toLocaleDateString(undefined,{month:'long'})}</option>)}</select><input aria-label="Year" type="number" min="1900" max="9999" value={month.getFullYear()} onChange={event=>{const year=Number(event.target.value);if(year>=1900&&year<=9999)setMonth(new Date(year,month.getMonth(),1))}}/><button type="button" aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={18}/></button></nav>
        <div className="filterCalendarGrid">{['Mo','Tu','We','Th','Fr','Sa','Su'].map(day=><small key={day}>{day}</small>)}
          {Array.from({length:offset},(_,index)=><span key={`blank${index}`}/>)}
          {Array.from({length:days},(_,index)=>{const date=dateValue(new Date(month.getFullYear(),month.getMonth(),index+1));return <button type="button" key={date} aria-label={date} aria-pressed={draft===date} className={draft===date?'selected':''} onClick={()=>setDraft(date)}>{index+1}</button>})}
        </div>
      </div>:<div className="filterTimePicker"><label>Hour<select value={draft.split(':')[0]} onChange={event=>setDraft(`${event.target.value}:${draft.split(':')[1]}`)}>{Array.from({length:24},(_,index)=>{const item=String(index).padStart(2,'0');return <option key={item}>{item}</option>})}</select></label><b>:</b><label>Minute<select value={draft.split(':')[1]} onChange={event=>setDraft(`${draft.split(':')[0]}:${event.target.value}`)}>{Array.from({length:60},(_,index)=>{const item=String(index).padStart(2,'0');return <option key={item}>{item}</option>})}</select></label></div>}
      <footer><span>{kind==='date'?<button type="button" onClick={()=>{const now=new Date();setMonth(now);setDraft(dateValue(now))}}>Today</button>:draft}</span><button type="button" onClick={()=>setOpen(false)}>Cancel</button><button type="button" className="filterPickerConfirm" onClick={()=>{onChange(draft);setOpen(false)}}>Apply {kind}</button></footer>
    </FilterPickerDialog>}
  </>;
}
