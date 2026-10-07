// Pure chart aggregation regressions. No API, storage, preferences, or datasets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.resolve(__dirname, `../src/lib/${name}.ts`);
  const compiled = new Module(filename, module);
  compiled.require = request => request.startsWith('./') ? load(request.slice(2)) : require(request);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  cache.set(name, compiled.exports);
  return compiled.exports;
}
const {
  buildInspectionTrends,
  buildLiveDefectTrends,
  clampLiveDefectDuration,
  liveDefectIntervalMs,
  LIVE_DEFECT_MIN_DURATION_MS,
  LIVE_DEFECT_MAX_DURATION_MS,
  LIVE_DEFECT_DEFAULT_DURATION_MS,
} = load('inspection-trends');
const now = Date.UTC(2026, 9, 6, 12);
const {selectDefectImages} = load('defect-image-gallery');
function result(id, secondsAgo, status = 'OK', extra = {}) {
  return {
    dataset_id: 'first', sample_id: id, wt_index: 1, position: 1,
    category: '', status, defects: [],
    channels: ['h', 'd', 'p', 'n'].map(channel => ({ channel, elapsed_ms: 100 })),
    created_at: new Date(now - secondsAgo * 1000).toISOString(), ...extra,
  };
}
const surface = { name: 'Surface Imperfection' };
const lifetimeSource = [result('ancient', 10 * 86400, 'NOK', {defects:[surface]}), result('today', 20, 'NOK', {defects:[surface,surface]})];
assert.equal(buildInspectionTrends(lifetimeSource, 'all', now).total, 2);
assert.equal(buildInspectionTrends(lifetimeSource, '24h', now).total, 1);
const lifetime = buildLiveDefectTrends(lifetimeSource, 10 * 86400000 + 1000, now, true);
assert(lifetime.start < now - 86400000, 'Lifetime retains older-than-24-hour events');
assert(lifetime.buckets.length <= 32, 'Lifetime chart stays bounded');
assert.equal(lifetime.series[0].total, 3);
const galleryMatches = selectDefectImages([...lifetimeSource, result('today', 10, 'NOK', {defects:[surface,surface]})], '  SURFACE   IMPERFECTION ');
assert.equal(galleryMatches.length, 2, 'Gallery deduplicates repeated inspections but retains every lens');
assert.equal(galleryMatches.reduce((sum,match)=>sum+match.defects.length,0), 3, 'Repeated defects do not duplicate image cards');
assert.equal(selectDefectImages(lifetimeSource, 'Bubble').length, 0);
assert.equal(selectDefectImages([lifetimeSource[0], {...lifetimeSource[0], dataset_id:'second'}], surface.name).length, 2, 'Same sample ID in different datasets remains separate');
assert.equal(selectDefectImages([...lifetimeSource, result('ancient', 1, 'OK')], surface.name).length, 1, 'Reinspection replaces stale class membership');
const source = [
  result('a', 90, 'NOK', { defects: [surface] }),
  result('a', 10), // Latest inspection replaces the earlier defect and NOK.
  result('b', 20, 'NOK', { defects: [surface, surface, { name: 'Bubble' }] }),
  result('c', 30, 'NOK', { defects: [{ name: 'No Lens' }], channels: [] }),
  result('d', 40, 'WARN', { channels: [{ elapsed_ms: 200 }] }),
  result('a', 50, 'OK', { dataset_id: 'second', channels: [{ elapsed_ms: 0 }] }),
  result('old', 301, 'NOK'),
  result('future', -1),
  result('invalid', 0, 'OK', { created_at: 'not a date' }),
];
const data = buildInspectionTrends(source, '5m', now, 4);
assert.equal(data.total, 5);
assert.equal(data.ok, 2);
assert.equal(data.nok, 2);
assert.equal(data.warn, 1);
assert.equal(data.yield, 50, 'No Lens remains in counts but not the yield denominator');
assert.equal(data.avgInferenceMs, 100, 'A four-camera call is one timing, and real zero duration is retained');
assert.equal(data.p95InferenceMs, 200);
assert.equal(data.lastResultAt, now - 10_000);
assert.equal(data.buckets.length, 30);
assert.equal(data.buckets.reduce((sum, item) => sum + item.total, 0), data.total);
assert.equal(data.buckets[0].yield, null, 'Empty periods have no made-up yield');
assert.equal(data.buckets[0].avgInferenceMs, null);
assert.equal(data.buckets[0].perMinute, 0);
assert.equal(data.buckets.at(-1).perMinute, 6);
assert.deepEqual(data.defects.find(item => item.name === surface.name), { name: surface.name, lenses: 1, occurrences: 2 });
assert.equal(data.trays.length, 2, 'Same WT number in distinct datasets remains distinct');
assert.equal(data.trays.find(item => item.datasetId === 'first').complete, true);
assert.equal(data.trays.find(item => item.datasetId === 'second').complete, false);
assert(data.results.every((item, index) => !index || Date.parse(item.created_at) >= Date.parse(data.results[index - 1].created_at)));
assert.equal(source.length, 9, 'Does not mutate caller-owned data');
assert.equal(source[0].status, 'NOK');

