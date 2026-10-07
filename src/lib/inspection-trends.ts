import type { InspectionResult } from '@/types';
import { inferenceElapsedMs } from './inference-timing';
import { eligibleForYield } from './inspection-yield';

export type TrendRange = '5m' | '30m' | '1h' | '4h' | '24h' | 'all';

export interface TrendTotals {
  total: number;
  ok: number;
  nok: number;
  warn: number;
  /** No-lens/no-test results are counted above, but excluded from this ratio. */
  yield: number | null;
  avgInferenceMs: number | null;
  p95InferenceMs: number | null;
}

export interface TrendBucket extends TrendTotals {
  /** Start/end of an actual time interval, in epoch milliseconds. */
  time: number;
  end: number;
  perMinute: number;
}

export interface TrendDefectCount {
  name: string;
  lenses: number;
  occurrences: number;
}

export interface TrendTray extends TrendTotals {
  key: string;
  datasetId: string;
  wt: number;
  time: number;
  capacity: number;
  complete: boolean;
}

export interface InspectionTrends extends TrendTotals {
  results: InspectionResult[];
  buckets: TrendBucket[];
  defects: TrendDefectCount[];
  trays: TrendTray[];
  start: number;
  end: number;
  lastResultAt: number | null;
  bucketMs: number;
}

export interface LiveDefectTrendBucket {
  /** Full epoch-aligned interval. Only its visible domain is counted below. */
  time: number;
  end: number;
}

export interface LiveDefectTrendSeries {
  /** Trimmed/case-insensitive identity, independent of legend configuration. */
  key: string;
  name: string;
  /** Actual defect instances, not affected lenses or a status count. */
  total: number;
  /** One count per matching interval in LiveDefectTrends.buckets. */
  counts: number[];
  /** Running total including retained inspections before the visible window. */
  cumulativeCounts: number[];
  overallTotal: number;
}

export interface LiveDefectTrends {
  /** Visible, continuously sliding domain; newest time is always on the right. */
  start: number;
  end: number;
  durationMs: number;
  bucketMs: number;
  buckets: LiveDefectTrendBucket[];
  series: LiveDefectTrendSeries[];
  /** Latest inspection per dataset/sample, selected by the live domain. */
  results: InspectionResult[];
  totalDefects: number;
  inspected: number;
  lastResultAt: number | null;
}

export const LIVE_DEFECT_MIN_DURATION_MS = 60_000;
export const LIVE_DEFECT_MAX_DURATION_MS = 24 * 60 * 60_000;
export const LIVE_DEFECT_DEFAULT_DURATION_MS = 5 * 60_000;

/** Shared validation for saved settings and custom minute/hour inputs. */
export function clampLiveDefectDuration(durationMs: number): number {
  return Number.isFinite(durationMs)
    ? Math.round(Math.min(LIVE_DEFECT_MAX_DURATION_MS, Math.max(LIVE_DEFECT_MIN_DURATION_MS, durationMs)))
    : LIVE_DEFECT_DEFAULT_DURATION_MS;
}

const LIVE_DEFECT_TARGET_INTERVALS = 30;
const LIVE_DEFECT_INTERVALS_MS: readonly number[] = [
  2_000, 3_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 2 * 60_000, 3 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000,
  30 * 60_000, 60 * 60_000,
];

/**
 * Readable whole-second/minute intervals for Classic live defect lines.
 * Roughly thirty intervals make the line legible without smoothing or inventing
 * counts. Selection depends only on the duration, never the data or live clock.
 */
export function liveDefectIntervalMs(durationMs: number): number {
  const minimumInterval = clampLiveDefectDuration(durationMs) / LIVE_DEFECT_TARGET_INTERVALS;
  return LIVE_DEFECT_INTERVALS_MS.find(interval => interval >= minimumInterval)
    ?? LIVE_DEFECT_INTERVALS_MS[LIVE_DEFECT_INTERVALS_MS.length - 1];
}

const MINUTE = 60_000;
const WINDOWS: Record<Exclude<TrendRange, 'all'>, { duration: number; bucket: number }> = {
  '5m': { duration: 5 * MINUTE, bucket: 10_000 },
  '30m': { duration: 30 * MINUTE, bucket: MINUTE },
  '1h': { duration: 60 * MINUTE, bucket: 2 * MINUTE },
  '4h': { duration: 4 * 60 * MINUTE, bucket: 5 * MINUTE },
  '24h': { duration: 24 * 60 * MINUTE, bucket: 30 * MINUTE },
};

