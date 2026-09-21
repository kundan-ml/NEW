'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';

export type ThemePreset='charcoal'|'graphite'|'slate'|'navy'|'classic'|'arctic';
export type AccentPreset='bronze'|'azure'|'cyan'|'violet'|'emerald';
export type Density='compact'|'comfortable'|'spacious';
export type StatusShape='circle'|'square'|'diamond'|'ring'|'plus';
export type UiPreferences={
  theme:ThemePreset;
  accent:AccentPreset;
  density:Density;
  fontScale:number;
  radius:number;
  glass:number;
  motion:boolean;
  glow:boolean;
  sidebarCollapsed:boolean;
  manualSkeleton:boolean;
  uiLocked:boolean;
  sidebarWidth:number;
  headerHeight:number;
  okColor:string;nokColor:string;warnColor:string;idleColor:string;
  okShape:StatusShape;nokShape:StatusShape;warnShape:StatusShape;idleShape:StatusShape;
  customBg:string;customPanel:string;customHeader:string;customButton:string;customCanvas:string;customBorder:string;customText:string;
  historyWidth:number;
  viewerWidth:number;
  detailsWidth:number;
  inspectionHistoryWidth:number;
  inspectionControlWidth:number;
  inspectionDetailsWidth:number;
  trayHeight:number;
  bottomHeight:number;
  trendWidth:number;
  logsWidth:number;
  actionsWidth:number;
  showHistory:boolean;
  showDetails:boolean;
  showCommandBar:boolean;
  showKpis:boolean;
  showTray:boolean;
  showWorkspace:boolean;
  showTrend:boolean;
  showLogs:boolean;
  showActions:boolean;
};

const DEFAULTS:UiPreferences={
  theme:'charcoal',accent:'bronze',density:'compact',fontScale:1,radius:8,glass:1,motion:true,glow:false,
  sidebarCollapsed:false,manualSkeleton:false,uiLocked:false,sidebarWidth:76,headerHeight:46,okColor:'#44df83',nokColor:'#ff4c5a',warnColor:'#ffc72f',idleColor:'#607889',okShape:'circle',nokShape:'circle',warnShape:'diamond',idleShape:'square',customBg:'',customPanel:'',customHeader:'',customButton:'',customCanvas:'',customBorder:'',customText:'',historyWidth:.94,viewerWidth:1.28,detailsWidth:.84,inspectionHistoryWidth:300,inspectionControlWidth:210,inspectionDetailsWidth:300,trayHeight:128,bottomHeight:198,
  trendWidth:1.43,logsWidth:.82,actionsWidth:.69,
  showHistory:true,showDetails:true,showCommandBar:false,showKpis:true,showTray:true,showWorkspace:true,
  showTrend:true,showLogs:true,showActions:true
};

type Ctx={prefs:UiPreferences;set:<K extends keyof UiPreferences>(key:K,value:UiPreferences[K])=>void;patch:(value:Partial<UiPreferences>)=>void;reset:()=>void};
const UIContext=createContext<Ctx|null>(null);

const ACCENT_HUES:Record<AccentPreset,string>={bronze:'38',azure:'211',cyan:'190',violet:'252',emerald:'155'};
const THEME_TOKENS:Record<ThemePreset,{bg:string;bg2:string;panel:string;panel2:string;raised:string;border:string;borderStrong:string;text:string;muted:string;soft:string}>={
  charcoal:{bg:'#0b0d0f',bg2:'#101316',panel:'#15191c',panel2:'#1a1f23',raised:'#22282d',border:'#343b40',borderStrong:'#474f55',text:'#eeece7',muted:'#8d969c',soft:'#b8bec1'},
  graphite:{bg:'#101214',bg2:'#171a1d',panel:'#1e2226',panel2:'#252a2f',raised:'#2d3338',border:'#41484e',borderStrong:'#596168',text:'#f0f1f1',muted:'#969fa5',soft:'#c1c7ca'},
  slate:{bg:'#0d1419',bg2:'#131d24',panel:'#19252d',panel2:'#202f39',raised:'#293b47',border:'#38505f',borderStrong:'#4b687a',text:'#edf3f5',muted:'#8da2ad',soft:'#b8c8cf'},
  navy:{bg:'#080e16',bg2:'#0d1722',panel:'#12202d',panel2:'#182b3b',raised:'#20384b',border:'#29475d',borderStrong:'#3b6079',text:'#edf5fa',muted:'#8198aa',soft:'#aec2cf'},
  classic:{bg:'#12110f',bg2:'#191713',panel:'#211f1a',panel2:'#29261f',raised:'#343026',border:'#494338',borderStrong:'#635a49',text:'#f1ede3',muted:'#9e9788',soft:'#c9c0ad'},
  arctic:{bg:'#e9edf0',bg2:'#dde3e7',panel:'#f6f8f9',panel2:'#e9eef1',raised:'#ffffff',border:'#b9c4ca',borderStrong:'#8f9ea6',text:'#182128',muted:'#62727b',soft:'#344650'}
};