for (const range of ['5m', '30m', '1h', '4h', '24h', 'all']) {
  const empty = buildInspectionTrends([], range, now);
  assert.equal(empty.total, 0);
  assert.equal(empty.yield, null);
  assert.equal(empty.avgInferenceMs, null);
  assert.equal(empty.lastResultAt, null);
  assert(empty.buckets.length >= 1 && empty.buckets.length <= 121);
  assert(empty.buckets.every(item => item.total === 0 && item.yield === null && Number.isFinite(item.perMinute)));
}
assert.equal(buildInspectionTrends(source, 'all', now).total, 6);
assert.equal(buildInspectionTrends([result('a', 300)], '5m', now).total, 1, 'Includes the selected window boundary');
assert.equal(buildInspectionTrends([result('a', 0)], '5m', now).buckets.at(-1).total, 1, 'Includes the current time boundary');
assert.equal(buildInspectionTrends([result('a', 0), result('a', 1)], 'all', now).results[0].created_at, new Date(now).toISOString());
assert.equal(buildInspectionTrends([result('a', 0)], 'all', now, NaN).trays[0].capacity, 16);
const noLens = buildInspectionTrends([result('no lens', 10, 'NOK', { defects: [{ name: 'No test job' }] })], 'all', now);
assert.equal(noLens.yield, null);
assert.equal(noLens.total, 1);
assert.equal(noLens.trays[0].yield, null);
const missingTiming = buildInspectionTrends([result('missing', 0, 'OK', { channels: [{ elapsed_ms: -1 }, { elapsed_ms: Infinity }] })], 'all', now);
assert.equal(missingTiming.avgInferenceMs, null);
assert.equal(missingTiming.p95InferenceMs, null);
const longHistory = buildInspectionTrends([result('past', 3600 * 24 * 365), result('present', 0)], 'all', now);
assert(longHistory.buckets.length <= 121, 'Long histories keep a bounded chart model');
const boundaryClock = now + 1;
const boundaryData = buildInspectionTrends([
  result('minute one', 120),
  result('minute two', 60),
  result('new minute', 0, 'OK', { created_at: new Date(boundaryClock).toISOString() }),
], 'all', boundaryClock);
assert.equal(boundaryData.total, 3);
assert.equal(boundaryData.buckets.length, 3);
assert.equal(boundaryData.end, now + 60_000, 'Last all-history bin spans its complete minute');
assert(boundaryData.buckets.every(item => item.end - item.time === 60_000 && item.perMinute === 1), 'A boundary + 1 ms frame does not produce an inflated rate or zero-length bin');
assert.equal(boundaryData.buckets.reduce((sum, item) => sum + item.total, 0), 3);
const exactBoundary = buildInspectionTrends([result('at boundary', 0)], 'all', now);
assert.equal(exactBoundary.buckets[0].time, now);
assert.equal(exactBoundary.buckets[0].end, now + 60_000);
assert.equal(exactBoundary.buckets[0].perMinute, 1);

