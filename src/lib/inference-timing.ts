import type { InspectionResult } from '@/types';

// The backend executes all four cameras once and repeats that elapsed_ms on
// each channel. It is a per-lens duration, not four durations to add together.
export function inferenceElapsedMs(result: Pick<InspectionResult, 'channels'> | undefined): number | null {
  const times = (result?.channels || [])
    .map(channel => channel.elapsed_ms)
    .filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return times.length ? Math.max(...times) : null;
}

export function averageInferenceMs(results: ReadonlyArray<Pick<InspectionResult, 'channels'>>): number | null {
  const times = results.map(inferenceElapsedMs).filter((value): value is number => value !== null);
  return times.length ? times.reduce((total, value) => total + value, 0) / times.length : null;
}

export function formatInferenceMs(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(3)} ms`;
}

export const INFERENCE_TIMING_DESCRIPTION = 'Backend-measured duration of one four-camera HALCON bridge call, including image loading and result decoding. Excludes upload, queue delay, network transfer, and preview rendering. Display precision: 0.001 ms.';

export function inferenceTimingDescription(result: InspectionResult | undefined): string {
  const stages = [['image_read_ms','Read four images'],['program_setup_ms','Program setup'],['algorithm_ms','HALCON algorithm'],['overlay_serialization_ms','Overlay/output']] as const;
  const measurements=result?.channels[0]?.measurements;
  const details=stages.flatMap(([key,label])=>{const value=measurements?.[key];return typeof value==='number'&&Number.isFinite(value)?[`${label}: ${value.toFixed(3)} ms`]:[];});
  return [INFERENCE_TIMING_DESCRIPTION,...details].join('\n');
}