export function UIProvider({children}:{children:React.ReactNode}){
  const[prefs,setPrefs]=useState<UiPreferences>(DEFAULTS);
  const[hydrated,setHydrated]=useState(false);
  useEffect(()=>{
    try{const saved=localStorage.getItem('lens-ui-prefs-v12');if(saved)setPrefs({...DEFAULTS,...JSON.parse(saved)})}catch{}
    setHydrated(true);
  },[]);
  useEffect(()=>{
    if(!hydrated)return;
    try{const serialized=JSON.stringify(prefs);if(localStorage.getItem('lens-ui-prefs-v12')!==serialized)localStorage.setItem('lens-ui-prefs-v12',serialized)}catch{}
    const root=document.documentElement;
    root.dataset.theme=prefs.theme;
    root.dataset.density=prefs.density;
    root.dataset.motion=prefs.motion?'on':'off';
    root.style.setProperty('--accent-hue',ACCENT_HUES[prefs.accent]);
    const palette=THEME_TOKENS[prefs.theme]||THEME_TOKENS.charcoal;Object.entries(palette).forEach(([key,value])=>root.style.setProperty(`--app-${key}`,value));
    root.style.setProperty('--control-bg',prefs.customBg||palette.bg);root.style.setProperty('--control-panel',prefs.customPanel||palette.panel);root.style.setProperty('--control-header',prefs.customHeader||palette.raised);root.style.setProperty('--control-button',prefs.customButton||palette.panel2);root.style.setProperty('--control-canvas',prefs.customCanvas||'#000000');root.style.setProperty('--control-border',prefs.customBorder||palette.border);root.style.setProperty('--control-text',prefs.customText||palette.text);
    root.style.setProperty('--ui-font-scale',String(prefs.fontScale));
    root.style.setProperty('--radius',`${prefs.radius}px`);
    root.style.setProperty('--glass-alpha',String(prefs.glass));
    root.style.setProperty('--shell-sidebar-width',`${prefs.sidebarWidth}px`);
    root.style.setProperty('--shell-header-height',`${prefs.headerHeight}px`);
    root.style.setProperty('--status-ok',prefs.okColor);root.style.setProperty('--status-nok',prefs.nokColor);root.style.setProperty('--status-warn',prefs.warnColor);root.style.setProperty('--status-idle',prefs.idleColor);
    root.style.setProperty('--history-fr',`${prefs.historyWidth}fr`);
    root.style.setProperty('--viewer-fr',`${prefs.viewerWidth}fr`);
    root.style.setProperty('--details-fr',`${prefs.detailsWidth}fr`);
    root.style.setProperty('--inspection-history-width',`${prefs.inspectionHistoryWidth}px`);
    root.style.setProperty('--inspection-control-width',`${prefs.inspectionControlWidth}px`);
    root.style.setProperty('--inspection-details-width',`${prefs.inspectionDetailsWidth}px`);
    root.style.setProperty('--dashboard-tray-height',`${prefs.trayHeight}px`);
    root.style.setProperty('--dashboard-bottom-height',`${prefs.bottomHeight}px`);
    root.style.setProperty('--bottom-columns',[
      prefs.showTrend?`${prefs.trendWidth}fr`:'',
      prefs.showLogs?`${prefs.logsWidth}fr`:'',
      prefs.showActions?`${prefs.actionsWidth}fr`:''
    ].filter(Boolean).join(' ')||'1fr');
    root.dataset.glow=prefs.glow?'on':'off';
    root.dataset.sidebar=prefs.sidebarCollapsed?'collapsed':'expanded';
    root.dataset.workspace=prefs.manualSkeleton?'manual':'modern';
    root.dataset.uiLocked=prefs.uiLocked?'true':'false';
    root.dataset.okShape=prefs.okShape;root.dataset.nokShape=prefs.nokShape;root.dataset.warnShape=prefs.warnShape;root.dataset.idleShape=prefs.idleShape;
  },[prefs,hydrated]);
  useEffect(()=>{const sync=(e:StorageEvent)=>{if(e.key==='lens-ui-prefs-v12'&&e.newValue)try{const incoming={...DEFAULTS,...JSON.parse(e.newValue)};setPrefs(current=>JSON.stringify(current)===JSON.stringify(incoming)?current:incoming)}catch{}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync)},[]);
  const set=useCallback(<K extends keyof UiPreferences>(key:K,value:UiPreferences[K])=>setPrefs(p=>{const statusKey=['okColor','nokColor','warnColor','idleColor','okShape','nokShape','warnShape','idleShape'].includes(String(key));return p.uiLocked&&key!=='uiLocked'&&!statusKey?p:{...p,[key]:value}}),[]);
  const patch=useCallback((value:Partial<UiPreferences>)=>setPrefs(p=>p.uiLocked?p:{...p,...value}),[]);
  const reset=useCallback(()=>setPrefs(p=>p.uiLocked?p:DEFAULTS),[]);
  const value=useMemo(()=>({prefs,set,patch,reset}),[prefs,set,patch,reset]);
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(){const c=useContext(UIContext);if(!c)throw new Error('useUI must be used inside UIProvider');return c}
