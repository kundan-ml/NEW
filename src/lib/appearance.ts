import {GRADIENT_ANGLES,gradientCss,type GradientDirection,type LayerGradients,type ThemeTokens} from './themes';

export const COMPONENTS = [
  ['history', 'WT History'], ['machine', 'Installation controls'],
  ['viewer', 'Image viewer'], ['details', 'Current Lens'],
  ['logs', 'Bottom workspace'], ['wtView', 'WT View tiles'],
  ['header', 'Top header'], ['sidebar', 'Navigation rail'],
  ['matrixHead', 'History heading'], ['viewerToolbar', 'Viewer toolbar'],
  ['bottomTabs', 'Bottom tabs'], ['actionButtons', 'Action buttons'],
  ['canvas', 'Image canvas'], ['cards', 'General cards'],
  ['dialogs', 'Dialog windows'], ['formControls', 'Form controls'],
] as const;
export type ComponentId = typeof COMPONENTS[number][0];
export type ComponentStyle = {background:string;opacity:number;border:string;radius:number;shadow:number};
export type ComponentStyles = Record<ComponentId,ComponentStyle>;
export const defaultComponentStyles = ():ComponentStyles => Object.fromEntries(
  COMPONENTS.map(([key])=>[key,{background:'',opacity:1,border:'',radius:0,shadow:1}])
) as ComponentStyles;

type Appearance = {
  customBg:string;customPanel:string;customHeader:string;customButton:string;customCanvas:string;
  customPrimary:string;customSecondary:string;customAccent:string;
  gradientStart:string;gradientEnd:string;gradientDirection:GradientDirection;
  customBorder:string;layerGradients:LayerGradients;glass:number;
  shadowColor?:string;shadowStrength?:number;shadowBlur?:number;borderOpacity?:number;glow?:boolean;
  componentStyles?:Partial<ComponentStyles>;
};
const percent=(value:number)=>`${Math.round(Math.max(0,Math.min(1,value))*100)}%`;
const transparentFill=(color:string,opacity:number)=>opacity>=1?color:`color-mix(in srgb, ${color} ${percent(opacity)}, transparent)`;
const layerFill=(layer:LayerGradients[keyof LayerGradients],fallback:string,opacity:number,solidOverride=false)=>{
  if(solidOverride)return transparentFill(fallback,opacity);
  if(opacity>=1)return gradientCss(layer,fallback);
  if(!layer?.enabled)return transparentFill(fallback,opacity);
  return `linear-gradient(${layer.angle}deg,${[...layer.stops].sort((a,b)=>a.position-b.position).map(stop=>`${transparentFill(stop.color,opacity)} ${stop.position}%`).join(',')})`;
};

export function appearanceVariables(prefs:Appearance,tokens:ThemeTokens):Record<string,string>{
  const surfaceOpacity=Math.max(.2,Math.min(1,prefs.glass??1));
  const blur=Math.max(0,Math.min(80,prefs.shadowBlur??24));
  const strength=Math.max(0,Math.min(2,prefs.shadowStrength??1));
  const shadowColor=prefs.shadowColor||'#000000';
  const shadow=(blurFactor:number,alpha:number,offset:number)=>strength===0?'none':`0 ${offset}px ${Math.round(blur*blurFactor)}px ${transparentFill(shadowColor,Math.min(1,alpha*strength))}${prefs.glow?`, 0 0 ${Math.round(blur*.8)}px ${transparentFill(tokens.accent,.12*strength)}`:''}`;
  const border=prefs.customBorder||tokens.border;
  const vars:Record<string,string>={
    '--fill-surface':layerFill(prefs.layerGradients.surface,prefs.customPanel||tokens.surface,surfaceOpacity,!!prefs.customPanel),
    '--fill-elevated':layerFill(prefs.layerGradients.elevated,prefs.customHeader||tokens.surfaceElevated,surfaceOpacity,!!prefs.customHeader),
    '--fill-button':layerFill(prefs.layerGradients.button,prefs.customButton||tokens.surfaceHover,surfaceOpacity,!!prefs.customButton),
    '--fill-background':prefs.customBg||gradientCss(prefs.layerGradients.background,tokens.background),
    '--fill-primary':prefs.customPrimary||((prefs.gradientStart||prefs.gradientEnd)?`linear-gradient(${GRADIENT_ANGLES[prefs.gradientDirection]},${prefs.gradientStart||tokens.gradientStart},${prefs.gradientEnd||tokens.gradientEnd})`:gradientCss(prefs.layerGradients.primary,tokens.primary)),
    '--fill-secondary':prefs.customSecondary||gradientCss(prefs.layerGradients.secondary,tokens.secondary),
    '--fill-accent':prefs.customAccent||gradientCss(prefs.layerGradients.accent,tokens.accent),
    '--fill-canvas':prefs.customCanvas||gradientCss(prefs.layerGradients.canvas,'#000000'),
    '--shadow-sm':shadow(.55,.28,3),'--shadow-md':shadow(1.3,.38,13),'--shadow-lg':shadow(2.5,.50,30),
    '--studio-border':transparentFill(border,prefs.borderOpacity??1),
    '--control-border':transparentFill(border,prefs.borderOpacity??1),
  };
  const defaults=defaultComponentStyles();
  for(const [id] of COMPONENTS){
    const config={...defaults[id],...prefs.componentStyles?.[id]};
    const category=id==='canvas'?'canvas':id==='header'||id==='matrixHead'||id==='viewerToolbar'||id==='bottomTabs'?'elevated':id==='actionButtons'||id==='formControls'?'button':'surface';
    const base=config.background||(category==='canvas'?prefs.customCanvas||'#000000':category==='elevated'?prefs.customHeader||tokens.surfaceElevated:category==='button'?prefs.customButton||tokens.surfaceHover:prefs.customPanel||tokens.surface);
    vars[`--studio-${id}-fill`]=config.background||config.opacity<1
      ? transparentFill(base,config.opacity)
      : `var(--fill-${category})`;
    vars[`--studio-${id}-border`]=config.border||'var(--studio-border)';
    vars[`--studio-${id}-radius`]=config.radius>0?`${config.radius}px`:'var(--radius)';
    vars[`--studio-${id}-shadow`]=config.shadow===0?'none':shadow(1.3,.38*config.shadow,13);
  }
  vars['--studio-header-fill']=prefs.componentStyles?.header?.background
    ? transparentFill(prefs.componentStyles.header.background,prefs.componentStyles.header.opacity)
    : 'var(--fill-elevated)';
  vars['--studio-sidebar-fill']=prefs.componentStyles?.sidebar?.background
    ? transparentFill(prefs.componentStyles.sidebar.background,prefs.componentStyles.sidebar.opacity)
    : 'var(--fill-surface)';
  return vars;
}
