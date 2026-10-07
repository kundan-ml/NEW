'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { StatusSymbolLegend } from '@/types';
import type { LiveDefectTrends, LiveDefectTrendSeries } from '@/lib/inspection-trends';
import {smoothTrendPath} from '@/lib/trend-curve';
import {defectClassCodes} from '@/lib/defect-class-labels';
import './live-defect-trend.css';

type Props = { model: LiveDefectTrends; legend?: StatusSymbolLegend | null };
type Size = { width: number; height: number };
type SeriesStyle = { color: string; dash: string };

const normalized = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const timeLabel = (time: number, seconds = true) => new Date(time).toLocaleTimeString([], {
  hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}),
});

function nameHash(name: string): number {
  let hash = 2166136261;
  for (const character of name) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Legend colors remain authoritative; unknown HALCON names get stable colors. */
export function seriesStyle(series: Pick<LiveDefectTrendSeries,'key'|'name'>, legend?: StatusSymbolLegend | null): SeriesStyle {
  const key = normalized(series.name);
  const exact = legend?.defects.find(defect => normalized(defect.key) === key || normalized(defect.label) === key);
  const matched = exact || legend?.defects.find(defect => defect.match_terms?.some(term => {
    const match = normalized(term);
    return match.length > 0 && key.includes(match);
  }));
  const hash = nameHash(series.key);
  const dash = '';
  return {
    color: matched?.color || `color-mix(in srgb, hsl(${hash % 360} 76% 49%) 84%, var(--text-primary))`,
    dash,
  };
}

function countScale(maxCount: number, requestedTicks: number) {
  const rough = Math.max(1, maxCount / requestedTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].find(value => value * magnitude >= rough)! * magnitude);
  const max = Math.max(step, Math.ceil(maxCount / step) * step);
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step) };
}

function intervalLabel(milliseconds: number): string {
  if (milliseconds >= 60_000) return `${Number((milliseconds / 60_000).toFixed(1))} min`;
  return `${Number((milliseconds / 1_000).toFixed(1))} sec`;
}

