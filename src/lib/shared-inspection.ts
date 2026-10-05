import type { LiveInspectionMessage, LiveInspectionSnapshot } from '@/types';

export interface InspectionReduction {
  snapshot: LiveInspectionSnapshot | null;
  resync: boolean;
}

/** A backend generation + sequence is authoritative, never a tab's dataset. */
export function reduceInspectionMessage(
  previous: LiveInspectionSnapshot | null,
  message: LiveInspectionMessage,
): InspectionReduction {
  if (message.type === 'heartbeat') {
    return { snapshot: previous, resync: !previous || message.stream_id !== previous.stream_id || message.sequence > previous.sequence };
  }
  if (previous && message.stream_id === previous.stream_id && message.sequence <= previous.sequence) {
    return { snapshot: previous, resync: false };
  }
  if (message.type === 'snapshot') return { snapshot: message, resync: false };
  if (!previous || message.type === 'resync' || message.stream_id !== previous.stream_id || message.sequence !== previous.sequence + 1) {
    return { snapshot: previous, resync: true };
  }
  // A result from an older concurrent job must not steal the live canvas.
  if (message.current_job_id !== message.job.id) return { snapshot: previous, resync: true };
  const newJob = previous.job?.id !== message.job.id;
  if (newJob && message.type !== 'started') return { snapshot: previous, resync: true };
  let results = newJob ? [] : previous.results;
  if (message.result) {
    if (message.result.dataset_id !== message.job.dataset_id) return { snapshot: previous, resync: true };
    results = [...results.filter(result => result.sample_id !== message.result!.sample_id), message.result];
  }
  return { snapshot: { type: 'snapshot', stream_id: message.stream_id, sequence: message.sequence,
    current_job_id: message.current_job_id, job: message.job, results }, resync: false };
}

/** Validate the envelope before untrusted socket JSON enters typed state. */
export function isInspectionMessage(value: unknown): value is LiveInspectionMessage {
  const object = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item);
  const text = (item: unknown) => typeof item === 'string' && item.length > 0;
  const finite = (item: unknown): item is number => typeof item === 'number' && Number.isFinite(item);
  const count = (item: unknown) => Number.isSafeInteger(item) && (item as number) >= 0;
  const status = (item: unknown) => typeof item === 'string' && ['OK', 'NOK', 'WARN'].includes(item);
  const optionalText = (item: unknown) => item === undefined || item === null || typeof item === 'string';
  const numbers = (item: unknown, size: number) => Array.isArray(item) && item.length === size && item.every(finite);
  const validDefect = (item: unknown) => {
    if (!object(item)) return false;
    return text(item.name) && finite(item.confidence)
      && typeof item.severity === 'string' && ['minor', 'major', 'critical'].includes(item.severity)
      && (item.bbox_xywh_norm == null || numbers(item.bbox_xywh_norm, 4))
      && (item.polygon_norm == null || (Array.isArray(item.polygon_norm) && item.polygon_norm.every(point => numbers(point, 2))))
      && optionalText(item.channel) && optionalText(item.position_text) && optionalText(item.overlay_color)
      && (item.size_px == null || finite(item.size_px))
      && (item.tolerance == null || item.tolerance === 'IT' || item.tolerance === 'AT');
  };
  const validChannel = (item: unknown) => {
    if (!object(item)) return false;
    return text(item.channel) && typeof item.image_path === 'string' && status(item.status)
      && Array.isArray(item.defects) && item.defects.every(validDefect)
      && object(item.measurements) && Object.values(item.measurements).every(measurement => typeof measurement === 'string' || finite(measurement))
      && typeof item.engine === 'string' && finite(item.elapsed_ms) && item.elapsed_ms >= 0;
  };
  const validResult = (item: unknown) => {
    if (!object(item)) return false;
    return text(item.dataset_id) && text(item.sample_id) && count(item.position) && count(item.wt_index)
      && typeof item.category === 'string' && status(item.status) && text(item.created_at)
      && optionalText(item.expected_label)
      && Array.isArray(item.channels) && item.channels.every(validChannel)
      && Array.isArray(item.defects) && item.defects.every(validDefect);
  };
  const validJob = (job: unknown) => {
    if (!object(job)) return false;
    return text(job.id) && text(job.dataset_id)
      && typeof job.status === 'string' && ['queued', 'running', 'completed', 'failed', 'cancelled'].includes(job.status)
      && count(job.completed) && count(job.total) && object(job.summary)
      && optionalText(job.current_sample_id) && optionalText(job.error);
  };
  if (!object(value)) return false;
  const row = value;
  if (!text(row.stream_id) || !count(row.sequence) || !optionalText(row.current_job_id)) return false;
  if (row.type === 'heartbeat' || row.type === 'resync') return true;
  if (row.type === 'snapshot') return (row.job === null || validJob(row.job))
    && Array.isArray(row.results) && row.results.every(validResult);
  return typeof row.type === 'string' && ['started', 'progress', 'result', 'completed', 'failed', 'cancelled'].includes(row.type)
    && validJob(row.job) && (row.current_job_id === null || typeof row.current_job_id === 'string')
    && (row.type === 'result' ? validResult(row.result) : row.result === undefined || validResult(row.result));
}
