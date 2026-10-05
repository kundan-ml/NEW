'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Crosshair,Focus,Maximize2,Minimize2,Minus,MousePointer2,Plus,RotateCcw,ScanSearch} from 'lucide-react';
import type {Defect} from '@/types';
import {constrainImagePan} from '@/lib/image-pan';
import {fetchPreviewBlob} from '@/lib/preview-cache';

type Probe={x:number;y:number;gray:number|null};
type Props={imageUrl:string;defects:Defect[];selectedDefect?:number;showDefects?:boolean;showCrosshair?:boolean;onProbe?:(p:Probe)=>void};
type View={scale:number;x:number;y:number};
type SavedView={scale:number;centerX:number;centerY:number};

const VIEW_STORAGE_KEY='lens-inspection-canvas-views-v1';

function readSavedView(imageUrl:string):SavedView|null{
 try{const views=JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY)||'{}');const saved=views[imageUrl];return saved&&Number.isFinite(saved.scale)&&Number.isFinite(saved.centerX)&&Number.isFinite(saved.centerY)?saved:null}catch{return null}
}

export function InspectionCanvas({imageUrl,defects,selectedDefect=-1,showDefects=true,showCrosshair=true,onProbe}:Props){
 const host=useRef<HTMLDivElement>(null);const canvas=useRef<HTMLCanvasElement>(null);const source=useRef<HTMLImageElement|null>(null);const pixels=useRef<HTMLCanvasElement|null>(null);const frame=useRef<number|null>(null);const activeImage=useRef('');const loadSequence=useRef(0);const lastSize=useRef({width:0,height:0});
 const activePointers=useRef(new Map<number,{x:number;y:number;startX:number;startY:number}>());
 const pinch=useRef<{distance:number;scale:number;imageX:number;imageY:number}|null>(null);
 const viewRef=useRef<View>({scale:1,x:0,y:0});
 const[view,setRawView]=useState<View>({scale:1,x:0,y:0});const[drag,setDrag]=useState<{sx:number;sy:number;vx:number;vy:number}|null>(null);const[state,setState]=useState<'idle'|'loading'|'ready'|'error'>('idle');const[error,setError]=useState('');const[probe,setProbe]=useState<Probe|null>(null);const[expanded,setExpanded]=useState(false);const[popupAspect,setPopupAspect]=useState(16/9);
 const constrainView=useCallback((next:View):View=>{
   const h=host.current,i=source.current;
   if(!h||!i||!i.naturalWidth||!i.naturalHeight)return next;
   const r=h.getBoundingClientRect();
   return {...next,...constrainImagePan(r,{x:next.x,y:next.y,width:i.naturalWidth*next.scale,height:i.naturalHeight*next.scale})};
 },[]);
 const setView=useCallback((update:React.SetStateAction<View>)=>{
   setRawView(current=>{const next=constrainView(typeof update==='function'?update(current):update);viewRef.current=next;return next});
 },[constrainView]);
 useEffect(()=>{viewRef.current=view},[view]);

 const fit=useCallback(()=>{const h=host.current,i=source.current;if(!h||!i||!i.naturalWidth)return;const r=h.getBoundingClientRect();const padding=Math.max(28,Math.min(r.width,r.height)*.055);const s=Math.max(.01,Math.min((r.width-padding*2)/i.naturalWidth,(r.height-padding*2)/i.naturalHeight));setView({scale:s,x:(r.width-i.naturalWidth*s)/2,y:(r.height-i.naturalHeight*s)/2})},[setView]);
 const restoreOrFit=useCallback((url:string)=>{const h=host.current,i=source.current;if(!h||!i)return;const r=h.getBoundingClientRect(),saved=readSavedView(url);lastSize.current={width:r.width,height:r.height};activeImage.current=url;if(saved){const scale=Math.max(.025,Math.min(12,saved.scale));setView({scale,x:r.width/2-saved.centerX*scale,y:r.height/2-saved.centerY*scale})}else fit()},[fit,setView]);

 useEffect(()=>{
   const requestId=++loadSequence.current;let revoked='';setProbe(null);setError('');
   if(!imageUrl){activeImage.current='';source.current=null;pixels.current=null;setState('idle');return}
   setState('loading');
   if(imageUrl.startsWith('demo:')){
     const parts=imageUrl.split(':'),position=Number(parts[3]||7),channel=parts[4]||'h',status=parts[5]||'OK';
     const p=document.createElement('canvas');p.width=900;p.height=900;const ctx=p.getContext('2d');
     if(ctx){
       ctx.fillStyle='#000000';ctx.fillRect(0,0,900,900);
       ctx.save();ctx.shadowColor='rgba(218,238,242,.48)';ctx.shadowBlur=34;ctx.beginPath();ctx.arc(450,450,340,0,Math.PI*2);ctx.fillStyle=channel==='d'?'#535d61':'#aeb5b3';ctx.fill();ctx.restore();
       const lens=ctx.createRadialGradient(410,390,45,450,450,332);lens.addColorStop(0,channel==='d'?'#6f787a':'#cbd0cd');lens.addColorStop(.52,channel==='d'?'#596365':'#afb6b3');lens.addColorStop(.88,channel==='d'?'#434d50':'#929b99');lens.addColorStop(1,'#d6dcd8');ctx.beginPath();ctx.arc(450,450,323,0,Math.PI*2);ctx.fillStyle=lens;ctx.fill();
       ctx.strokeStyle='rgba(5,11,14,.94)';ctx.lineWidth=8;ctx.beginPath();ctx.arc(450,450,295,0,Math.PI*2);ctx.stroke();
       ctx.strokeStyle='rgba(238,246,244,.13)';ctx.lineWidth=2;for(let radius=82;radius<282;radius+=31){ctx.beginPath();ctx.arc(450,450,radius,0,Math.PI*2);ctx.stroke()}
       let seed=position*173+29;for(let n=0;n<95;n+=1){seed=(seed*9301+49297)%233280;const angle=(seed/233280)*Math.PI*2;seed=(seed*9301+49297)%233280;const radius=45+(seed/233280)*250;const x=450+Math.cos(angle)*radius,y=450+Math.sin(angle)*radius;ctx.fillStyle=`rgba(25,32,34,${.025+(n%5)*.008})`;ctx.beginPath();ctx.arc(x,y,1+(n%3)*.45,0,Math.PI*2);ctx.fill()}
       ctx.strokeStyle='rgba(20,28,30,.58)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(600,420);ctx.lineTo(673,440);ctx.lineTo(704,434);ctx.stroke();ctx.beginPath();ctx.moveTo(618,447);ctx.lineTo(682,460);ctx.stroke();
       if(status!=='OK'){ctx.strokeStyle=status==='NOK'?'#ff2f8f':'#f2b94b';ctx.lineWidth=6;ctx.lineCap='round';[[.78,.24,.89,.33],[.75,.72,.86,.68],[.22,.71,.27,.75]].slice(0,status==='NOK'?3:1).forEach(([x1,y1,x2,y2])=>{ctx.beginPath();ctx.moveTo(x1*900,y1*900);ctx.quadraticCurveTo((x1+x2)*450+12,y1*900-18,x2*900,y2*900);ctx.stroke()})}
       ctx.strokeStyle='rgba(255,255,255,.88)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(430,450);ctx.lineTo(470,450);ctx.moveTo(450,430);ctx.lineTo(450,470);ctx.stroke();
     }
     const i=new Image();i.decoding='async';i.onload=()=>{if(requestId!==loadSequence.current)return;source.current=i;pixels.current=p;setState('ready');requestAnimationFrame(()=>restoreOrFit(imageUrl))};i.src=p.toDataURL('image/png');
     return;
   }
   const controller=new AbortController();
   (async()=>{try{
     const blob=await fetchPreviewBlob(imageUrl,controller.signal);if(controller.signal.aborted||requestId!==loadSequence.current)return;revoked=URL.createObjectURL(blob);const i=new Image();i.decoding='async';
     i.onload=()=>{if(requestId!==loadSequence.current)return;source.current=i;const p=document.createElement('canvas');p.width=i.naturalWidth;p.height=i.naturalHeight;const ctx=p.getContext('2d',{willReadFrequently:true});ctx?.drawImage(i,0,0);pixels.current=p;setState('ready');requestAnimationFrame(()=>restoreOrFit(imageUrl))};
     i.onerror=()=>{if(requestId!==loadSequence.current)return;setError('The browser could not decode this preview image.');setState(source.current?'ready':'error')};i.src=revoked;
   }catch(e){if(!controller.signal.aborted&&requestId===loadSequence.current){setError(e instanceof Error?e.message:'Unable to load image');setState(source.current?'ready':'error')}}})();
   return()=>{controller.abort();if(revoked)URL.revokeObjectURL(revoked)};
 },[imageUrl,restoreOrFit]);

 const paint=useCallback(()=>{
   const c=canvas.current,h=host.current;if(!c||!h)return;const r=h.getBoundingClientRect();if(r.width<2||r.height<2)return;const dpr=Math.min(window.devicePixelRatio||1,2);const w=Math.max(1,Math.round(r.width*dpr)),hh=Math.max(1,Math.round(r.height*dpr));if(c.width!==w||c.height!==hh){c.width=w;c.height=hh;c.style.width=`${r.width}px`;c.style.height=`${r.height}px`}
   const ctx=c.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.fillStyle='#000000';ctx.fillRect(0,0,r.width,r.height);
   const i=source.current;if(!i){
     ctx.textAlign='center';ctx.fillStyle=state==='error'?'#ff8da0':'#87a1b6';ctx.font='600 13px Inter,system-ui';ctx.fillText(state==='loading'?'Loading inspection image…':state==='error'?'Image preview unavailable':'Select a lens to start inspection',r.width/2,r.height/2-4);if(state==='error'){ctx.fillStyle='#60798d';ctx.font='11px Inter,system-ui';ctx.fillText(error.slice(0,90),r.width/2,r.height/2+18)}return;
   }
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(i,view.x,view.y,i.naturalWidth*view.scale,i.naturalHeight*view.scale);
   const showingRequestedFrame=state==='ready'&&activeImage.current===imageUrl;
   if(showDefects&&showingRequestedFrame){const focused=selectedDefect>=0;defects.forEach((d,index)=>{if(!d.bbox_xywh_norm)return;const[x,y,bw,bh]=d.bbox_xywh_norm;const rx=view.x+x*i.naturalWidth*view.scale,ry=view.y+y*i.naturalHeight*view.scale,rw=bw*i.naturalWidth*view.scale,rh=bh*i.naturalHeight*view.scale;const selected=focused&&index===selectedDefect;const defectColor=d.overlay_color|| (d.severity==='critical'?'#ff4968':d.severity==='major'?'#ff6b57':'#ffbd4a');const color=focused&&!selected?'rgba(164,174,182,.72)':defectColor;ctx.save();ctx.strokeStyle=color;ctx.lineWidth=selected?3:(focused?1:1.8);ctx.setLineDash(focused&&!selected?[4,5]:[]);ctx.shadowColor=color;ctx.shadowBlur=selected?12:0;ctx.strokeRect(rx,ry,rw,rh);if(!focused||selected){ctx.shadowBlur=4;const label=`${d.name} · ${Math.round(d.confidence*100)}%`;ctx.font='600 11px Inter,system-ui';ctx.fillStyle=defectColor;ctx.fillText(label,rx+4,Math.max(15,ry-9))}ctx.restore()})}
   if(showCrosshair){const cx=view.x+i.naturalWidth*view.scale/2,cy=view.y+i.naturalHeight*view.scale/2;ctx.save();ctx.strokeStyle='rgba(81,188,255,.78)';ctx.lineWidth=1;ctx.setLineDash([7,7]);ctx.beginPath();ctx.moveTo(cx-90,cy);ctx.lineTo(cx+90,cy);ctx.moveTo(cx,cy-90);ctx.lineTo(cx,cy+90);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(cx,cy,8,0,Math.PI*2);ctx.stroke();ctx.restore()}
 },[defects,error,imageUrl,selectedDefect,showCrosshair,showDefects,state,view]);

 useEffect(()=>{if(frame.current)cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(paint);return()=>{if(frame.current)cancelAnimationFrame(frame.current)}},[paint,expanded]);
 useEffect(()=>{if(state!=='ready'||activeImage.current!==imageUrl)return;const timer=window.setTimeout(()=>{const h=host.current;if(!h)return;const r=h.getBoundingClientRect();const saved={scale:view.scale,centerX:(r.width/2-view.x)/view.scale,centerY:(r.height/2-view.y)/view.scale};try{const views=JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY)||'{}');views[imageUrl]=saved;localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify(views))}catch{}},120);return()=>window.clearTimeout(timer)},[imageUrl,state,view]);
 useEffect(()=>{const h=host.current;if(!h)return;let resizeFrame=0;const align=()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=h.getBoundingClientRect(),previous=lastSize.current;if(state==='ready'&&source.current&&previous.width>0&&previous.height>0&&(Math.abs(r.width-previous.width)>1||Math.abs(r.height-previous.height)>1)){setView(v=>{const centerX=(previous.width/2-v.x)/v.scale,centerY=(previous.height/2-v.y)/v.scale;return{...v,x:r.width/2-centerX*v.scale,y:r.height/2-centerY*v.scale}})}lastSize.current={width:r.width,height:r.height}}))};const r=h.getBoundingClientRect(),previous=lastSize.current;if(previous.width>0&&previous.height>0&&state==='ready'){setView(v=>{const centerX=(previous.width/2-v.x)/v.scale,centerY=(previous.height/2-v.y)/v.scale;return{...v,x:r.width/2-centerX*v.scale,y:r.height/2-centerY*v.scale}})}lastSize.current={width:r.width,height:r.height};const ro=new ResizeObserver(align);ro.observe(h);window.addEventListener('resize',align);document.addEventListener('visibilitychange',align);return()=>{cancelAnimationFrame(resizeFrame);ro.disconnect();window.removeEventListener('resize',align);document.removeEventListener('visibilitychange',align)}},[state,expanded]);
 useEffect(()=>{if(!expanded)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false)};window.addEventListener('keydown',close);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',close)}},[expanded]);

 function zoomAt(factor:number,cx?:number,cy?:number){const h=host.current,i=source.current;if(!h||!i)return;const rect=h.getBoundingClientRect(),px=cx??rect.width/2,py=cy??rect.height/2;setView(v=>{const ns=Math.max(.025,Math.min(12,v.scale*factor));const ix=(px-v.x)/v.scale,iy=(py-v.y)/v.scale;return{scale:ns,x:px-ix*ns,y:py-iy*ns}})}
 function wheel(e:React.WheelEvent){e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();zoomAt(e.deltaY<0?1.13:.885,e.clientX-rect.left,e.clientY-rect.top)}
 function pointerDown(e:React.PointerEvent){
   if(e.pointerType==='mouse'&&e.button!==0)return;
   e.currentTarget.setPointerCapture(e.pointerId);
   activePointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});
   if(activePointers.current.size===1){pinch.current=null;setDrag({sx:e.clientX,sy:e.clientY,vx:viewRef.current.x,vy:viewRef.current.y});return}
   const [a,b]=Array.from(activePointers.current.values());
   const rect=e.currentTarget.getBoundingClientRect(),midX=(a.x+b.x)/2-rect.left,midY=(a.y+b.y)/2-rect.top,v=viewRef.current;
   pinch.current={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),scale:v.scale,imageX:(midX-v.x)/v.scale,imageY:(midY-v.y)/v.scale};
   setDrag(null);
 }
 function updateProbe(e:React.PointerEvent){const h=host.current,i=source.current,p=pixels.current;if(!h||!i||!p||state!=='ready')return;const r=h.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top,ix=Math.floor((px-view.x)/view.scale),iy=Math.floor((py-view.y)/view.scale);if(ix<0||iy<0||ix>=i.naturalWidth||iy>=i.naturalHeight){setProbe(null);return}let gray:number|null=null;try{const d=p.getContext('2d',{willReadFrequently:true})?.getImageData(ix,iy,1,1).data;if(d)gray=Math.round(.299*d[0]+.587*d[1]+.114*d[2])}catch{}const next={x:ix,y:iy,gray};setProbe(next);onProbe?.(next)}
 function pointerMove(e:React.PointerEvent){
   const pointer=activePointers.current.get(e.pointerId);
   if(pointer){pointer.x=e.clientX;pointer.y=e.clientY}
   if(activePointers.current.size>=2&&pinch.current){
     const [a,b]=Array.from(activePointers.current.values());
     const rect=e.currentTarget.getBoundingClientRect(),gesture=pinch.current;
     const scale=Math.max(.025,Math.min(12,gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance));
     const midX=(a.x+b.x)/2-rect.left,midY=(a.y+b.y)/2-rect.top;
     const next=constrainView({scale,x:midX-gesture.imageX*scale,y:midY-gesture.imageY*scale});
     viewRef.current=next;
     setView(next);
   }else if(pointer&&drag){
     const next=constrainView({...viewRef.current,x:drag.vx+e.clientX-drag.sx,y:drag.vy+e.clientY-drag.sy});
     viewRef.current=next;
     setView(next);
   }
   if(e.pointerType==='mouse'&&activePointers.current.size<2)updateProbe(e);
 }
 function pointerEnd(e:React.PointerEvent){
   const pointer=activePointers.current.get(e.pointerId);
   if(pointer&&e.pointerType==='touch'&&activePointers.current.size===1&&Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)<8)updateProbe(e);
   activePointers.current.delete(e.pointerId);
   if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
   pinch.current=null;
   const remaining=activePointers.current.values().next().value;
   const v=viewRef.current;
   setDrag(remaining?{sx:remaining.x,sy:remaining.y,vx:v.x,vy:v.y}:null);
 }
 function oneToOne(){const h=host.current,i=source.current;if(!h||!i)return;const r=h.getBoundingClientRect();setView({scale:1,x:(r.width-i.naturalWidth)/2,y:(r.height-i.naturalHeight)/2})}
 function focusDefect(){const i=source.current,h=host.current,d=defects[selectedDefect];if(!i||!h||!d?.bbox_xywh_norm)return;const[x,y,w,hh]=d.bbox_xywh_norm,r=h.getBoundingClientRect();const targetW=Math.max(w*i.naturalWidth,60),targetH=Math.max(hh*i.naturalHeight,60),s=Math.min(r.width*.58/targetW,r.height*.58/targetH,8);const cx=(x+w/2)*i.naturalWidth,cy=(y+hh/2)*i.naturalHeight;setView({scale:s,x:r.width/2-cx*s,y:r.height/2-cy*s})}
 function toggleExpanded(){if(!expanded){const r=host.current?.getBoundingClientRect();if(r&&r.width>0&&r.height>0)setPopupAspect(Math.max(.55,Math.min(2.4,r.width/r.height)))}setExpanded(value=>!value)}
 const canvasView=<div className={`canvasHost canvas-${state} ${expanded?'canvasPopupHost':''}`} ref={host} onWheel={wheel} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onPointerLeave={e=>{if(e.pointerType==='mouse'&&!activePointers.current.has(e.pointerId))setProbe(null)}} onDoubleClick={fit}>
   <canvas ref={canvas}/><div className="scanBeam" aria-hidden/>
   <div className="canvasTools" onPointerDown={e=>e.stopPropagation()}><button onClick={()=>zoomAt(1.22)} title="Zoom in" aria-label="Zoom in"><Plus/></button><button onClick={()=>zoomAt(.82)} title="Zoom out" aria-label="Zoom out"><Minus/></button><button onClick={fit} title="Fit image" aria-label="Fit image"><RotateCcw/></button><button onClick={oneToOne} title="1:1 pixels" aria-label="Show image at 1:1 pixels"><ScanSearch/></button><button onClick={focusDefect} disabled={!defects[selectedDefect]?.bbox_xywh_norm} title="Focus selected defect" aria-label="Focus selected defect"><Focus/></button><button onClick={toggleExpanded} title={expanded?'Close expanded viewer':'Open expanded viewer'} aria-label={expanded?'Close expanded viewer':'Open expanded viewer'}>{expanded?<Minimize2/>:<Maximize2/>}</button></div>
   {probe&&<div className="pixelProbe"><MousePointer2/><b>X {probe.x}</b><b>Y {probe.y}</b><b>Gray {probe.gray??'—'}</b></div>}
   <div className="canvasHint"><Crosshair/><span className="canvasMouseHint">drag to pan · wheel to zoom · double click fit</span><span className="canvasTouchHint">drag to pan · pinch to zoom · use Fit to reset</span></div>
   {state==='ready'&&<div className="canvasScale"><span style={{'--scale-bar-width':`${Math.max(20,Math.min(280,Math.round(220*view.scale)))}px`} as React.CSSProperties}/><b>1 cm · {Math.round(view.scale*100)}%</b></div>}
 </div>;
 if(expanded&&typeof document!=='undefined')return createPortal(<div className="canvasPopupBackdrop" role="dialog" aria-modal="true" aria-label="Expanded inspection image" onPointerDown={e=>{if(e.target===e.currentTarget)setExpanded(false)}}><div className="canvasPopupWindow" style={{'--canvas-popup-ratio':String(popupAspect)} as React.CSSProperties}><div className="canvasPopupHeader"><span><i/><span><b>Inspection Image</b><em>Precision viewer</em></span></span><small><span className="canvasMouseHint">Scroll to zoom · drag to inspect · double-click to fit · Esc to close</span><span className="canvasTouchHint">Pinch to zoom · drag to inspect · tap Fit to reset</span></small><button onClick={()=>setExpanded(false)}><Minimize2/>Close</button></div><div className="canvasPopupStage"><i className="canvasCorner topLeft"/><i className="canvasCorner topRight"/><i className="canvasCorner bottomLeft"/><i className="canvasCorner bottomRight"/>{canvasView}</div></div></div>,document.body);
 return canvasView
}
