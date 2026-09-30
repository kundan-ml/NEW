'use client';

type ClassicHeaderProps={
  onSwitchUser?:()=>void;
  onImageFilter?:()=>void;
  onRegistration?:()=>void;
  onFocus?:()=>void;
  onDataset?:()=>void;
  onInfo?:()=>void;
  onExit?:()=>void;
  onUi?:()=>void;
};

export function ClassicHeader({onSwitchUser,onImageFilter,onRegistration,onFocus,onDataset,onInfo,onExit,onUi}:ClassicHeaderProps){
  const go=(href:string)=>{window.location.href=href};
  return <div className="pdfMenuStrip sharedClassicHeader" role="navigation" aria-label="Classic UI navigation">
    <button onClick={onSwitchUser}>Switch User</button>
    <button onClick={onImageFilter||(()=>go('/storage'))}>Image Filter</button>
    <button onClick={onRegistration||(()=>go('/registration'))}>Registration</button>
    <button onClick={onFocus||(()=>go('/focus'))}>Focus</button>
    <button onClick={()=>go('/settings')}>Settings</button>
    <button onClick={()=>go('/bv-test')}>BV Test</button>
    <button onClick={onInfo}>Info</button>
    <button onClick={onExit}>Exit</button>
    <span/>
    <button onClick={onDataset}>Dataset</button>
    <button onClick={onUi}>UI</button>
  </div>;
}