const sourceBefore = JSON.stringify(source);
const live = buildLiveDefectTrends(source, 5 * 60_000, now);
assert.equal(live.start, now - 5 * 60_000);
assert.equal(live.end, now);
assert.equal(live.durationMs, 5 * 60_000);
assert.equal(live.inspected, 5);
assert.equal(live.results.length, 5);
assert.equal(live.lastResultAt, now - 10_000);
assert.equal(live.totalDefects, 4, 'Counts actual repeated defect instances, not affected lenses');
assert.equal(live.series.find(item => item.key === 'surface imperfection').total, 2);
assert.equal(live.series.find(item => item.key === 'bubble').total, 1);
assert.equal(live.bucketMs, 10_000, 'Five minutes uses clear ten-second intervals, not fractional-second spikes');
assert.equal(live.buckets.length, 31, 'Thirty full intervals plus the immediately visible current interval');
assert(live.buckets.every(bucket => bucket.time % live.bucketMs === 0 && bucket.end - bucket.time === live.bucketMs));
assert(live.series.every(series => series.counts.length === live.buckets.length
  && series.counts.reduce((sum, count) => sum + count, 0) === series.total));
assert.equal(live.series.reduce((sum, series) => sum + series.total, 0), live.totalDefects);
assert.equal(JSON.stringify(source), sourceBefore, 'Live aggregation does not change caller-owned results');

const moved = buildLiveDefectTrends(source, 5 * 60_000, now + live.bucketMs);
assert.equal(moved.start, live.start + live.bucketMs);
assert.equal(moved.end, live.end + live.bucketMs);
assert.equal(moved.bucketMs, live.bucketMs);
assert.equal(moved.buckets[0].time, live.buckets[0].time + live.bucketMs);
const existingEventTime = now - 20_000;
const initialIndex = live.buckets.findIndex(bucket => bucket.time <= existingEventTime && bucket.end > existingEventTime);
const movedIndex = moved.buckets.findIndex(bucket => bucket.time <= existingEventTime && bucket.end > existingEventTime);
assert.equal(moved.buckets[movedIndex].time, live.buckets[initialIndex].time, 'Moving clock never relocates historical events into newly anchored bins');
assert.equal(moved.series.find(item => item.key === 'surface imperfection').counts[movedIndex], 2);
assert.equal(moved.series.find(item => item.key === 'surface imperfection').counts.at(-1), 0, 'Raw idle intervals report zero new defects');
assert.equal(moved.series.find(item => item.key === 'surface imperfection').cumulativeCounts.at(-1), 2, 'Plotted running count holds steady through idle intervals');

const normalized = buildLiveDefectTrends([
  result('repeated type', 5, 'NOK', { defects: [
    { name: ' Surface  Imperfection ' }, { name: 'SURFACE IMPERFECTION' }, { name: 'surface imperfection' },
    { name: ' ' }, { name: '' },
  ] }),
], 60_000, now);
assert.equal(normalized.series.length, 1);
assert.equal(normalized.series[0].key, 'surface imperfection');
assert.equal(normalized.series[0].name, 'Surface Imperfection');
assert.equal(normalized.series[0].total, 3);
assert.equal(normalized.totalDefects, 3);

const reinspection = buildLiveDefectTrends([
  result('same lens', 10, 'NOK', { defects: [{ name: 'Retired defect' }] }),
  result('same lens', 2),
  result('same lens', 2, 'NOK', { dataset_id: 'another', defects: [{ name: 'New camera defect' }] }),
], 60_000, now);
assert.equal(reinspection.inspected, 2, 'Latest result per dataset/sample replaces reinspection without cross-dataset collisions');
assert.equal(reinspection.totalDefects, 1);
assert.equal(reinspection.series.find(item => item.key === 'retired defect').total, 0, 'Previously observed defect types stay available but replaced results do not count');
assert.equal(reinspection.series.find(item => item.key === 'new camera defect').total, 1);

const everyType = buildLiveDefectTrends([
  result('many types', 1, 'NOK', { defects: Array.from({ length: 14 }, (_, index) => ({ name: `HALCON unknown ${index + 1}` })) }),
], 60_000, now);
assert.equal(everyType.series.length, 14, 'No fixed known-type list or top-eight truncation');
assert.equal(everyType.totalDefects, 14);

