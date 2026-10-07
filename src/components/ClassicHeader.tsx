'use client';
import {useState} from 'react';
import {openManual} from '@/lib/open-manual';

type ClassicHeaderProps={
  onSwitchUser?:()=>void;
  onImageFilter?:()=>void;
  onRegistration?:()=>void;
  onFocus?:()=>void;
  onSettings?:()=>void;
  onBvTest?:()=>void;
  onDataset?:()=>void;
  onInfo?:()=>void;
  onTrendLine?:()=>void;
  onExit?:()=>void;
  onUi?:()=>void;
};

export function ClassicHeader({onSwitchUser,onImageFilter,onRegistration,onFocus,onSettings,onBvTest,onDataset,onInfo,onTrendLine,onExit,onUi}:ClassicHeaderProps){
  const[helpError,setHelpError]=useState('');
  const go=(href:string)=>{window.location.href=href};
  return <><div className="pdfMenuStrip sharedClassicHeader" role="navigation" aria-label="Classic UI navigation">
    <button onClick={onSwitchUser}>Switch User</button>
    <button onClick={onImageFilter||(()=>go('/storage'))}>Image Filter</button>
    <button onClick={onRegistration||(()=>go('/registration'))}>Registration</button>
    <button onClick={onFocus||(()=>go('/focus'))}>Focus</button>
    <button onClick={onSettings||(()=>go('/settings'))}>Settings</button>
    <button onClick={onBvTest||(()=>go('/bv-test'))}>BV Test</button>
    <button onClick={onInfo}>Info</button>
    <button onClick={()=>void openManual().catch(error=>setHelpError(error.message))}>Help</button>
    <button aria-label="Open Trend Line" onClick={onTrendLine||(()=>go('/?trendline=1'))}>Trendline</button>
    <button onClick={onExit}>Exit</button>
    <span/>
    <button onClick={onDataset}>Dataset</button>
    <button onClick={onUi}>UI</button>
  </div>{helpError&&<button className="inspectionHelpNotice" role="alert" onClick={()=>setHelpError('')}>{helpError}</button>}</>;
}
