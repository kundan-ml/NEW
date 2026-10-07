'use client';

import {useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent} from 'react';
import type {StatusSymbolLegend} from '@/types';
import type {InspectionTrends} from '@/lib/inspection-trends';
import {buildQualityAnalysis} from '@/lib/inspection-quality-analysis';
import {defectClassCodes} from '@/lib/defect-class-labels';
import {seriesStyle} from './LiveDefectTrend';
import './defect-analysis.css';

type Props = {model: InspectionTrends; legend?: StatusSymbolLegend | null; onClassClick?: (name: string) => void};
type CountingMethod = 'occurrences' | 'lenses';
type Size = {width: number; height: number};

function countScale(maximum: number) {
  const rough = Math.max(1, maximum / 4);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, ([1, 2, 5, 10].find(value => value * magnitude >= rough) || 10) * magnitude);
  const max = Math.max(step, Math.ceil(maximum / step) * step);
  return {max, ticks: Array.from({length: Math.round(max / step) + 1}, (_, index) => index * step)};
}

const percent = (value: number) => `${value.toFixed(1)}%`;
const number = (value: number) => value.toLocaleString();

/** Every actual class is retained; window and latest-result filtering belong to the existing model. */
export function DefectAnalysis({model, legend, onClassClick}: Props) {
  const analysis = useMemo(() => buildQualityAnalysis(model), [model]);
  const [method, setMethod] = useState<CountingMethod>('occurrences');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [size, setSize] = useState<Size>({width: 600, height: 250});
  // Start compact so an inline/touch tab never spends a paint with a full-height
  // header squeezing its chart to zero before its actual dimensions are known.
  const [workspaceSize, setWorkspaceSize] = useState<Size>({width: 900, height: 0});
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const chartId = `defect-analysis-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const classes = useMemo(() => [...analysis.classes].sort((first, second) => {
    const difference = method === 'occurrences' ? second.occurrences - first.occurrences : second.lenses - first.lenses;
    return difference || first.name.localeCompare(second.name, 'en', {numeric: true});
  }), [analysis.classes, method]);
  const codes = useMemo(() => defectClassCodes(classes.map(item => item.name)), [classes]);
  const selected = classes.find(item => item.key === selectedKey) || classes[0];
  const compact = workspaceSize.height < 360;
  const dense = classes.length > 10;
  const tightClasses = dense && workspaceSize.height < 630;
  const columns = dense ? 2 : 1;
  const rows = Math.max(1, Math.ceil(classes.length / columns));
  const classLayout = {'--defect-class-columns': columns, '--defect-class-rows': rows} as CSSProperties;
  const {width, height} = size;
  const left = width < 350 ? 37 : 50;
  const right = Math.max(left + 16, width - (width < 350 ? 30 : 42));
  const top = height < 90 ? 12 : 25;
  const bottom = Math.max(top + 8, height - 20);
  const rowHeight = Math.min(52, (bottom - top) / Math.max(1, classes.length));
  const barHeight = Math.max(1, Math.min(14, rowHeight * .38));
  const scale = countScale(classes.reduce((max, item) => Math.max(max, item[method]), 1));
  const chartWidth = right - left;
  const color = (key: string, name: string) => seriesStyle({key, name}, legend).color;
  const statuses = [
    {key: 'ok', label: 'OK', color: legend?.statuses.find(item => item.key.toUpperCase() === 'OK')?.color || 'var(--success,var(--status-ok))'},
    {key: 'nok', label: 'NOK', color: legend?.statuses.find(item => item.key.toUpperCase() === 'NOK')?.color || 'var(--error,var(--status-nok))'},
    {key: 'warn', label: 'Warning', color: legend?.statuses.find(item => item.key.toUpperCase() === 'WARN')?.color || 'var(--warning,var(--status-warn))'},
  ] as const;

  useLayoutEffect(() => {
    if (!root.current || !frame.current) return;
    const measure = () => {
      const rootRect = root.current?.getBoundingClientRect();
      const frameRect = frame.current?.getBoundingClientRect();
      // Consistently measure the border box. A changing compact padding must not
      // flip a content-box threshold and make layouts oscillate around 360 px.
      if (rootRect) setWorkspaceSize(previous => previous.width === rootRect.width && previous.height === rootRect.height
        ? previous : {width: rootRect.width, height: rootRect.height});
      if (frameRect) {
        const next = {width: Math.max(120, frameRect.width), height: Math.max(28, frameRect.height)};
        setSize(previous => previous.width === next.width && previous.height === next.height ? previous : next);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  // A synchronous second measurement follows the measured compact/full layout,
  // keeping the SVG viewBox aligned with the new frame before its first paint.
  useLayoutEffect(() => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    const next = {width: Math.max(120, rect.width), height: Math.max(28, rect.height)};
    setSize(previous => previous.width === next.width && previous.height === next.height ? previous : next);
  }, [compact, tightClasses]);

  const selectFromKeyboard = (event: KeyboardEvent<SVGGElement>, key: string) => {
    if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); chooseClass(key);}
  };
  function chooseClass(key: string) {
    setSelectedKey(key);
    const item = classes.find(entry => entry.key === key);
    if (item) onClassClick?.(item.name);
  }

  return <div ref={root} className={`defectAnalysis${compact ? ' isCompact' : ''}${dense ? ' hasDenseClasses' : ''}${tightClasses ? ' hasTightClasses' : ''}`}
    data-total={model.total} data-occurrences={analysis.totalOccurrences} data-affected={analysis.affectedLenses}
    data-classes={classes.length} data-metric={method}>
    <header className="defectAnalysisHeader">
      <div><small>CLASS INTELLIGENCE</small><h3>Defect analysis</h3><p>Frequency and lens coverage in the selected period</p></div>
      <div className="defectCountingSwitch" role="group" aria-label="Defect counting method">
        <button type="button" aria-pressed={method === 'occurrences'} onClick={() => setMethod('occurrences')}>Occurrences</button>
        <button type="button" aria-pressed={method === 'lenses'} onClick={() => setMethod('lenses')}>Affected lenses</button>
      </div>
    </header>
    <div className="defectAnalysisSummary" aria-label="Defect summary">
      <div><span>Total occurrences</span><strong>{number(analysis.totalOccurrences)}</strong><small>All reported defect instances</small></div>
      <div><span>Affected lenses</span><strong>{number(analysis.affectedLenses)}<em>{analysis.defectRatePercent === null ? '—' : percent(analysis.defectRatePercent)}</em></strong><small>Unique lenses with any defect</small></div>
      <div><span>Active classes</span><strong>{number(analysis.activeClasses)}<em>{number(analysis.defectFreeLenses)} defect-free</em></strong><small>Every detected class included</small></div>
    </div>
    <div className="defectAnalysisBody">
      <section className="defectDistribution" aria-label="Ranked class comparison">
        <div className="defectDistributionHeading"><strong>{method === 'occurrences' ? 'Occurrence frequency' : 'Lens coverage'}</strong><span>{method === 'occurrences' ? 'Count every instance' : 'Count a lens once per class'}</span></div>
        <div className="defectDistributionFrame" ref={frame}>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Defect frequency">
            <defs>{classes.map((item, index) => <linearGradient key={item.key} id={`${chartId}-${index}`} x1="0" y1="0" x2="1" y2="0"><stop stopColor={color(item.key, item.name)} stopOpacity=".48"/><stop offset="1" stopColor={color(item.key, item.name)}/></linearGradient>)}</defs>
            <g className="defectCountGrid">{scale.ticks.map(tick => {
              const xx = left + tick / scale.max * chartWidth;
              return <g key={tick}><line x1={xx} x2={xx} y1={top - 9} y2={bottom}/><text x={xx} y={height - 5} textAnchor="middle">{number(tick)}</text></g>;
            })}</g>
            {classes.map((item, index) => {
              const yy = top + (index + .5) * rowHeight;
              const value = item[method];
              const selectedClass = selected?.key === item.key;
              return <g key={item.key} data-defect-class={item.key} data-count={value} className={`defectChartClass${selectedClass ? ' isSelected' : ''}`}
                tabIndex={0} role="button" aria-pressed={selectedClass} aria-label={`${item.name}: ${value} ${method === 'occurrences' ? 'occurrences' : 'affected lenses'}`}
                onClick={() => chooseClass(item.key)} onKeyDown={event => selectFromKeyboard(event, item.key)}>
                <title>{`${item.name} · ${item.occurrences} occurrences · ${item.lenses} affected lenses · ${percent(item.affectedPercent)} of inspected lenses`}</title>
                <rect x="0" y={yy - rowHeight / 2} width={width} height={rowHeight} rx="5" className="defectClassHitArea"/>
                <text x={left - 9} y={yy + Math.min(4, rowHeight * .2)} textAnchor="end" className="defectChartCode" style={{fill: color(item.key, item.name), fontSize: Math.max(5, Math.min(11, rowHeight * .56))}}>{codes.get(item.name)}</text>
                <rect x={left} y={yy - barHeight / 2} width={chartWidth} height={barHeight} rx={barHeight / 2} className="defectBarTrack"/>
                <rect x={left} y={yy - barHeight / 2} width={value / scale.max * chartWidth} height={barHeight} rx={barHeight / 2} fill={`url(#${chartId}-${index})`} className="defectCountBar"/>
                <circle cx={left + value / scale.max * chartWidth} cy={yy} r={Math.min(3, barHeight / 2)} fill={color(item.key, item.name)}/>
                <text x={width - 6} y={yy + Math.min(4, rowHeight * .2)} textAnchor="end" className="defectChartValue" style={{fontSize: Math.max(5, Math.min(11, rowHeight * .56))}}>{number(value)}</text>
              </g>;
            })}
            {!classes.length && <g className="defectChartEmpty"><text x={width / 2} y={height / 2 - 5} textAnchor="middle">{model.total ? 'No defects reported' : 'Waiting for inspection results'}</text><text x={width / 2} y={height / 2 + 14} textAnchor="middle">{model.total ? 'No defect instances in the selected results' : 'Real class counts appear as inspection completes'}</text></g>}
          </svg>
        </div>
        <div className="defectDistributionNote">{method === 'occurrences' ? 'Several instances of the same class on one lens are counted individually.' : 'Classes can overlap: one lens may be counted in several classes.'}</div>
      </section>
      <aside className="defectAnalysisSidebar" aria-label="Defect classes and selected class details">
        <div className="defectClassListHeading"><strong>Classes</strong><span>{number(classes.length)} detected</span></div>
        <div className="defectClassList" style={classLayout}>
          {classes.map(item => {
            const classColor = color(item.key, item.name);
            const value = item[method];
            const description = `${item.name} · ${item.occurrences} occurrences · ${item.lenses} affected lenses · ${percent(item.affectedPercent)} of inspected lenses · ${item.ok} OK, ${item.nok} NOK, ${item.warn} warning`;
            return <button type="button" key={item.key} className="defectClassButton" style={{'--defect-class-color': classColor} as CSSProperties}
              data-class-key={item.key} data-occurrences={item.occurrences} data-lenses={item.lenses} data-share={item.occurrenceSharePercent} data-affected-percent={item.affectedPercent}
              title={description} aria-label={description} aria-pressed={selected?.key === item.key} onClick={() => chooseClass(item.key)}>
              <i/><span className="defectClassLabel"><span className="defectClassFullName">{item.name}</span><span className="defectClassCode">{codes.get(item.name)}</span></span>
              <span className="defectClassCount"><b>{number(value)}</b><small>{percent(method === 'occurrences' ? item.occurrenceSharePercent : item.affectedPercent)}</small></span>
            </button>;
          })}
        </div>
        {selected && <section className="defectSelectedClass" aria-label="Selected defect class" data-selected-class={selected.key}>
          <div className="defectSelectedHeading"><small>CLASS DETAIL</small><strong title={selected.name}><i style={{background: color(selected.key, selected.name)}}/>{selected.name}</strong></div>
          <div className="defectSelectedMetrics"><div><span>Occurrences</span><b>{number(selected.occurrences)}</b><small>{percent(selected.occurrenceSharePercent)} of defects</small></div><div><span>Affected lenses</span><b>{number(selected.lenses)}</b><small>{percent(selected.affectedPercent)} of inspected</small></div></div>
          <div className="defectClassStatusBar" aria-label={`${selected.name}: ${selected.ok} OK, ${selected.nok} NOK, ${selected.warn} warning lenses`}>
            {statuses.map(status => <span key={status.key} style={{width: `${selected.lenses ? selected[status.key] / selected.lenses * 100 : 0}%`, background: status.color}}/>)}</div>
          <div className="defectClassStatusLabels">{statuses.map(status => <span key={status.key}><i style={{background: status.color}}/>{status.label}<b>{number(selected[status.key])}</b></span>)}</div>
        </section>}
      </aside>
    </div>
  </div>;
}