/** Nearest-rank percentile of per-lens calls; repeated camera times are not added. */
function p95(times: number[]): number | null {
  if (!times.length) return null;
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function totals(results: ReadonlyArray<InspectionResult>): TrendTotals {
  let ok = 0;
  let nok = 0;
  let warn = 0;
  let eligible = 0;
  let eligibleOk = 0;
  const times: number[] = [];
  for (const result of results) {
    if (result.status === 'OK') ok += 1;
    else if (result.status === 'NOK') nok += 1;
    else if (result.status === 'WARN') warn += 1;
    if (eligibleForYield(result)) {
      eligible += 1;
      if (result.status === 'OK') eligibleOk += 1;
    }
    const elapsed = inferenceElapsedMs(result);
    if (elapsed !== null) times.push(elapsed);
  }
  return {
    total: results.length,
    ok,
    nok,
    warn,
    yield: eligible ? eligibleOk / eligible * 100 : null,
    avgInferenceMs: times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : null,
    p95InferenceMs: p95(times),
  };
}

/**
 * Pure view-model for the live charts. Its source is the existing result stream;
 * it never creates samples, backend requests, or simulated measurement values.
 * Re-inspections replace the same dataset/sample instead of inflating counts.
 */
export function buildInspectionTrends(
  source: ReadonlyArray<InspectionResult>,
  range: TrendRange,
  now: number,
  capacity = 16,
  /** Optional Classic custom rolling window; existing range behavior is unchanged. */
  windowDurationMs?: number,
): InspectionTrends {
  // A deterministic supplied clock makes a live window testable. Invalid clocks
  // produce an empty epoch window rather than calling Date.now behind the caller.
  const clock = Number.isFinite(now) ? now : 0;
  const trayCapacity = Number.isFinite(capacity) && capacity >= 1 ? Math.floor(capacity) : 16;
  const latest = new Map<string, { result: InspectionResult; time: number }>();
  for (const result of source) {
    const time = Date.parse(result.created_at);
    if (!Number.isFinite(time) || time > clock) continue;
    const key = JSON.stringify([result.dataset_id, result.sample_id]);
    const previous = latest.get(key);
    if (!previous || time >= previous.time) latest.set(key, { result, time });
  }
  const chronological = [...latest.values()].sort((a, b) => a.time - b.time
    || a.result.dataset_id.localeCompare(b.result.dataset_id)
    || a.result.sample_id.localeCompare(b.result.sample_id));
  const customDuration = windowDurationMs === undefined ? null : clampLiveDefectDuration(windowDurationMs);
  const window = customDuration === null
    ? range === 'all' ? null : WINDOWS[range]
    : { duration: customDuration, bucket: Math.max(100, Math.ceil(customDuration / (180 * 100)) * 100) };
  const selected = window ? chronological.filter(item => item.time >= clock - window.duration) : chronological;
  const results = selected.map(item => item.result);
  const firstTime = selected[0]?.time;
  const lastTime = selected.at(-1)?.time;
  const bucketMs = window?.bucket ?? Math.max(MINUTE, Math.ceil(((lastTime ?? clock) - (firstTime ?? clock)) / (120 * MINUTE)) * MINUTE);
  const start = window ? clock - window.duration : firstTime === undefined ? clock - 5 * MINUTE : Math.floor(firstTime / bucketMs) * bucketMs;
  // All-history bins represent full intervals, including the last interval.
  // Ending at the last frame itself would turn a frame 1 ms after a minute
  // boundary into an apparent 60,000 lenses/minute rate. A boundary frame
  // belongs to the following complete interval, just like every other frame.
  const end = window ? clock : lastTime === undefined ? clock : Math.floor(lastTime / bucketMs) * bucketMs + bucketMs;
  const bucketCount = Math.max(1, Math.ceil((end - start) / bucketMs));
  const bucketResults: InspectionResult[][] = Array.from({ length: bucketCount }, () => []);
  for (const item of selected) {
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((item.time - start) / bucketMs)));
    bucketResults[index].push(item.result);
  }
  const buckets = bucketResults.map((items, index): TrendBucket => {
    const time = start + index * bucketMs;
    const bucketEnd = Math.min(time + bucketMs, end);
    return {
      ...totals(items),
      time,
      end: bucketEnd,
      perMinute: items.length / ((bucketEnd - time) / MINUTE),
    };
  });

  const defectCounts = new Map<string, TrendDefectCount>();
  const groupedTrays = new Map<string, { datasetId: string; wt: number; time: number; results: InspectionResult[] }>();
  for (const item of selected) {
    const namesInLens = new Set<string>();
    for (const defect of item.result.defects) {
      const name = defect.name.trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase('en-US');
      const count = defectCounts.get(key) ?? { name, lenses: 0, occurrences: 0 };
      count.occurrences += 1;
      if (!namesInLens.has(key)) {
        count.lenses += 1;
        namesInLens.add(key);
      }
      defectCounts.set(key, count);
    }
    const key = JSON.stringify([item.result.dataset_id, item.result.wt_index]);
    const tray = groupedTrays.get(key) ?? {
      datasetId: item.result.dataset_id,
      wt: item.result.wt_index,
      time: item.time,
      results: [],
    };
    tray.results.push(item.result);
    tray.time = Math.max(tray.time, item.time);
    groupedTrays.set(key, tray);
  }
  const trays = [...groupedTrays].map(([key, tray]): TrendTray => ({
    ...totals(tray.results),
    key,
    datasetId: tray.datasetId,
    wt: tray.wt,
    time: tray.time,
    capacity: trayCapacity,
    complete: tray.results.length >= trayCapacity,
  })).sort((a, b) => a.time - b.time || a.key.localeCompare(b.key));
  const defects = [...defectCounts.values()].sort((a, b) => b.lenses - a.lenses
    || b.occurrences - a.occurrences || a.name.localeCompare(b.name));

  return {
    ...totals(results),
    results,
    buckets,
    defects,
    trays,
    start,
    end,
    lastResultAt: lastTime ?? null,
    bucketMs,
  };
}