const boundaryNow = now + 123;
const duration = 60_000;
const boundaryLive = buildLiveDefectTrends([
  result('visible left', 0, 'NOK', { created_at: new Date(boundaryNow - duration).toISOString(), defects: [{ name: 'Boundary' }] }),
  result('hidden left', 0, 'NOK', { created_at: new Date(boundaryNow - duration - 1).toISOString(), defects: [{ name: 'Boundary' }] }),
  result('visible right', 0, 'NOK', { created_at: new Date(boundaryNow).toISOString(), defects: [{ name: 'Boundary' }] }),
  result('future right', 0, 'NOK', { created_at: new Date(boundaryNow + 1).toISOString(), defects: [{ name: 'Future only' }] }),
], duration, boundaryNow);
assert.equal(boundaryLive.inspected, 2, 'Both visible endpoints are included; outside the domain is excluded even within partially visible bins');
assert.equal(boundaryLive.totalDefects, 2);
assert.equal(boundaryLive.series.length, 1, 'Future timestamps do not add a premature series');
assert.equal(boundaryLive.series[0].counts[0], 1);
assert.equal(boundaryLive.series[0].counts.at(-1), 1, 'Current in-progress bin receives the newest frame immediately');
assert.equal(boundaryLive.bucketMs, 2_000);
assert(boundaryLive.buckets[0].time < boundaryLive.start, 'Leftmost epoch interval may begin outside the visible domain');
assert(boundaryLive.buckets.at(-1).end > boundaryLive.end, 'Newest interval remains open until its complete epoch boundary');
assert.equal(boundaryLive.series[0].counts.reduce((sum, count) => sum + count, 0), 2, 'Partial edge intervals never prorate or fabricate occurrences');

const intervalStart = now - 20_000;
const exactIntervals = buildLiveDefectTrends([
  result('preceding interval', 0, 'NOK', { created_at: new Date(intervalStart - 1).toISOString(), defects: [surface] }),
  result('interval start', 0, 'NOK', { created_at: new Date(intervalStart).toISOString(), defects: [surface, surface] }),
  result('interval end minus one', 0, 'NOK', { created_at: new Date(intervalStart + 9_999).toISOString(), defects: [surface] }),
  result('following interval', 0, 'NOK', { created_at: new Date(intervalStart + 10_000).toISOString(), defects: [surface] }),
], 5 * 60_000, now);
const exactIndex = exactIntervals.buckets.findIndex(bucket => bucket.time === intervalStart);
assert.equal(exactIntervals.series[0].counts[exactIndex - 1], 1);
assert.equal(exactIntervals.series[0].counts[exactIndex], 3, 'A clear ten-second interval includes its start and excludes its end');
assert.equal(exactIntervals.series[0].counts[exactIndex + 1], 1);
assert.equal(exactIntervals.totalDefects, 5, 'Interval selection retains actual repeated occurrences');
const idleWithinInterval = buildLiveDefectTrends(exactIntervals.results, 5 * 60_000, now + 123);
assert.deepEqual(idleWithinInterval.buckets, exactIntervals.buckets, 'An idle sub-interval tick never reanchors historical intervals');
assert.deepEqual(idleWithinInterval.series[0].counts, exactIntervals.series[0].counts, 'Clock animation never changes measurements');

const slidingEdge = buildLiveDefectTrends([
  result('drops outside window', 0, 'NOK', { created_at: new Date(boundaryNow - duration).toISOString(), defects: [surface] }),
  result('remains inside same partial bin', 0, 'NOK', { created_at: new Date(boundaryNow - duration + 1).toISOString(), defects: [surface] }),
], duration, boundaryNow + 1);
assert.equal(slidingEdge.inspected, 1, 'Sliding one millisecond excludes only the now-expired event, even within one epoch bin');
assert.equal(slidingEdge.totalDefects, 1);
assert.equal(slidingEdge.series[0].counts[0], 1);
assert.equal(slidingEdge.series[0].overallTotal, 2, 'Window expiry does not erase retained overall history');