export function LiveDefectTrend({ model, legend }: Props) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [size, setSize] = useState<Size>({ width: 600, height: 200 });
  const frame = useRef<HTMLDivElement>(null);
  const seriesGroup = useRef<SVGGElement>(null);
  const timeGroup = useRef<SVGGElement>(null);
  const scrollingOffset = useRef(0);
  const plotId = `live-defects-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const duration = Math.max(1, model.end - model.start);
  const { width, height } = size;
  const left = width < 350 ? 32 : 43;
  const right = Math.max(left + 24, width - 43);
  const top = height < 100 ? 19 : 25;
  const bottom = Math.max(top + 5, height - 25);
  const chartWidth = right - left;
  const chartHeight = bottom - top;
  const x = (time: number) => left + (time - model.start) / duration * chartWidth;
  const styles = useMemo(() => new Map(model.series.map(series => [series.key, seriesStyle(series, legend)])), [model.series, legend]);
  const codes = useMemo(() => defectClassCodes(model.series.map(series=>series.name)), [model.series]);
  const visible = model.series.filter(series => !hidden.has(series.key));
  const maxCount = visible.reduce((max, series) => series.counts.reduce((largest,count)=>Math.max(largest,count),max), 1);
  const scale = countScale(maxCount, height < 150 ? 2 : 4);
  const y = (count: number) => bottom - count / scale.max * chartHeight;
  const selectedIndex = hoverTime === null ? -1 : model.buckets.findIndex(bucket => bucket.time === hoverTime);
  const selectedBucket = model.buckets[selectedIndex];
  const intervalTotal = model.series.reduce((sum, series) => sum + (series.counts[selectedIndex] || 0), 0);
  const legendColumns = model.series.length > 10 ? 2 : 1;
  const legendLayout = {'--legend-columns':legendColumns,'--legend-rows':Math.ceil(model.series.length / legendColumns) + 1,'--compact-legend-rows':Math.ceil(model.series.length / 2) + 1} as CSSProperties;

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: Math.max(120, rect.width), height: Math.max(36, rect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (hoverTime !== null && !model.buckets.some(bucket => bucket.time === hoverTime)) setHoverTime(null);
  }, [hoverTime, model.buckets]);

  // Only the display clock re-anchors scrolling. Incoming counts may arrive
  // several times inside one clock tick and must not restart the movement.
  useLayoutEffect(() => {
    const moving = [seriesGroup.current, timeGroup.current];
    scrollingOffset.current = 0;
    moving.forEach(group => group?.setAttribute('transform', 'translate(0 0)'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const anchor = performance.now();
    let request = 0;
    const animate = () => {
      const offset = -(performance.now() - anchor) / duration * chartWidth;
      scrollingOffset.current = offset;
      moving.forEach(group => group?.setAttribute('transform', `translate(${offset.toFixed(3)} 0)`));
      request = window.requestAnimationFrame(animate);
    };
    request = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(request);
  }, [model.end, duration, chartWidth]);

  function toggleSeries(key: string) {
    setHidden(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function inspect(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = (event.clientX - rect.left) / Math.max(1, rect.width) * width;
    const time = model.start + (localX - left - scrollingOffset.current) / chartWidth * duration;
    let nearest = model.buckets[0];
    for (const bucket of model.buckets) {
      if (!nearest || Math.abs(bucket.time - time) < Math.abs(nearest.time - time)) nearest = bucket;
    }
    if (nearest) setHoverTime(nearest.time);
  }

  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    const current = selectedIndex < 0 ? model.buckets.length - 1 : selectedIndex;
    const next = event.key === 'ArrowLeft' ? Math.max(0, current - 1)
      : event.key === 'ArrowRight' ? Math.min(model.buckets.length - 1, current + 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? model.buckets.length - 1 : -1;
    if (event.key === 'Escape') { setHoverTime(null); return; }
    if (next < 0 || !model.buckets[next]) return;
    event.preventDefault();
    setHoverTime(model.buckets[next].time);
  }

  const tickCount = width < 420 ? 2 : width < 750 ? 4 : 6;
  const tickMs = Math.max(1_000, Math.ceil(duration / tickCount / 1_000) * 1_000);
  const firstTick = Math.ceil(model.start / tickMs) * tickMs;
  const timeTicks = Array.from({ length: tickCount + 1 }, (_, index) => firstTick + index * tickMs)
    .filter(time => time <= model.end);

  function path(series: LiveDefectTrendSeries): string {
    const points = smoothTrendPath(model.buckets.map((bucket, index) => ({x:x(bucket.time), y:y(series.counts[index] || 0)})));
    const last = model.buckets.at(-1);
    // The current bin is a partial measurement, not a future forecast. Its
    // constant tail is clipped at LIVE so it reaches the right edge while the
    // epoch-aligned points continue moving left between display-clock ticks.
    return last ? `${points} L${x(last.end).toFixed(2)},${y(series.counts.at(-1) || 0).toFixed(2)}` : points;
  }

  return <div className="classicDefectTrend" data-window-start={model.start} data-window-end={model.end}
    data-count={model.totalDefects} data-inspected={model.inspected}>
    <div className="liveDefectWindowSummary" data-total={model.totalDefects}>
      <div><strong>Defects by class</strong><span>{timeLabel(model.start, duration < 3_600_000)} — {timeLabel(model.end, duration < 3_600_000)}</span></div>
      <small>Class totals for the selected {intervalLabel(duration)} period</small>
    </div>
    <div className="liveDefectBody" onPointerLeave={event=>{if(event.pointerType!=='touch')setHoverTime(null)}}>
    <aside className={`liveDefectSidebar ${legendColumns>1?'isDense':''}`} aria-label="Live defect class totals">
    <div className="trendClassSideHeading"><strong>Defect classes</strong><small>Selected period totals</small></div>
    <div className="liveDefectLegend" aria-label="Defect lines" style={legendLayout}>
      {model.series.length > 0 && <button className="liveDefectLegendAll" onClick={() => setHidden(new Set())}
        title="Show every defect line" disabled={hidden.size === 0}>All types</button>}
      {model.series.map(series => {
        const style = styles.get(series.key)!;
        return <button key={series.key} className={`liveDefectLegendItem ${hidden.has(series.key) ? 'isHidden' : ''}`}
          data-class-total={series.total} data-defect-key={series.key} data-defect-name={series.name} data-defect-code={codes.get(series.name)}
          aria-label={`${series.name}: ${series.total} defects in the selected period`}
          aria-pressed={!hidden.has(series.key)} title={`${series.name}: ${series.total} defects in the visible window. Click to ${hidden.has(series.key) ? 'show' : 'hide'} line.`}
          onClick={() => toggleSeries(series.key)} style={{ '--defect-line': style.color } as CSSProperties}>
          <svg viewBox="0 0 21 6" aria-hidden="true"><path d="M1 3H20" stroke={style.color} strokeDasharray={style.dash}/></svg>
          <span className="trendClassName"><span className="trendClassFullName">{series.name}</span><span className="trendClassInitial">{codes.get(series.name)}</span></span><b>{series.total.toLocaleString()}</b><small>{model.totalDefects ? `${(series.total / model.totalDefects * 100).toFixed(1)}%` : '0%'}</small>
          {selectedBucket&&<em className="liveDefectClassInterval">{series.counts[selectedIndex]||0} in interval</em>}
        </button>;
      })}
    </div>
    </aside>
    <div className="liveDefectChartFrame" ref={frame}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Live defect count over time"
        tabIndex={0} onKeyDown={keyboard} onPointerDown={inspect} onPointerMove={inspect}
        onFocus={() => { if (hoverTime === null) setHoverTime(model.buckets.at(-1)?.time ?? null); }}
        onBlur={() => setHoverTime(null)}>
        <title>HALCON defect counts per time interval, not cumulative totals. Newest time is on the right. Use arrow keys to inspect intervals.</title>
        <defs><clipPath id={plotId}><rect x={left} y={top - 4} width={chartWidth} height={chartHeight + 8}/></clipPath>
          <clipPath id={`${plotId}-time`}><rect x={left} y={top} width={chartWidth} height={height - top}/></clipPath></defs>
        <g className="liveDefectGrid">
          {scale.ticks.map(count => <g key={count}><line x1={left} x2={right} y1={y(count)} y2={y(count)}/>
            <text x={left - 8} y={y(count) + 3} textAnchor="end">{count}</text></g>)}
        </g>
        <g clipPath={`url(#${plotId}-time)`}><g ref={timeGroup} className="liveDefectTimeGrid">
          {timeTicks.map(time => <g key={time}><line x1={x(time)} x2={x(time)} y1={top} y2={bottom}/>
            <text x={x(time)} y={height - 8} textAnchor="middle">{timeLabel(time, duration < 3_600_000)}</text></g>)}
        </g></g>
        <text className="liveDefectAxisTitle" x={left} y={12}>Defect count per {intervalLabel(model.bucketMs)}</text>
        <g clipPath={`url(#${plotId})`}><g ref={seriesGroup}>
          {visible.filter(series => series.total > 0).map(series => {
            const style = styles.get(series.key)!;
            return <g key={series.key}>
              <path d={path(series)} className="liveDefectSeriesHalo" stroke={style.color} aria-hidden="true"/>
              <path data-defect-series={series.key} data-defect-name={series.name} data-overall-count={series.overallTotal} d={path(series)} className="liveDefectSeries"
                stroke={style.color}><title>{series.name} · {series.total} defects in this window</title></path>
              {model.buckets.map((bucket, index) => series.counts[index] > 0 && <circle key={bucket.time}
                data-defect-point={series.key} data-time={bucket.time} data-count={series.counts[index]} data-cumulative-count={series.cumulativeCounts[index]}
                cx={x(bucket.time)} cy={y(series.counts[index])} r={width > 800 ? 3 : 2.5} fill={style.color}
                className="liveDefectPoint"><title>{series.name} · {timeLabel(Math.max(bucket.time, model.start))} · {series.counts[index]} in interval</title></circle>)}
            </g>;
          })}
          {selectedBucket && <g className="liveDefectCrosshair"><line x1={x(selectedBucket.time)} x2={x(selectedBucket.time)} y1={top} y2={bottom}/>
            {visible.map(series => <circle key={series.key} cx={x(selectedBucket.time)} cy={y(series.counts[selectedIndex] || 0)} r="4"
              fill="var(--surface-elevated)" stroke={styles.get(series.key)!.color}/>)}</g>}
        </g></g>
        <g className="liveDefectNow"><line x1={right} x2={right} y1={top} y2={bottom}/>
          <rect x={right - 17} y={0} width="34" height="17" rx="4"/><text x={right} y={12} textAnchor="middle">LIVE</text>
        </g>
        {model.totalDefects === 0 && <g className="liveDefectEmpty"><text x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle">
          {model.inspected ? 'No defects reported in this live window' : 'Waiting for live inspection results'}</text></g>}
        {model.series.length > 0 && visible.length === 0 && <g className="liveDefectEmpty"><text x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle">Select a defect type above to show its line</text></g>}
      </svg>
      {selectedBucket && <div className="liveDefectReadout" role="status" aria-live="polite" aria-atomic="true">
        <b>{timeLabel(Math.max(selectedBucket.time, model.start))} — {timeLabel(Math.min(selectedBucket.end, model.end))}</b>
        <div className="liveDefectIntervalTotal" data-interval-total={intervalTotal}><span>Defects in this interval</span><strong>{intervalTotal}</strong></div>
        <small>{intervalLabel(model.bucketMs)} intervals · all classes counted</small>
        <small>Individual interval counts appear beside each class.</small>
      </div>}
    </div>
    </div>
  </div>;
}
