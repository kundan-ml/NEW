export type ThemeName='pdf-skeleton'|'premium-white'|'midnight'|'graphite'|'aurora';
export type GradientDirection='to-right'|'to-left'|'to-bottom'|'to-top'|'to-bottom-right'|'to-top-right';
export type GradientLayerName='background'|'surface'|'elevated'|'button'|'primary'|'secondary'|'accent'|'canvas';
export type GradientStop={color:string;position:number};
export type LayerGradient={enabled:boolean;angle:number;stops:GradientStop[]};
export type LayerGradients=Record<GradientLayerName,LayerGradient>;

export type ThemeTokens={
  background:string;backgroundSecondary:string;surface:string;surfaceElevated:string;surfaceHover:string;
  textPrimary:string;textSecondary:string;textMuted:string;border:string;borderStrong:string;
  primary:string;secondary:string;accent:string;gradientStart:string;gradientEnd:string;
  shadowSm:string;shadowMd:string;shadowLg:string;
};

export type ThemeDefinition={name:ThemeName;label:string;description:string;character:string;tokens:ThemeTokens};

export const GRADIENT_ANGLES:Record<GradientDirection,string>={
  'to-right':'90deg','to-left':'270deg','to-bottom':'180deg','to-top':'0deg','to-bottom-right':'135deg','to-top-right':'45deg'
};

export const THEMES:Record<ThemeName,ThemeDefinition>={
  'pdf-skeleton':{name:'pdf-skeleton',label:'Classic UI',description:'Technical document workspace',character:'document',tokens:{background:'#141414',backgroundSecondary:'#1f1f1f',surface:'#242424',surfaceElevated:'#292929',surfaceHover:'#333333',textPrimary:'#ffffff',textSecondary:'#e0e0e0',textMuted:'#adadad',border:'#454545',borderStrong:'#666666',primary:'#7f85f5',secondary:'#c77dff',accent:'#2ed5c4',gradientStart:'#5b5fc7',gradientEnd:'#31c7b5',shadowSm:'0 3px 12px rgba(0,0,0,.32)',shadowMd:'0 14px 38px rgba(0,0,0,.42)',shadowLg:'0 30px 88px rgba(0,0,0,.60)'}},
  'premium-white':{name:'premium-white',label:'Premium White',description:'Porcelain paper, cobalt and deep teal',character:'light',tokens:{background:'#f2f5f6',backgroundSecondary:'#e7edf0',surface:'#ffffff',surfaceElevated:'#edf3f5',surfaceHover:'#e7eff3',textPrimary:'#172d3b',textSecondary:'#385365',textMuted:'#647b89',border:'#cbd8df',borderStrong:'#9fb5c1',primary:'#315cbd',secondary:'#7a58a7',accent:'#087f83',gradientStart:'#315cbd',gradientEnd:'#0a9290',shadowSm:'0 3px 12px rgba(27,62,80,.09)',shadowMd:'0 14px 36px rgba(27,62,80,.14)',shadowLg:'0 30px 76px rgba(27,62,80,.20)'}},
  midnight:{name:'midnight',label:'Midnight Abyss',description:'VS Code Abyss deep-blue focus',character:'dark',tokens:{background:'#000c18',backgroundSecondary:'#071426',surface:'#101c30',surfaceElevated:'#181f2f',surfaceHover:'#1d3150',textPrimary:'#d7e6ff',textSecondary:'#8faee8',textMuted:'#6688cc',border:'#263e68',borderStrong:'#596f99',primary:'#4b8cff',secondary:'#f280d0',accent:'#22c96b',gradientStart:'#1f6fff',gradientEnd:'#b14cce',shadowSm:'0 3px 14px rgba(0,5,16,.42)',shadowMd:'0 16px 42px rgba(0,4,14,.56)',shadowLg:'0 34px 100px rgba(0,3,12,.72)'}},
  graphite:{name:'graphite',label:'Graphite',description:'Rich neutral with copper energy',character:'neutral',tokens:{background:'#101112',backgroundSecondary:'#191b1d',surface:'#222426',surfaceElevated:'#2c2f32',surfaceHover:'#383c40',textPrimary:'#fffaf2',textSecondary:'#ddd4c7',textMuted:'#a69d91',border:'#474b4f',borderStrong:'#676d72',primary:'#ffb454',secondary:'#ff6b8a',accent:'#43d6b0',gradientStart:'#ed8f2d',gradientEnd:'#d44878',shadowSm:'0 3px 13px rgba(0,0,0,.34)',shadowMd:'0 15px 40px rgba(0,0,0,.46)',shadowLg:'0 32px 92px rgba(0,0,0,.64)'}},
  aurora:{name:'aurora',label:'Aurora Slate',description:'Saturated teal-violet atmosphere',character:'spectral',tokens:{background:'#071416',backgroundSecondary:'#0d2124',surface:'#132b2f',surfaceElevated:'#1b383d',surfaceHover:'#24494f',textPrimary:'#efffff',textSecondary:'#bce8e1',textMuted:'#79aaa4',border:'#2f5960',borderStrong:'#477c84',primary:'#1de0c2',secondary:'#a879ff',accent:'#40bfff',gradientStart:'#00c9a7',gradientEnd:'#8b5cf6',shadowSm:'0 3px 14px rgba(0,0,0,.34)',shadowMd:'0 15px 42px rgba(0,0,0,.46)',shadowLg:'0 34px 96px rgba(0,0,0,.62)'}}
};

const LEGACY_THEME_MAP:Record<string,ThemeName>={charcoal:'pdf-skeleton',slate:'aurora',navy:'midnight',classic:'graphite',arctic:'premium-white'};
export function normalizeTheme(value:unknown):ThemeName{
  const key=String(value||'');
  return key in THEMES?key as ThemeName:LEGACY_THEME_MAP[key]||'pdf-skeleton';
}

export const createDefaultLayerGradients=(themeName:ThemeName='pdf-skeleton'):LayerGradients=>{const t=THEMES[themeName].tokens;return{
  background:{enabled:false,angle:135,stops:[{color:t.background,position:0},{color:t.backgroundSecondary,position:100}]},
  surface:{enabled:false,angle:160,stops:[{color:t.surface,position:0},{color:t.surfaceElevated,position:100}]},
  elevated:{enabled:false,angle:135,stops:[{color:t.surfaceElevated,position:0},{color:t.surfaceHover,position:100}]},
  button:{enabled:false,angle:135,stops:[{color:t.surfaceHover,position:0},{color:t.borderStrong,position:100}]},
  primary:{enabled:true,angle:135,stops:[{color:t.gradientStart,position:0},{color:t.gradientEnd,position:100}]},
  secondary:{enabled:false,angle:135,stops:[{color:t.primary,position:0},{color:t.secondary,position:100}]},
  accent:{enabled:false,angle:135,stops:[{color:t.accent,position:0},{color:t.gradientEnd,position:100}]},
  canvas:{enabled:false,angle:135,stops:[{color:'#000000',position:0},{color:t.background,position:100}]}
}};

export function gradientCss(gradient:LayerGradient,fallback:string):string{
  if(!gradient?.enabled||gradient.stops.length<2)return fallback;
  const stops=[...gradient.stops].sort((a,b)=>a.position-b.position).map(stop=>`${stop.color} ${Math.max(0,Math.min(100,stop.position))}%`).join(',');
  return `linear-gradient(${gradient.angle}deg,${stops})`;
}
