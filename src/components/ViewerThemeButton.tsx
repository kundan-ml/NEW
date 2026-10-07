'use client';

import {Moon,Sun} from 'lucide-react';
import {useUI} from './UIProvider';

/** Viewer-only appearance choice; never changes the shared admin profile. */
export function ViewerThemeButton({className}:{className?:string}){
  const{prefs,toggleViewerTheme}=useUI();
  const light=prefs.theme==='premium-white';
  return <button type="button" className={className} onClick={toggleViewerTheme} aria-label={light?'Switch to dark theme (Graphite)':'Switch to light theme (Premium White)'} title={light?'Dark theme · Graphite':'Light theme · Premium White'}>{light?<Moon size={16}/>:<Sun size={16}/>}</button>;
}
