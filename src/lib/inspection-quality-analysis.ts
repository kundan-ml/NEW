import type { InspectionTrends } from './inspection-trends';
import { eligibleForYield } from './inspection-yield';

/** Actual class observations within the caller's selected inspection window. */
export interface QualityClassAnalysis {
  /** Case-insensitive identity with surrounding/repeated whitespace removed. */
  key: string;
  /** First observed, readable spelling of the class name. */
  name: string;
  /** Every reported instance counts, including repeated instances on one lens. */
  occurrences: number;
  /** Each inspected lens counts at most once for this class. */
  lenses: number;
  /** Affected lenses / all inspected lenses, not the yield denominator. */
  affectedPercent: number;
  /** Instances in this class / instances across all classes. */
  occurrenceSharePercent: number;
  /** Final lens status, counted once per affected lens in this class. */
  ok: number;
  nok: number;
  warn: number;
  /** Running occurrence share in the ranked class list, for a Pareto curve. */
  cumulativeSharePercent: number;
}

/** Quality statistics from the existing deduplicated/window-filtered model. */
export interface QualityAnalysis {
  /** Ranked by occurrence count descending, then readable class name. */
  classes: QualityClassAnalysis[];
  totalOccurrences: number;
  /** Unique inspected lenses containing at least one named defect. */
  affectedLenses: number;
  /** Lenses without a named defect; independent of their final status. */
  defectFreeLenses: number;
  activeClasses: number;
  /** Existing yield exclusions (no lens/no test) are preserved. */
  eligibleLenses: number;
  excludedLenses: number;
  /** Eligible-only final outcomes; these partition the yield denominator. */
  eligibleOkLenses: number;
  eligibleNokLenses: number;
  eligibleWarnLenses: number;
  /** Defensive handling of an unknown runtime status, without assuming OK. */
  eligibleOtherLenses: number;
  /** The caller's existing yield; never reinterprets a defect as NOK. */
  yieldPercent: number | null;
  /** Affected lenses / inspected lenses; null when there are no inspections. */
  defectRatePercent: number | null;
  /** Last occupied bucket's actual yield, including null when all are excluded. */
  lastBucketYieldPercent: number | null;
  /** Previous occupied bucket's actual yield, not an empty/zero-filled interval. */
  previousBucketYieldPercent: number | null;
  /** Percentage-point difference; null unless both occupied yields exist. */
  yieldDeltaPoints: number | null;
}

/**
 * Pure analysis of HALCON's top-level result.defects, without camera duplication.
 * The InspectionTrends input already selects the window and latest reinspection
 * per dataset/sample. No input, business classification, or backend data changes.
 * Percentages remain unrounded so each consumer can choose display precision.
 */
export function buildQualityAnalysis(model: InspectionTrends): QualityAnalysis {
  const byClass = new Map<string, QualityClassAnalysis>();
  let totalOccurrences = 0;
  let affectedLenses = 0;
  let eligibleLenses = 0;
  let eligibleOkLenses = 0;
  let eligibleNokLenses = 0;
  let eligibleWarnLenses = 0;
  let eligibleOtherLenses = 0;

  for (const result of model.results) {
    if (eligibleForYield(result)) {
      eligibleLenses += 1;
      if (result.status === 'OK') eligibleOkLenses += 1;
      else if (result.status === 'NOK') eligibleNokLenses += 1;
      else if (result.status === 'WARN') eligibleWarnLenses += 1;
      else eligibleOtherLenses += 1;
    }
    const classesInLens = new Set<string>();
    for (const defect of result.defects) {
      const name = defect.name.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const key = name.toLocaleLowerCase('en-US');
      const entry = byClass.get(key) ?? {
        key, name, occurrences: 0, lenses: 0,
        affectedPercent: 0, occurrenceSharePercent: 0,
        ok: 0, nok: 0, warn: 0, cumulativeSharePercent: 0,
      };
      entry.occurrences += 1;
      totalOccurrences += 1;
      if (!classesInLens.has(key)) {
        entry.lenses += 1;
        if (result.status === 'OK') entry.ok += 1;
        else if (result.status === 'NOK') entry.nok += 1;
        else if (result.status === 'WARN') entry.warn += 1;
        classesInLens.add(key);
      }
      byClass.set(key, entry);
    }
    if (classesInLens.size) affectedLenses += 1;
  }

  let cumulativeOccurrences = 0;
  const classes = [...byClass.values()]
    .sort((a, b) => b.occurrences - a.occurrences || a.name.localeCompare(b.name))
    .map(entry => {
      cumulativeOccurrences += entry.occurrences;
      return {
        ...entry,
        affectedPercent: model.total ? entry.lenses / model.total * 100 : 0,
        occurrenceSharePercent: totalOccurrences ? entry.occurrences / totalOccurrences * 100 : 0,
        cumulativeSharePercent: totalOccurrences ? cumulativeOccurrences / totalOccurrences * 100 : 0,
      };
    });
  // An excluded-only occupied bucket intentionally remains null. Skipping it
  // would incorrectly present older yield as the latest measured quality.
  const occupiedBuckets = model.buckets.filter(bucket => bucket.total > 0);
  const lastBucketYieldPercent = occupiedBuckets.at(-1)?.yield ?? null;
  const previousBucketYieldPercent = occupiedBuckets.at(-2)?.yield ?? null;

  return {
    classes,
    totalOccurrences,
    affectedLenses,
    defectFreeLenses: model.total - affectedLenses,
    activeClasses: classes.length,
    eligibleLenses,
    excludedLenses: model.total - eligibleLenses,
    eligibleOkLenses,
    eligibleNokLenses,
    eligibleWarnLenses,
    eligibleOtherLenses,
    yieldPercent: model.yield,
    defectRatePercent: model.total ? affectedLenses / model.total * 100 : null,
    lastBucketYieldPercent,
    previousBucketYieldPercent,
    yieldDeltaPoints: lastBucketYieldPercent !== null && previousBucketYieldPercent !== null
      ? lastBucketYieldPercent - previousBucketYieldPercent : null,
  };
}
