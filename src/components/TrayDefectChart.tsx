'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {Eye, EyeOff, Minus, Plus, RotateCcw} from 'lucide-react';
import type { InspectionTrends } from '@/lib/inspection-trends';
import { buildTrayDefectAnalysis, type TrayDefectRow } from '@/lib/tray-defect-analysis';
import { defectClassCodes } from '@/lib/defect-class-labels';
import type { StatusSymbolLegend } from '@/types';
import { seriesStyle } from './LiveDefectTrend';
import './tray-defect-chart.css';

type Props = {
  model: InspectionTrends;
  legend?: StatusSymbolLegend | null;
  angle: number;
  trayLabels?: ReadonlyMap<string, number>;
  onAngleChange?: (angle: number) => void;
  onClassClick?: (name: string) => void;
};
type Point = { x: number; y: number };
type Selection = { trayKey: string; classKey: string };
const pointsAttribute = (points: readonly Point[]) => points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');

/** Upright, measured class columns on an orthographic tray × defect floor. */
export function TrayDefectChart({ model, legend, angle, trayLabels, onAngleChange, onClassClick }: Props) {
  const root = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [camera, setCamera] = useState({zoom: 1, x: 0, y: 0, pitch: .49});
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{id: number; x: number; y: number; angle: number; camera: typeof camera; pan: boolean; moved: boolean} | null>(null);
  const lastDrag = useRef(-Infinity);
  const [size, setSize] = useState({ width: 600, height: 220 });
  const [workspace, setWorkspace] = useState({ width: 0, height: 0 });
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [selection, setSelection] = useState<Selection | null>(null);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const analysis = useMemo(() => buildTrayDefectAnalysis(model), [model]);
  const codes = useMemo(() => defectClassCodes(analysis.classes.map(item => item.name)), [analysis.classes]);
  const colors = useMemo(() => new Map(analysis.classes.map(item => [item.key, seriesStyle(item, legend).color])), [analysis.classes, legend]);
  const visibleClasses = analysis.classes.filter(item => !hidden.has(item.key));
  const visibleTotal = visibleClasses.reduce((sum, item) => sum + item.displayedOccurrences, 0);
  const compact = workspace.height < 350;
  const dense = analysis.classes.length > 8 || workspace.width < 750 || compact;

  useLayoutEffect(() => {
    const element = root.current, chart = frame.current;
    if (!element || !chart) return;
    const measure = () => {
      const rootBounds = element.getBoundingClientRect(), bounds = chart.getBoundingClientRect();
      setWorkspace(previous => previous.width === rootBounds.width && previous.height === rootBounds.height
        ? previous : { width: rootBounds.width, height: rootBounds.height });
      setSize(previous => previous.width === bounds.width && previous.height === bounds.height
        ? previous : { width: Math.max(80, bounds.width), height: Math.max(35, bounds.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element); observer.observe(chart);
    return () => observer.disconnect();
  }, []);

  const label = (row: TrayDefectRow) => trayLabels?.get(row.tray.key) ?? row.tray.wt;
  const trayCount = analysis.trays.length;
  const inspectedLenses = analysis.trays.reduce((total,row)=>total+row.tray.total,0);
  const affectedLenses = analysis.trays.reduce((total,row)=>total+row.affectedLenses,0);
  const peakTray = analysis.trays.reduce<TrayDefectRow|null>((peak,row)=>!peak||row.totalOccurrences>peak.totalOccurrences?row:peak,null);
  const classCount = visibleClasses.length;
  const maximum = Math.max(1, ...analysis.trays.flatMap(row => row.columns.filter(item => !hidden.has(item.classKey)).map(item => item.occurrences)));
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const scaleStep = Math.max(1, Math.ceil(maximum / magnitude / 4) * magnitude);
  const scaleMax = Math.max(1, Math.ceil(maximum / scaleStep) * scaleStep);
  const ticks = Array.from({ length: Math.floor(scaleMax / scaleStep) + 1 }, (_, index) => index * scaleStep);
  const rotation = (Number.isFinite(angle) ? angle : 35) * Math.PI / 180;
  const planeWidth = Math.max(1, trayCount) * 1.05;
  const planeDepth = Math.min(5, Math.max(1.6, classCount * .74));
  const depthStep = planeDepth / Math.max(1, classCount);
  const heightUnits = compact ? 2.6 : 3.6;
  const raw = (x: number, y: number, z = 0): Point => ({
    x: x * Math.cos(rotation) - y * Math.sin(rotation),
    y: (x * Math.sin(rotation) + y * Math.cos(rotation)) * camera.pitch - z,
  });
  const corners = [[0, 0], [planeWidth, 0], [0, planeDepth], [planeWidth, planeDepth]];
  const bounds = corners.flatMap(([x, y]) => [raw(x, y), raw(x, y, heightUnits)]);
  const minX = Math.min(...bounds.map(point => point.x)), maxX = Math.max(...bounds.map(point => point.x));
  const minY = Math.min(...bounds.map(point => point.y)), maxY = Math.max(...bounds.map(point => point.y));
  const inset = { left: compact ? 30 : 46, right: compact ? 22 : dense ? 44 : 36, top: compact ? 9 : 17, bottom: compact ? 22 : 38 };
  const scale = Math.max(1, Math.min(Math.max(20, size.width - inset.left - inset.right) / (maxX - minX), Math.max(16, size.height - inset.top - inset.bottom) / (maxY - minY)));
  // Fill the wide analytics canvas without inflating the measured height axis.
  // The horizontal camera projection is bounded by the real frame; a compact
  // inset never pushes columns or their class captions beyond the SVG.
  const horizontalScale = Math.max(1, Math.min(scale * (compact ? 1.5 : 1.8), Math.max(20, size.width - inset.left - inset.right) / (maxX - minX)));
  const offsetX = inset.left + (Math.max(20, size.width - inset.left - inset.right) - (maxX - minX) * horizontalScale) / 2 - minX * horizontalScale;
  const offsetY = inset.top + (Math.max(16, size.height - inset.top - inset.bottom) - (maxY - minY) * scale) / 2 - minY * scale;
  const project = (x: number, y: number, z = 0): Point => { const point = raw(x, y, z); return { x: offsetX + point.x * horizontalScale, y: offsetY + point.y * scale }; };
  const floor = [project(0, 0), project(planeWidth, 0), project(planeWidth, planeDepth), project(0, planeDepth)];
  const floorClassLabels = visibleClasses.map((item, index) => {
    const point = project(Math.sin(rotation) >= 0 ? planeWidth : 0, (index + .5) * depthStep);
    const code = codes.get(item.name) || 'D';
    const x = point.x + 9, y = point.y + 3;
    // Conservative bold glyph bounds, including breathing room for font changes.
    return { item, code, x, y, left: x, right: x + code.length * 9 * .8, top: y - 10, bottom: y + 3 };
  });
  const showFloorClassLabels = !compact && classCount > 0 && classCount <= 12 && floorClassLabels.every((entry, index) =>
    entry.left >= 0 && entry.right <= size.width && entry.top >= 0 && entry.bottom <= size.height
    && floorClassLabels.slice(index + 1).every(other => entry.right + 2 <= other.left
      || other.right + 2 <= entry.left || entry.bottom + 2 <= other.top || other.bottom + 2 <= entry.top));
  const columns = analysis.trays.flatMap((row, trayIndex) => visibleClasses.flatMap((item, classIndex) => {
    const column = row.columns.find(entry => entry.classKey === item.key);
    if (!column?.occurrences) return [];
    const x0 = (trayIndex + .17) * 1.05, x1 = (trayIndex + .83) * 1.05;
    const y0 = (classIndex + .15) * depthStep, y1 = (classIndex + .85) * depthStep;
    const z = column.occurrences / scaleMax * heightUnits;
    return [{ row, item, column, x0, x1, y0, y1, z, order: raw((x0+x1)/2, (y0+y1)/2).y }];
  })).sort((a, b) => a.order - b.order);
  const selectedRow = analysis.trays.find(row => row.tray.key === selection?.trayKey);
  const selectedClass = analysis.classes.find(item => item.key === selection?.classKey);
  const selectedColumn = selectedRow?.columns.find(item => item.classKey === selection?.classKey);
  const legendAvailableHeight = Math.max(30, workspace.height - (compact ? workspace.height <= 150 ? 4 : 44 : 118));
  const legendRows = Math.max(1, Math.floor(legendAvailableHeight / (compact ? 20 : dense ? 26 : 34)));
  const legendColumns = Math.max(dense && analysis.classes.length > 10 ? 2 : 1, Math.ceil(analysis.classes.length / legendRows));
  const layout = {
    '--tray-class-columns': legendColumns,
    '--tray-class-rows': Math.max(1, Math.ceil(analysis.classes.length / legendColumns)),
  } as CSSProperties;

  function select(trayKey: string, classKey: string) {
    setSelection(previous => previous?.trayKey === trayKey && previous.classKey === classKey ? null : { trayKey, classKey });
    const item = analysis.classes.find(entry => entry.key === classKey);
    if (item) onClassClick?.(item.name);
  }
  function zoom(factor: number, point?: Point) {
    setCamera(previous => {
      const nextZoom = Math.max(.4, Math.min(5, previous.zoom * factor));
      const center = {x: size.width/2, y: size.height/2};
      const anchor = point || center;
      const oldOffset = {x: previous.x + center.x*(1-previous.zoom), y: previous.y + center.y*(1-previous.zoom)};
      return {...previous, zoom: nextZoom,
        x: anchor.x - (anchor.x-oldOffset.x)/previous.zoom*nextZoom - center.x*(1-nextZoom),
        y: anchor.y - (anchor.y-oldOffset.y)/previous.zoom*nextZoom - center.y*(1-nextZoom)};
    });
  }
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  useLayoutEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const width = element.viewBox.baseVal.width, height = element.viewBox.baseVal.height;
      zoomRef.current(Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * .002), {
        x: (event.clientX-rect.left)/Math.max(1, rect.width)*width,
        y: (event.clientY-rect.top)/Math.max(1, rect.height)*height,
      });
    };
    element.addEventListener('wheel', wheel, {passive: false});
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.button !== 2) return;
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, angle, camera, pan: event.shiftKey || event.button === 2, moved: false};
    setDragging(true);
  }
  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const initial = drag.current;
    if (!initial || initial.id !== event.pointerId) return;
    const dx = event.clientX-initial.x, dy = event.clientY-initial.y;
    if (!initial.moved && Math.hypot(dx, dy) < 4) return;
    if (!initial.moved) event.currentTarget.setPointerCapture(event.pointerId);
    initial.moved = true;
    if (initial.pan) {
      const rect = event.currentTarget.getBoundingClientRect();
      setCamera(previous => ({...previous, x: initial.camera.x + dx*size.width/Math.max(1, rect.width), y: initial.camera.y + dy*size.height/Math.max(1, rect.height)}));
    } else {
      onAngleChange?.(((initial.angle + dx*.5)%360 + 360)%360);
      setCamera(previous => ({...previous, pitch: Math.max(.2, Math.min(.85, initial.camera.pitch + dy*.003))}));
    }
  }
  function finishDrag(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.id !== event.pointerId) return;
    if (drag.current.moved) lastDrag.current = performance.now();
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function toggleClass(key: string) {
    setHidden(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setSelection(null);
  }

  return <section ref={root} className={`trayDefectChart ${compact ? 'isCompact' : ''} ${dense ? 'hasDenseClasses' : ''}`} aria-label="3D tray defect analysis"
    data-total-defects={analysis.totalOccurrences} data-displayed-defects={analysis.displayedOccurrences} data-visible-defects={visibleTotal} data-class-count={analysis.classes.length} data-angle={angle}>
    <header className="trayDefectIntro trayDefectMetricsOnly">
      <div className="trayOverview" aria-label="Displayed tray summary">
        <span><small>Inspected lenses</small><b>{inspectedLenses.toLocaleString()}</b></span>
        <span><small>With defects</small><b>{affectedLenses.toLocaleString()}<em>{inspectedLenses?` · ${(affectedLenses/inspectedLenses*100).toFixed(1)}%`:''}</em></b></span>
        <span title="Tray with the most defect occurrences among displayed trays"><small>Highest defect tray</small><b>{peakTray&&peakTray.totalOccurrences?`WT ${label(peakTray)}`:'—'}<em>{peakTray&&peakTray.totalOccurrences?` · ${peakTray.totalOccurrences} defects`:''}</em></b></span>
      </div>
      <div className="trayDefectFacts"><span><strong>{analysis.displayedOccurrences.toLocaleString()}</strong><small>Defects</small></span><span><strong>{trayCount}</strong><small>Trays</small></span><span><strong>{analysis.classes.length}</strong><small>Classes</small></span></div>
    </header>
    <div className="trayDefectBody">
      <div ref={frame} className={`trayDefectFrame ${dragging ? 'isDragging' : ''}`}>
        <div className="trayCameraControls"><button type="button" aria-label="Zoom out 3D trays" onClick={()=>zoom(1/1.2)}><Minus size={13}/></button><span>{Math.round(camera.zoom*100)}%</span><button type="button" aria-label="Zoom in 3D trays" onClick={()=>zoom(1.2)}><Plus size={13}/></button><button type="button" aria-label="Reset 3D view" onClick={()=>{setCamera({zoom:1,x:0,y:0,pitch:.49});onAngleChange?.(35);}}><RotateCcw size={13}/></button></div>
        <svg ref={svg} viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="3D tray defect comparison" aria-description="Drag to rotate. Shift-drag or right-drag to pan. Mouse wheel to zoom."
          onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onPointerLeave={event=>{if(!drag.current?.moved)finishDrag(event);}} onContextMenu={event=>event.preventDefault()}>
          <defs>
            <linearGradient id={`tray-floor-${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--surface-elevated)"/><stop offset="1" stopColor="var(--surface)"/></linearGradient>
            {visibleClasses.map((item, index) => <linearGradient key={item.key} id={`tray-front-${id}-${index}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={colors.get(item.key)} stopOpacity=".98"/><stop offset="1" stopColor={colors.get(item.key)} stopOpacity=".74"/></linearGradient>)}
          </defs>
          <g data-tray-camera="true" data-zoom={camera.zoom} data-pan-x={camera.x} data-pan-y={camera.y} transform={`translate(${camera.x+size.width/2*(1-camera.zoom)} ${camera.y+size.height/2*(1-camera.zoom)}) scale(${camera.zoom})`}>
          {trayCount > 0 && <>
            <polygon className="trayPerspectiveFloorShadow" points={pointsAttribute(floor.map(point => ({ x: point.x, y: point.y + (compact ? 3 : 7) })))} />
            <polygon className="trayPerspectiveFloor" points={pointsAttribute(floor)} fill={`url(#tray-floor-${id})`}/>
            <g className="trayFloorGrid">
              {Array.from({ length: trayCount + 1 }, (_, index) => <line key={`tray-${index}`} x1={project(index * 1.05, 0).x} y1={project(index * 1.05, 0).y} x2={project(index * 1.05, planeDepth).x} y2={project(index * 1.05, planeDepth).y}/>)}
              {Array.from({ length: classCount + 1 }, (_, index) => <line key={`class-${index}`} x1={project(0, index * depthStep).x} y1={project(0, index * depthStep).y} x2={project(planeWidth, index * depthStep).x} y2={project(planeWidth, index * depthStep).y}/>)}
            </g>
            <g className="trayDefectCountAxis" aria-label="Defect occurrences scale">
              <line x1={project(0, 0).x} y1={project(0, 0).y} x2={project(0, 0, heightUnits).x} y2={project(0, 0, heightUnits).y}/>
              {ticks.map(value => { const point = project(0, 0, value / scaleMax * heightUnits); return <g key={value}><line x1={point.x - 4} y1={point.y} x2={point.x + 3} y2={point.y}/><text x={point.x - 8} y={point.y + 3} textAnchor="end">{value}</text></g>; })}
              {!compact && <text x={project(0, 0, heightUnits).x} y={project(0, 0, heightUnits).y - 8} textAnchor="middle">Count</text>}
            </g>
            {analysis.trays.map((row, index) => {
              const point = project((index + .5) * 1.05, Math.cos(rotation) >= 0 ? planeDepth : 0);
              const caption = `WT ${label(row)}, ${row.totalOccurrences} defect occurrences, ${row.affectedLenses} affected lenses, ${row.tray.total} inspected, ${row.tray.ok} OK, ${row.tray.nok} NOK, ${row.tray.warn} warning`;
              return <g key={row.tray.key} data-trend-tray={row.tray.key} data-total={row.tray.total} aria-label={caption}><title>{caption}</title><text x={point.x + 4} y={point.y + (compact ? 11 : 16)} textAnchor="middle" className="trayAxisLabel">WT {label(row)}</text></g>;
            })}
            {showFloorClassLabels && floorClassLabels.map(({ item, code, x, y }) =>
              <g key={item.key} className="trayClassFloorLabel"><title>{item.name}</title><text x={x} y={y} fill={colors.get(item.key)}>{code}</text></g>)}
            {!showFloorClassLabels && classCount > 0 && !compact && <text className="trayDenseClassAxis" x={size.width - inset.right} y={size.height - 8} textAnchor="end">Defect classes →</text>}
            {columns.map(({ row, item, column, x0, x1, y0, y1, z }) => {
              const active = selection?.trayKey === row.tray.key && selection.classKey === item.key;
              const color = colors.get(item.key)!;
              const a = project(x0, y0, z), b = project(x1, y0, z), c = project(x1, y1, z), d = project(x0, y1, z);
              const baseA = project(x0, y0), baseB = project(x1, y0), baseC = project(x1, y1), baseD = project(x0, y1);
              const frontFace = Math.cos(rotation) >= 0 ? [d,c,baseC,baseD] : [a,b,baseB,baseA];
              const sideFace = Math.sin(rotation) >= 0 ? [b,c,baseC,baseB] : [a,d,baseD,baseA];
              const classIndex = visibleClasses.findIndex(entry => entry.key === item.key);
              const caption = `WT ${label(row)} · ${item.name}: ${column.occurrences} defect${column.occurrences === 1 ? '' : 's'} on ${column.affectedLenses} lens${column.affectedLenses === 1 ? '' : 'es'}`;
              return <g key={`${row.tray.key}-${item.key}`} className={`trayDefectColumn ${active ? 'isSelected' : ''}`} role="button" tabIndex={0} aria-label={caption} aria-pressed={active}
                data-defect-class={item.key} data-tray-key={row.tray.key} data-count={column.occurrences} data-color={color} style={{ '--tray-class-color': color } as CSSProperties}
                onClick={() => {if(performance.now()-lastDrag.current>=250)select(row.tray.key, item.key);}} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(row.tray.key, item.key); } }}>
                <title>{caption} · Tray result: {row.tray.ok} OK / {row.tray.nok} NOK / {row.tray.warn} warning</title>
                <polygon className="trayColumnFront" points={pointsAttribute(frontFace)} fill={`url(#tray-front-${id}-${classIndex})`}/>
                <polygon className="trayColumnSide" points={pointsAttribute(sideFace)} fill={color}/>
                <polygon className="trayColumnTop" points={pointsAttribute([a, b, c, d])} fill={color}/>
                <polyline className="trayColumnHighlight" points={pointsAttribute([d, c, b])}/>
                {(active || (!compact && columns.length <= 12)) && <text className="trayColumnCount" x={(a.x + c.x) / 2} y={Math.min(a.y, b.y, c.y, d.y) - 5} textAnchor="middle">{column.occurrences}</text>}
              </g>;
            })}
          </>}
          </g>
          {!analysis.totalOccurrences && <g className="trayDefectEmpty"><text x={size.width / 2} y={size.height / 2 - 5} textAnchor="middle">{model.total ? 'No reported defects' : 'Waiting for inspection results'}</text><text x={size.width / 2} y={size.height / 2 + 13} textAnchor="middle">{model.total ? `${model.total} inspected lenses · no defect columns to plot` : 'Measured tray and class counts appear here'}</text></g>}
          {analysis.totalOccurrences > 0 && !visibleClasses.length && <g className="trayDefectEmpty"><text x={size.width / 2} y={size.height / 2} textAnchor="middle">Select a defect class to show its columns</text></g>}
          {analysis.totalOccurrences > 0 && visibleClasses.length > 0 && !visibleTotal && <g className="trayDefectEmpty"><text x={size.width / 2} y={size.height / 2} textAnchor="middle">No defects for these classes in the latest trays</text></g>}
        </svg>
      </div>
      <aside className="trayDefectSidebar" aria-label="Tray defect class controls">
        <div className="trayClassHeading"><strong>Defect classes</strong><button type="button" onClick={() => { setHidden(new Set()); setSelection(null); }} disabled={!hidden.size}>Show all</button></div>
        <div className="trayDefectClasses" style={layout}>{analysis.classes.map(item => <div key={item.key} className="trayDefectClassEntry"><button type="button" className="trayDefectClassButton"
          data-class-key={item.key} data-defect-name={item.name} data-defect-code={codes.get(item.name)} data-count={item.displayedOccurrences}
          aria-label={`${item.name}: ${item.displayedOccurrences} defects. View inspection images.`} aria-pressed={!hidden.has(item.key)}
          title={`${item.name} · ${item.displayedOccurrences} defects in displayed trays · Open inspection images`} onClick={() => onClassClick?.(item.name)} style={{ '--tray-class-color': colors.get(item.key) } as CSSProperties}>
          <i/><span className="trayDefectClassName">{item.name}</span><span className="trayDefectClassCode">{codes.get(item.name)}</span><b>{item.displayedOccurrences}</b>
        </button><button type="button" className="trayClassVisibility" aria-label={`${hidden.has(item.key)?'Show':'Hide'} ${item.name} columns`} aria-pressed={!hidden.has(item.key)} onClick={()=>toggleClass(item.key)}>{hidden.has(item.key)?<EyeOff size={11}/>:<Eye size={11}/>}</button></div>)}</div>
        {!analysis.classes.length && <p className="trayClassEmpty">No defect classes reported</p>}
        <small className="trayClassNote">Click a class to view images · eye controls visibility<br/>Drag rotate · Shift/right drag pan · Wheel zoom</small>
      </aside>
    </div>
    <footer className="trayDefectReadout" role="status" data-selected-class={selectedClass?.key} data-selected-tray={selectedRow?.tray.key}>
      {selectedRow && selectedClass && selectedColumn ? <><strong style={{ color: colors.get(selectedClass.key) }}>WT {label(selectedRow)} · {selectedClass.name}</strong><span>{selectedColumn.occurrences} defects · {selectedColumn.affectedLenses} affected lenses · {selectedRow.tray.total} inspected</span></>
        : <><strong>{analysis.omittedTrays ? `Latest ${trayCount} of ${model.trays.length} trays` : `${trayCount} measured tray${trayCount === 1 ? '' : 's'}`}</strong><span>{visibleTotal} visible defects · tray × defect class · height = count</span></>}
    </footer>
  </section>;
}
