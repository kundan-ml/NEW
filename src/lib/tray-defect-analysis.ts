import type { InspectionTrends, TrendTray } from './inspection-trends';

export interface TrayDefectClass {
  key: string;
  name: string;
  /** All inspected results in the selected time window. */
  occurrences: number;
  /** The latest trays actually displayed on the perspective floor. */
  displayedOccurrences: number;
}

export interface TrayDefectColumn {
  classKey: string;
  occurrences: number;
  affectedLenses: number;
}

export interface TrayDefectRow {
  tray: TrendTray;
  columns: TrayDefectColumn[];
  totalOccurrences: number;
  affectedLenses: number;
}

export interface TrayDefectAnalysis {
  classes: TrayDefectClass[];
  trays: TrayDefectRow[];
  totalOccurrences: number;
  displayedOccurrences: number;
  omittedTrays: number;
}

/**
 * Aggregate top-level HALCON instances, never the repeated camera-channel output.
 * The existing inspection model already deduplicates and applies the time window.
 * Trays are bounded for legibility, but every real class remains available in the
 * legend, including a class whose most recent occurrence is on an earlier tray.
 */
export function buildTrayDefectAnalysis(model: InspectionTrends, maximumTrays = 8): TrayDefectAnalysis {
  const limit = Number.isFinite(maximumTrays) ? Math.max(1, Math.floor(maximumTrays)) : 8;
  const visibleTrays = model.trays.slice(-limit);
  const classes = new Map<string, TrayDefectClass>();
  const rows = new Map<string, {
    counts: Map<string, { occurrences: number; affectedLenses: number }>;
    affectedLenses: number;
    totalOccurrences: number;
  }>();
  let totalOccurrences = 0;
  const displayedKeys = new Set(visibleTrays.map(tray => tray.key));

  for (const result of model.results) {
    const trayKey = JSON.stringify([result.dataset_id, result.wt_index]);
    const displayed = displayedKeys.has(trayKey);
    const row = rows.get(trayKey) ?? { counts: new Map(), affectedLenses: 0, totalOccurrences: 0 };
    const lensClasses = new Set<string>();
    for (const defect of result.defects) {
      const name = defect.name.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const key = name.toLocaleLowerCase('en-US');
      const item = classes.get(key) ?? { key, name, occurrences: 0, displayedOccurrences: 0 };
      item.occurrences += 1;
      if (displayed) item.displayedOccurrences += 1;
      classes.set(key, item);
      totalOccurrences += 1;
      if (displayed) {
        const count = row.counts.get(key) ?? { occurrences: 0, affectedLenses: 0 };
        count.occurrences += 1;
        if (!lensClasses.has(key)) count.affectedLenses += 1;
        row.counts.set(key, count);
        row.totalOccurrences += 1;
      }
      lensClasses.add(key);
    }
    if (displayed) {
      if (lensClasses.size) row.affectedLenses += 1;
      rows.set(trayKey, row);
    }
  }

  const orderedClasses = [...classes.values()].sort((a, b) => b.displayedOccurrences - a.displayedOccurrences
    || b.occurrences - a.occurrences || a.name.localeCompare(b.name));
  const trays = visibleTrays.map(tray => {
    const row = rows.get(tray.key);
    return {
      tray,
      columns: orderedClasses.map(item => ({
        classKey: item.key,
        occurrences: row?.counts.get(item.key)?.occurrences ?? 0,
        affectedLenses: row?.counts.get(item.key)?.affectedLenses ?? 0,
      })),
      totalOccurrences: row?.totalOccurrences ?? 0,
      affectedLenses: row?.affectedLenses ?? 0,
    };
  });

  return {
    classes: orderedClasses,
    trays,
    totalOccurrences,
    displayedOccurrences: trays.reduce((sum, row) => sum + row.totalOccurrences, 0),
    omittedTrays: Math.max(0, model.trays.length - trays.length),
  };
}