/**
 * Classic live defect lines use a moving time domain but stationary epoch bins.
 * Advancing the clock must move a point left, not reassign old events to new
 * intervals. Gaps are genuine zero counts, including the in-progress bin.
 * Every HALCON defect name is represented; there is no top-N truncation.
 */
export function buildLiveDefectTrends(
  source: ReadonlyArray<InspectionResult>,
  durationMs: number,
  now: number,
): LiveDefectTrends {
  const clock = Number.isFinite(now) ? now : 0;
  const duration = clampLiveDefectDuration(durationMs);
  const start = clock - duration;
  // Readable intervals are fixed for the chosen duration. Historical points
  // never change bins as the live clock moves, or as new frames arrive.
  const bucketMs = liveDefectIntervalMs(duration);
  const firstBucketTime = Math.floor(start / bucketMs) * bucketMs;
  const lastBucketTime = Math.floor(clock / bucketMs) * bucketMs;
  const bucketCount = Math.round((lastBucketTime - firstBucketTime) / bucketMs) + 1;
  const buckets = Array.from({ length: bucketCount }, (_, index): LiveDefectTrendBucket => {
    const time = firstBucketTime + index * bucketMs;
    return { time, end: time + bucketMs };
  });

  const latest = new Map<string, { result: InspectionResult; time: number }>();
  const byName = new Map<string, LiveDefectTrendSeries>();
  for (const result of source) {
    const time = Date.parse(result.created_at);
    if (!Number.isFinite(time) || time > clock) continue;
    const key = JSON.stringify([result.dataset_id, result.sample_id]);
    const previous = latest.get(key);
    if (!previous || time >= previous.time) latest.set(key, { result, time });
    for (const defect of result.defects) {
      const name = defect.name.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const defectKey = name.toLocaleLowerCase('en-US');
      if (!byName.has(defectKey)) {
        byName.set(defectKey, { key: defectKey, name, total: 0, counts: Array.from({ length: bucketCount }, () => 0), cumulativeCounts: [], overallTotal: 0 });
      }
    }
  }
  const chronological = [...latest.values()].sort((a, b) => a.time - b.time
    || a.result.dataset_id.localeCompare(b.result.dataset_id)
    || a.result.sample_id.localeCompare(b.result.sample_id));
  const results: InspectionResult[] = [];
  let inspected = 0;
  let lastResultAt: number | null = null;
  let totalDefects = 0;
  for (const { result, time } of chronological) {
    const inWindow = time >= start;
    if (inWindow) {
      inspected += 1;
      lastResultAt = time;
      results.push(result);
    }
    for (const defect of result.defects) {
      const name = defect.name.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const key = name.toLocaleLowerCase('en-US');
      let series = byName.get(key);
      if (!series) {
        series = { key, name, total: 0, counts: Array.from({ length: bucketCount }, () => 0), cumulativeCounts: [], overallTotal: 0 };
        byName.set(key, series);
      }
      series.overallTotal += 1;
      // Interval counts remain window-local. The cumulative baseline retains
      // earlier inspections so an idle/scrolling chart never resets to zero.
      if (!inWindow) continue;
      const index = Math.floor((time - firstBucketTime) / bucketMs);
      series.counts[index] += 1;
      series.total += 1;
      totalDefects += 1;
    }
  }

  for (const series of byName.values()) {
    let running = series.overallTotal - series.total;
    series.cumulativeCounts = series.counts.map(count => (running += count));
  }

  return {
    start,
    end: clock,
    durationMs: duration,
    bucketMs,
    buckets,
    series: [...byName.values()].sort((a, b) => a.key.localeCompare(b.key)),
    results,
    totalDefects,
    inspected,
    lastResultAt,
  };
}
