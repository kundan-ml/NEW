'use client';
import {useState} from 'react';
import {openManual} from '@/lib/open-manual';
import {useUI} from './UIProvider';
import {ViewerThemeButton} from './ViewerThemeButton';

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
  const{loggedIn,canCustomize}=useUI();
  const go=(href:string)=>{window.location.href=href};
  return <><div className="pdfMenuStrip sharedClassicHeader" role="navigation" aria-label="Classic UI navigation">
    <button onClick={onSwitchUser}>Switch User</button>
    <button disabled={!loggedIn} onClick={onImageFilter||(()=>go('/storage'))}>Image Filter</button>
    <button disabled={!loggedIn} onClick={onRegistration||(()=>go('/registration'))}>Registration</button>
    <button disabled={!loggedIn} onClick={onFocus||(()=>go('/focus'))}>Focus</button>
    <button disabled={!loggedIn} onClick={onSettings||(()=>go('/settings'))}>Settings</button>
    <button disabled={!loggedIn} onClick={onBvTest||(()=>go('/bv-test'))}>BV Test</button>
    <button disabled={!loggedIn} onClick={onInfo}>Info</button>
    <button disabled={!loggedIn} onClick={()=>void openManual().catch(error=>setHelpError(error.message))}>Help</button>
    <button disabled={!loggedIn} aria-label="Open Trend Line" onClick={onTrendLine||(()=>go('/?trendline=1'))}>Trendline</button>
    <button disabled={!loggedIn} onClick={onExit}>Exit</button>
    <span/>
    <button disabled={!loggedIn} onClick={onDataset}>Dataset</button>
    {canCustomize?<button onClick={onUi}>UI</button>:<ViewerThemeButton/>}
  </div>{helpError&&<button className="inspectionHelpNotice" role="alert" onClick={()=>setHelpError('')}>{helpError}</button>}</>;
}