const expired = buildLiveDefectTrends([result('expired', 0, 'NOK', { defects: [surface] })], 60_000, now + 60_001);
assert.equal(expired.inspected, 0);
assert.equal(expired.totalDefects, 0);
assert.equal(expired.series.length, 1);
assert(expired.series[0].counts.every(count => count === 0));
assert.equal(expired.lastResultAt, null);
assert.equal(expired.series[0].overallTotal, 1, 'Overall totals retain earlier defects when their timestamps leave the visible window');
assert(expired.series[0].cumulativeCounts.every(count => count === 1), 'An idle cumulative line stays level instead of falling to zero');
for (const series of live.series) {
  assert.equal(series.cumulativeCounts.length, live.buckets.length);
  assert.equal(series.cumulativeCounts.at(-1), series.overallTotal);
  assert(series.cumulativeCounts.every((count,index)=>index===0||count>=series.cumulativeCounts[index-1]), 'Running totals never oscillate between detections');
}
assert.equal(normalized.series[0].overallTotal, 3, 'Repeated instances count in the overall total');
assert.equal(reinspection.series.find(item=>item.key==='retired defect').overallTotal, 0, 'Superseded results never inflate the running baseline');
assert.equal(boundaryLive.series[0].overallTotal, 3, 'Left-of-window history contributes to cumulative baseline, not window counts');
assert.equal(boundaryLive.series[0].cumulativeCounts[0], 2, 'First partial interval includes retained opening history plus its visible detection');
assert.equal(boundaryLive.series[0].cumulativeCounts.at(-1), 3, 'Newest cumulative value includes the current, incomplete interval');

