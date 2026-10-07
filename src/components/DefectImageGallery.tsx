'use client';

import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft, ChevronRight, X} from 'lucide-react';
import {api, previewUrl, sampleThumbnailUrl} from '@/lib/api';
import {formatInferenceMs, inferenceElapsedMs} from '@/lib/inference-timing';
import {selectDefectImages, type DefectImageMatch} from '@/lib/defect-image-gallery';
import type {InspectionResult, Sample, StatusSymbolLegend} from '@/types';
import type {GlobalHistoryEntry} from './StatusMatrix';
import {seriesStyle} from './LiveDefectTrend';
import './defect-image-gallery.css';

type Props = {
  name: string;
  results: readonly InspectionResult[];
  history: readonly GlobalHistoryEntry[];
  trayLabels?: ReadonlyMap<string, number>;
  legend?: StatusSymbolLegend | null;
  onClose: () => void;
};
const PAGE_SIZE = 12;
const CHANNELS: Record<string, string> = {h: 'Telecentric', d: 'Dark Field', n: 'Diffuse Brightness', p: 'Phase Contrast'};

export function DefectImageGallery({name, results, history, trayLabels, legend, onClose}: Props) {
  const matches = useMemo(() => selectDefectImages(results, name), [results, name]);
  const existing = useMemo(() => new Map(history.map(entry => [JSON.stringify([entry.datasetId, entry.sample.id]), entry.sample])), [history]);
  const [loaded, setLoaded] = useState<ReadonlyMap<string, Sample>>(new Map());
  const [datasetNames, setDatasetNames] = useState<Record<string, string>>({});
  const [channelNames, setChannelNames] = useState(CHANNELS);
  const [page, setPage] = useState(0);
  const [metadataError, setMetadataError] = useState(false);
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  const dialog = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const color = seriesStyle({key: name.toLowerCase(), name}, legend).color;
  const sampleFor = (match: DefectImageMatch) => existing.get(match.key) || loaded.get(match.key);
  const imageCount = matches.reduce((sum, match) => sum + channelsFor(match, sampleFor(match)).length, 0);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);

  useEffect(() => {
    let alive = true;
    api.datasets().then(rows => {if (alive) setDatasetNames(Object.fromEntries(rows.map(row => [row.id, row.name])));}).catch(() => {if (alive) setMetadataError(true);});
    api.system().then(system => {if (alive) setChannelNames({...CHANNELS, ...system.settings.channel_labels});}).catch(() => {});
    return () => {alive = false;};
  }, []);

  useEffect(() => {
    for (const datasetId of new Set(matches.filter(match => !existing.has(match.key)).map(match => match.result.dataset_id))) {
      if (requested.current.has(datasetId)) continue;
      requested.current.add(datasetId);
      api.samples(datasetId).then(response => {
        if (!mounted.current) return;
        setLoaded(previous => {
          const next = new Map(previous);
          response.items.forEach(sample => next.set(JSON.stringify([datasetId, sample.id]), sample));
          return next;
        });
      }).catch(() => {if (mounted.current) setMetadataError(true);});
    }
  }, [matches, existing]);

  useEffect(() => {
    const previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); event.stopImmediatePropagation(); onCloseRef.current();}
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],summary,[tabindex="0"]') || []).filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    };
    window.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener('keydown', keyboard);
      if (previousOverflow !== 'hidden') document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(<div className="defectGalleryBackdrop" onPointerDown={event => {if (event.target === event.currentTarget) onClose();}}>
    <section className="defectGallery" ref={dialog} role="dialog" aria-modal="true" aria-label={`${name} inspection images`} style={{'--gallery-accent': color} as CSSProperties}>
      <header><div><small>DEFECT IMAGES</small><h2>{name}</h2><span>{matches.length} lenses · {imageCount} images · {matches.reduce((sum, match) => sum + match.defects.length, 0)} occurrences in available history</span></div><button ref={close} type="button" aria-label="Close defect images" onClick={onClose}><X size={19}/></button></header>
      <div className="defectGalleryBody">
        {metadataError && <p className="defectGalleryNotice">Some image names could not be loaded. Available inspection IDs and results are shown.</p>}
        {!matches.length && <p className="defectGalleryEmpty">No matching inspected images in the available history.</p>}
        <div className="defectGalleryGrid">{matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(match => <DefectImageCard key={match.key} match={match} sample={sampleFor(match)} datasetName={datasetNames[match.result.dataset_id] || match.result.dataset_id} wt={trayLabels?.get(JSON.stringify([match.result.dataset_id, match.result.wt_index])) ?? match.result.wt_index} channelNames={channelNames}/>)}</div>
      </div>
      <footer><span>All available illuminations · original inspection output</span><div><button type="button" aria-label="Previous image page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17}/></button><span>{currentPage + 1} / {pages}</span><button type="button" aria-label="Next image page" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17}/></button></div></footer>
    </section>
  </div>, document.body);
}

