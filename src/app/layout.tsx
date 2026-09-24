import './globals.css';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ClientProviders} from '@/components/ClientProviders';
import type {UiPreferences} from '@/components/UIProvider';
import {GRADIENT_ANGLES,THEMES,createDefaultLayerGradients,gradientCss,normalizeTheme} from '@/lib/themes';
import {appearanceVariables} from '@/lib/appearance';

export const dynamic='force-dynamic';

async function readInitialPreferences():Promise<Partial<UiPreferences>>{
  try{
    const preferences=JSON.parse(await readFile(path.join(process.cwd(),'config','ui-preferences.json'),'utf8')) as Partial<UiPreferences>;
    if(preferences.theme==='premium-white'&&(preferences.whitePdfPolishVersion||0)<1){
      if(preferences.customBg?.toLowerCase()==='#fafafa')preferences.customBg='';
      if(preferences.customPanel?.toLowerCase()==='#c2c2c2')preferences.customPanel='';
      if(preferences.componentStyles?.history?.opacity===.31&&preferences.componentStyles.history.background==='')preferences.componentStyles.history={...preferences.componentStyles.history,opacity:1,radius:0};
      const primary=preferences.layerGradients?.primary;
      if(primary?.enabled&&primary.stops.length===2&&primary.stops[0].color.toLowerCase()==='#5b5fc7'&&primary.stops[1].color.toLowerCase()==='#00a6a6')preferences.layerGradients!.primary=createDefaultLayerGradients('premium-white').primary;
    }
    return preferences;
  }catch{return{theme:'pdf-skeleton'}}
}

export const metadata={
  title:'Emage Group · Lens Inspection Control Center',
  description:'Emage Group optical contact lens inspection workstation'
};

export default async function RootLayout({children}:{children:React.ReactNode}){
  const preferences=await readInitialPreferences();
  const theme=normalizeTheme(preferences.theme),tokens=THEMES[theme].tokens,angle=GRADIENT_ANGLES[preferences.gradientDirection||'to-bottom-right'],layers={...createDefaultLayerGradients(theme),...(preferences.layerGradients||{})};
  const style={
    '--control-bg':preferences.customBg||tokens.background,
    '--control-panel':preferences.customPanel||tokens.surface,
    '--control-header':preferences.customHeader||tokens.surfaceElevated,
    '--control-button':preferences.customButton||tokens.surfaceHover,
    '--control-canvas':preferences.customCanvas||'#000000',
    '--control-border':preferences.customBorder||tokens.border,
    '--control-text':preferences.customText||tokens.textPrimary,
    '--app-bg':preferences.customBg||tokens.background,'--app-bg2':tokens.backgroundSecondary,'--app-panel':preferences.customPanel||tokens.surface,'--app-panel2':preferences.customButton||tokens.surfaceHover,'--app-raised':preferences.customHeader||tokens.surfaceElevated,'--app-border':preferences.customBorder||tokens.border,'--app-borderStrong':tokens.borderStrong,'--app-text':preferences.customText||tokens.textPrimary,'--app-muted':tokens.textMuted,'--app-soft':tokens.textSecondary,
    '--background':preferences.customBg||tokens.background,'--background-secondary':tokens.backgroundSecondary,'--surface':preferences.customPanel||tokens.surface,'--surface-elevated':preferences.customHeader||tokens.surfaceElevated,'--surface-hover':preferences.customButton||tokens.surfaceHover,'--text-primary':preferences.customText||tokens.textPrimary,'--text-secondary':tokens.textSecondary,'--text-muted':tokens.textMuted,'--border':preferences.customBorder||tokens.border,'--border-strong':tokens.borderStrong,'--primary':preferences.customPrimary||tokens.primary,'--secondary':preferences.customSecondary||tokens.secondary,'--accent':preferences.customAccent||tokens.accent,'--gradient-start':preferences.gradientStart||tokens.gradientStart,'--gradient-end':preferences.gradientEnd||tokens.gradientEnd,'--gradient-angle':angle,'--gradient-primary':`linear-gradient(${angle},${preferences.gradientStart||tokens.gradientStart},${preferences.gradientEnd||tokens.gradientEnd})`,'--shadow-sm':tokens.shadowSm,'--shadow-md':tokens.shadowMd,'--shadow-lg':tokens.shadowLg,
    '--bg':preferences.customBg||tokens.background,'--text':preferences.customText||tokens.textPrimary,background:preferences.customBg||tokens.background,color:preferences.customText||tokens.textPrimary
    ,'--fill-background':gradientCss(layers.background,preferences.customBg||tokens.background),'--fill-surface':gradientCss(layers.surface,preferences.customPanel||tokens.surface),'--fill-elevated':gradientCss(layers.elevated,preferences.customHeader||tokens.surfaceElevated),'--fill-button':gradientCss(layers.button,preferences.customButton||tokens.surfaceHover),'--fill-primary':gradientCss(layers.primary,preferences.customPrimary||tokens.primary),'--fill-secondary':gradientCss(layers.secondary,preferences.customSecondary||tokens.secondary),'--fill-accent':gradientCss(layers.accent,preferences.customAccent||tokens.accent),'--fill-canvas':gradientCss(layers.canvas,preferences.customCanvas||'#000')
    ,...appearanceVariables({
      customBg:preferences.customBg||'',customPanel:preferences.customPanel||'',customHeader:preferences.customHeader||'',
      customButton:preferences.customButton||'',customCanvas:preferences.customCanvas||'',customBorder:preferences.customBorder||'',
      customPrimary:preferences.customPrimary||'',customSecondary:preferences.customSecondary||'',customAccent:preferences.customAccent||'',
      gradientStart:preferences.gradientStart||'',gradientEnd:preferences.gradientEnd||'',gradientDirection:preferences.gradientDirection||'to-bottom-right',
      layerGradients:layers,glass:preferences.glass??1,shadowColor:preferences.shadowColor,
      shadowStrength:preferences.shadowStrength,shadowBlur:preferences.shadowBlur,borderOpacity:preferences.borderOpacity,glow:preferences.glow,
      componentStyles:preferences.componentStyles,
    },tokens)
  } as React.CSSProperties;
  return <html lang="en" data-theme={theme} data-density={preferences.density||'compact'} data-workspace={preferences.manualSkeleton?'manual':'modern'} style={style}>
    <body style={{background:preferences.customBg||tokens.background}}>
      <ClientProviders initialPreferences={preferences}>{children}</ClientProviders>
    </body>
  </html>;
}