const cumulativeHistory = [
  result('old baseline', 3_600, 'NOK', { defects: [surface, surface, { name: 'Bubble' }] }),
  result('recent addition', 10, 'NOK', { defects: [surface, { name: 'Bubble' }, { name: 'Bubble' }] }),
];
const initialRunning = buildLiveDefectTrends(cumulativeHistory, 60_000, now);
const historicSurface = initialRunning.series.find(series => series.key === 'surface imperfection');
assert.equal(initialRunning.totalDefects, 3, 'Period additions do not include the opening historical baseline');
assert.equal(historicSurface.cumulativeCounts[0], 2, 'Visible running line opens at the retained class baseline');
assert.equal(historicSurface.cumulativeCounts.at(-1), 3, 'Actual repeated instances increase the running total');
const afterAllExpire = buildLiveDefectTrends(cumulativeHistory, 60_000, now + 300_000);
assert.equal(afterAllExpire.totalDefects, 0);
assert.equal(afterAllExpire.inspected, 0);
for (const series of afterAllExpire.series) {
  assert.equal(series.overallTotal, 3, 'Every historical class retains its accumulated total after all events leave the window');
  assert(series.counts.every(count => count === 0), 'An expired period has no invented interval additions');
  assert(series.cumulativeCounts.every(count => count === 3), 'Historical cumulative lines remain flat, never reset to zero');
}
const resumedClock = now + 300_001;
const resumedRunning = buildLiveDefectTrends([...cumulativeHistory,
  result('live continuation', 0, 'NOK', {
    created_at: new Date(resumedClock).toISOString(),
    defects: [surface, surface, { name: 'Bubble' }],
  }),
], 60_000, resumedClock);
assert.equal(resumedRunning.series.find(series => series.key === 'surface imperfection').overallTotal, 5, 'New repeated detections add onto, not replace, the historic running total');
assert.equal(resumedRunning.series.find(series => series.key === 'bubble').overallTotal, 4);
assert.equal(resumedRunning.series.find(series => series.key === 'surface imperfection').cumulativeCounts[0], 3);
assert.equal(resumedRunning.series.find(series => series.key === 'surface imperfection').cumulativeCounts.at(-1), 5);
assert.equal(resumedRunning.totalDefects, 3, 'Raw period additions remain separately available for contextual readouts');
for (const duration of [60_000, 300_000, 3_600_000, 86_400_000]) {
  const changedWindow = buildLiveDefectTrends(cumulativeHistory, duration, now);
  assert(changedWindow.series.every(series => series.overallTotal === 3 && series.cumulativeCounts.at(-1) === 3), 'Changing the visible period never resets any class running total');
}
const niceIntervals = [
  [60_000, 2_000],
  [61_000, 3_000],
  [90_000, 3_000],
  [5 * 60_000, 10_000],
  [30 * 60_000, 60_000],
  [37 * 60_000, 2 * 60_000],
  [60 * 60_000, 2 * 60_000],
  [61 * 60_000, 3 * 60_000],
  [4 * 60 * 60_000, 10 * 60_000],
  [24 * 60 * 60_000, 60 * 60_000],
];
for (const [chosenDuration, expectedInterval] of niceIntervals) {
  assert.equal(liveDefectIntervalMs(chosenDuration), expectedInterval, 'Preset and custom durations select predictable whole intervals');
  const empty = buildLiveDefectTrends([], chosenDuration, now);
  assert.equal(empty.bucketMs, expectedInterval);
  assert(empty.buckets.length >= 16 && empty.buckets.length <= 31);
  assert(empty.buckets.every(bucket => bucket.time % expectedInterval === 0 && bucket.end - bucket.time === expectedInterval));
  assert.equal(empty.end - empty.start, chosenDuration);
  assert.equal(empty.series.length, 0);
  assert.equal(empty.totalDefects, 0);
  assert.equal(empty.inspected, 0);
  assert.equal(empty.lastResultAt, null);
}
assert.equal(clampLiveDefectDuration(1), LIVE_DEFECT_MIN_DURATION_MS);
assert.equal(clampLiveDefectDuration(-1), LIVE_DEFECT_MIN_DURATION_MS);
assert.equal(clampLiveDefectDuration(2 * LIVE_DEFECT_MAX_DURATION_MS), LIVE_DEFECT_MAX_DURATION_MS);
assert.equal(clampLiveDefectDuration(NaN), LIVE_DEFECT_DEFAULT_DURATION_MS);
assert.equal(clampLiveDefectDuration(Infinity), LIVE_DEFECT_DEFAULT_DURATION_MS);
assert.equal(liveDefectIntervalMs(1), 2_000, 'Interval selection uses the same minimum live duration');
assert.equal(liveDefectIntervalMs(2 * LIVE_DEFECT_MAX_DURATION_MS), 60 * 60_000, 'Interval selection uses the same maximum live duration');
assert.equal(liveDefectIntervalMs(NaN), 10_000, 'Invalid saved durations use the documented five-minute default');
assert.equal(liveDefectIntervalMs(5 * 60_000 + 1), 15_000, 'Custom duration transitions to the next whole readable interval');
for (let customDuration = 60_000; customDuration <= LIVE_DEFECT_MAX_DURATION_MS; customDuration += 37_123) {
  const custom = buildLiveDefectTrends([], customDuration, now + 123);
  assert(custom.buckets.length >= 16 && custom.buckets.length <= 31, 'Every custom duration has a bounded, readable bin count');
  assert.equal(custom.bucketMs % 1_000, 0, 'Custom intervals never contain confusing fractional seconds');
  assert(custom.buckets.every(bucket => bucket.time % custom.bucketMs === 0));
}
assert.equal(buildLiveDefectTrends([], NaN, NaN).end, 0, 'Invalid clocks are deterministic, never an implicit wall clock');
const customStats = buildInspectionTrends(source, 'all', now, 4, 60_000);
assert.equal(customStats.total, 5, 'Classic custom duration overrides all-history for matching secondary views');
assert.equal(customStats.start, now - 60_000);
assert.equal(customStats.end, now);
assert.equal(customStats.total, buildLiveDefectTrends(source, 60_000, now).inspected);
assert.equal(customStats.buckets.reduce((sum, bucket) => sum + bucket.total, 0), customStats.total);
assert(customStats.buckets.length >= 120 && customStats.buckets.length <= 182);
assert.equal(buildInspectionTrends(source, '5m', now, 4, 30_000).start, now - 60_000, 'Custom secondary views use the same duration bounds');
assert.equal(buildInspectionTrends(source, 'all', now).total, 6, 'Optional custom duration does not change existing Modern/all-history semantics');
console.log('Inspection trends checks passed: existing chart aggregation, cumulative defect lines with retained opening history, no reset in idle or expired windows, new repeated detections add onto historic class totals, readable whole intervals, stationary epoch bins, all reported types, latest sample dedup, exact partial boundaries, custom windows, and separate raw interval additions.');