function channelsFor(match: DefectImageMatch, sample?: Sample): string[] {
  const available = new Set([...Object.keys(sample?.images || {}), ...match.result.channels.map(channel => channel.channel)]);
  return [...available].sort((a, b) => ['h','d','n','p'].indexOf(a) - ['h','d','n','p'].indexOf(b));
}

function DefectImageCard({match, sample, datasetName, wt, channelNames}: {match: DefectImageMatch; sample?: Sample; datasetName: string; wt: number; channelNames: Record<string, string>}) {
  const result = match.result;
  const name = sample?.base_name || result.sample_id;
  const position = name.match(/Position(\d+)/i)?.[1] || String(result.position);
  const curingTray = name.match(/CV[._-](\d+)/i)?.[1];
  return <article className="defectImageCard" data-gallery-sample={result.sample_id} data-gallery-dataset={result.dataset_id}>
    <header><strong>WT {wt} · P{result.position}</strong><b className={`is${result.status}`}>{result.status}</b></header>
    <div className="defectImageIlluminations">{channelsFor(match, sample).map(channel => {
      const output = result.channels.find(item => item.channel === channel);
      const filename = sample?.images[channel]?.filename || output?.image_path.split(/[\\/]/).at(-1) || channel;
      const url = sample?.images[channel]?.relative_path.startsWith('demo:') ? sample.images[channel].relative_path : previewUrl(result.dataset_id, result.sample_id, channel);
      return <figure key={channel}><a href={url} target="_blank" rel="noreferrer" title={`Open original ${filename}`}><img src={sample ? sampleThumbnailUrl(result.dataset_id, sample, channel) : `${url}&thumbnail=1`} alt={`${name} · ${channelNames[channel] || channel}`} loading="lazy"/></a><figcaption><b>{channelNames[channel] || channel}</b><span title={filename}>{filename}</span><em>{output?.status || '—'} · {output?.elapsed_ms === undefined ? '—' : formatInferenceMs(output.elapsed_ms)}</em></figcaption></figure>;
    })}</div>
    <dl className="defectImageFacts"><dt>Dataset</dt><dd>{datasetName}</dd><dt>Lens ID</dt><dd>{name}</dd><dt>CT No.</dt><dd>CV-{wt}</dd><dt>Shuttle Nr.</dt><dd>{position}</dd><dt>Curing Tray</dt><dd>{curingTray ? `CT.${curingTray}` : '—'}</dd><dt>Position</dt><dd>{result.position}</dd><dt>Inspected</dt><dd>{new Date(result.created_at).toLocaleString()}</dd><dt>Inference time</dt><dd>{formatInferenceMs(inferenceElapsedMs(result))}</dd></dl>
    <details><summary>Inspection details · {match.defects.length} matching occurrences</summary>
      <dl className="defectImageFacts"><dt>Dataset ID</dt><dd>{result.dataset_id}</dd><dt>Sample ID</dt><dd>{result.sample_id}</dd><dt>Category</dt><dd>{result.category || '—'}</dd><dt>Expected label</dt><dd>{result.expected_label || '—'}</dd></dl>
      <h4>Detected defects</h4>{result.defects.map((defect, index) => <div className="defectImageOccurrence" key={index}><strong>{defect.name}</strong><span>{channelNames[defect.channel || ''] || defect.channel || 'Channel not specified'} · {defect.severity} · Confidence {Number.isFinite(defect.confidence) ? `${(defect.confidence * 100).toFixed(1)}%` : '—'}</span>{defect.tolerance && <span>Tolerance: {defect.tolerance}</span>}{defect.position_text && <span>Location: {defect.position_text}</span>}{defect.size_px !== undefined && <span>Size: {defect.size_px} px</span>}{defect.bbox_xywh_norm && <span>Bounding box (normalized x, y, width, height): {defect.bbox_xywh_norm.join(', ')}</span>}{defect.polygon_norm && <span>Polygon: {JSON.stringify(defect.polygon_norm)}</span>}{defect.overlay_color && <span>Overlay color: {defect.overlay_color}</span>}</div>)}
      {result.channels.map(channel => <div className="defectImageOccurrence" key={channel.channel}><strong>{channelNames[channel.channel] || channel.channel} · {channel.status}</strong><span>Engine: {channel.engine} · {formatInferenceMs(channel.elapsed_ms)}</span><span>Image path: {channel.image_path}</span><dl className="defectImageFacts">{Object.entries(channel.measurements).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></div>)}
      {sample && <div className="defectImageOccurrence"><strong>Image metadata</strong><dl className="defectImageFacts">{Object.entries(sample.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></div>}
    </details>
  </article>;
}
