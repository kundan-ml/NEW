"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Archive,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Columns3,
  Eye,
  EyeOff,
  Flag,
  FolderArchive,
  FolderOpen,
  GripHorizontal,
  GripVertical,
  LayoutDashboard,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Square,
  Target,
  TriangleAlert,
} from "lucide-react";
import { API, api, previewUrl, sampleThumbnailUrl, thumbnailUrl } from "@/lib/api";
import { lensSnapshotArchive } from "@/lib/lens-snapshot";
import { warmPreviews } from "@/lib/preview-cache";
import { inferenceTimingDescription, averageInferenceMs, formatInferenceMs, inferenceElapsedMs, INFERENCE_TIMING_DESCRIPTION } from "@/lib/inference-timing";
import type {
  DatasetSummary,
  Defect,
  InspectionResult,
  Job,
  LogRow,
  Sample,
  Status,
  StatusSymbol,
  StatusSymbolLegend,
  SystemInfo,
  StorageRuntime,
} from "@/types";
import { DatasetLoader } from "./DatasetLoader";
import { ClassicHeader } from "./ClassicHeader";
import { LensViewer } from "./LensViewer";
import { StatusMatrix, type GlobalHistoryEntry } from "./StatusMatrix";
import { TopBar } from "./TopBar";
import { TrendChart } from "./TrendChart";
import { TrendLineWorkspace, type TrendView } from "./TrendLineWorkspace";
import { useUI } from "./UIProvider";
import { useSharedInspection } from "./useSharedInspection";
import {displayFilterFrom,matchesDisplayFilter,type DisplayFilter} from '@/lib/inspection-display';
import {calculateInspectionYield} from '@/lib/inspection-yield';
import './inspection-manual.css';

type WorkspaceTab = "quality" | "activity" | "control";
type InspectionBottomTab = "messages" | "wt" | "trend" | "trend-line";
type WtViewMode = "images" | "names";
type BottomWidthKey = "trendWidth" | "logsWidth" | "actionsWidth";

const passwordChecks = (value: string) => ({
  length: value.length >= 8,
  uppercase: /[A-Z]/.test(value),
  lowercase: /[a-z]/.test(value),
  number: /\d/.test(value),
  special: /[^A-Za-z0-9]/.test(value),
});

const isStrongPassword = (value: string) => Object.values(passwordChecks(value)).every(Boolean);

const defectInitials = (name: string) => {
  const words = name
    .replace(/^(defect|fail)\s*:\s*/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .match(/[A-Za-z0-9]+/g) || [];
  return words.slice(0, 4).map(word => word[0]).join("").toUpperCase();
};

const uniqueDefectNames = (names: Array<string | undefined>) => {
  const seen = new Set<string>();
  return names.flatMap(name => {
    const clean = name?.trim();
    if (!clean || clean === "No defect") return [];
    const key = clean.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [clean];
  });
};

const wtResultLabel = (status: Status, defects: string[]) => {
  if (status === "OK") return "OK";
  if (status === "IDLE") return "Pending";
  const codes = defects.map(defectInitials).filter(Boolean);
  return codes.length ? `${status}: ${codes.join(", ")}` : status;
};

export function InspectionDashboard({
  inspectionMode = false,
}: {
  inspectionMode?: boolean;
}) {
  const { prefs, patch, canCustomize, loggedIn, authReady } = useUI();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [results, setResults] = useState<InspectionResult[]>([]);
  const [globalHistory, setGlobalHistory] = useState<GlobalHistoryEntry[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [channel, setChannel] = useState("h");
  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsError, setLogsError] = useState('');
  const [loader, setLoader] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [hold, setHold] = useState(false);
  const [followLiveTray, setFollowLiveTray] = useState(true);
  const [heldResult,setHeldResult]=useState<{datasetId:string;sampleId:string;result?:InspectionResult}|null>(null);
  const resumeLiveRef=useRef(false);
  const [displayFilter,setDisplayFilter]=useState<DisplayFilter|null>(null);
  const appliedDisplayPolicyRef=useRef('');
  const [modeBusy,setModeBusy]=useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [loadedImageSize, setLoadedImageSize] = useState<{key:string;width:number;height:number} | null>(null);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  // -1 is the all-defects canvas overview. The panel still highlights its
  // first row until an operator explicitly focuses a defect.
  const [selectedDefect, setSelectedDefect] = useState(-1);
  const [probe, setProbe] = useState<{
    x: number;
    y: number;
    gray: number | null;
  } | null>(null);
  const [storage, setStorage] = useState<StorageRuntime | null>(null);
  const [errorMode, setErrorMode] = useState<"all" | "at" | "none">("all");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("quality");
  const [logFilter, setLogFilter] = useState<
    "all" | "warning" | "error" | "system"
  >("all");
  const [focusMode, setFocusMode] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [statusLegend, setStatusLegend] = useState<StatusSymbolLegend | null>(null);
  const [customDefectIcons, setCustomDefectIcons] = useState<Set<string>>(new Set());
  const [inspectionBottomTab, setInspectionBottomTab] =
    useState<InspectionBottomTab>("messages");
  const [modernTrendTab,setModernTrendTab]=useState<'statistics'|'line'>('statistics');
  const [trendInitialView,setTrendInitialView]=useState<TrendView|undefined>();
  const [trendPopupOpen,setTrendPopupOpen]=useState(false);
  const [wtViewMode, setWtViewMode] = useState<WtViewMode>("images");
  const [selectedGlobalWt, setSelectedGlobalWt] = useState<number | null>(null);
  const [liveDatasetId, setLiveDatasetId] = useState<string | null>(null);
  const [operationMode, setOperationMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginView, setLoginView] = useState<"login" | "create">("login");
  const [loginUser, setLoginUser] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [newUserRole, setNewUserRole] = useState<"Operator" | "Tester">("Operator");
  const [statusNow, setStatusNow] = useState<Date | null>(null);
  const { snapshot: sharedInspection, resync: resyncInspection } = useSharedInspection(channel);
  const sharedInspectionRef = useRef(sharedInspection);
  sharedInspectionRef.current = sharedInspection;
  const sharedKey = sharedInspection?.job ? `${sharedInspection.stream_id}:${sharedInspection.job.id}` : "";
  const [hydratedSharedKey, setHydratedSharedKey] = useState("");
  const [hydrationRetry, setHydrationRetry] = useState(0);
  const discoveredSharedKeyRef = useRef("");
  const appliedSharedRef = useRef({ key: "", latestFrame: "", terminal: "" });
  const selectionVersionRef = useRef(0);
  const historyVersionRef = useRef(0);
  const datasetSnapshotsRef = useRef(new Map<string, { samples: Sample[]; results: InspectionResult[] }>());
  const wtCapacity = info?.settings.wt_capacity || 16;

  useEffect(() => {
    if(!authReady)return;
    const query = new URLSearchParams(window.location.search);
    if (query.get("login") === "1") setLoginOpen(true);
    if (loggedIn&&query.get("dataset") === "1") setLoader(true);
    if (loggedIn&&query.get("trendline") === "1") setTrendPopupOpen(true);
    if (query.has("login") || query.has("dataset") || query.has("trendline"))
      window.history.replaceState({}, "", window.location.pathname);
  }, [authReady,loggedIn]);
  useEffect(()=>{if(!loggedIn){setLoader(false);setTrendPopupOpen(false);setInspectionBottomTab(current=>current==='trend-line'?'messages':current);setModernTrendTab('statistics');}},[loggedIn]);
  useEffect(() => {
    // Credentials are never carried into a freshly opened authentication
    // dialog. This also replaces values restored by password managers.
    if (!loginOpen) return;
    setLoginUser("");
    setLoginPassword("");
    setNewUsername("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setLoginError("");
  }, [loginOpen]);
  useEffect(() => {
    setStatusNow(new Date());
    const timer = window.setInterval(() => setStatusNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshSystem = useCallback(async () => {
    const [systemResult, storageResult, legendResult,filterResult] = await Promise.allSettled([
      api.system(), api.storageState(), api.statusSymbolLegend(),api.getFilters(),
    ]);
    if (systemResult.status === "fulfilled") {
      setInfo(systemResult.value);
      const mode=systemResult.value.mode==='AUTO'?'AUTO':'MANUAL';
      setOperationMode(mode);
      localStorage.setItem('lens-operation-mode',mode);
    }
    if (storageResult.status === "fulfilled") setStorage(storageResult.value);
    if (legendResult.status === "fulfilled") setStatusLegend(legendResult.value);
    if (filterResult.status === "fulfilled") {const filters=displayFilterFrom(filterResult.value);setDisplayFilter(filters);setCustomDefectIcons(new Set(filters?.error_classes||[]));}
  }, []);
  useEffect(()=>{const refresh=()=>{void refreshSystem()};window.addEventListener('lens-system-changed',refresh);window.addEventListener('lens-system-settings-changed',refresh);return()=>{window.removeEventListener('lens-system-changed',refresh);window.removeEventListener('lens-system-settings-changed',refresh)}},[refreshSystem]);
  useEffect(()=>{const refresh=()=>{void api.statusSymbolLegend().then(setStatusLegend).catch(()=>{})};const storage=(event:StorageEvent)=>{if(event.key==='lens-status-legend-version')refresh()};window.addEventListener('lens-status-legend-changed',refresh);window.addEventListener('storage',storage);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('lens-status-legend-changed',refresh);window.removeEventListener('storage',storage);window.removeEventListener('focus',refresh)}},[]);
  useEffect(()=>{const refresh=()=>{void api.getFilters().then(value=>{const filters=displayFilterFrom(value);setDisplayFilter(filters);setCustomDefectIcons(new Set(filters?.error_classes||[]))}).catch(()=>{})};const storage=(event:StorageEvent)=>{if(event.key==='lens-image-filter-version')refresh()};window.addEventListener('lens-image-filter-changed',refresh);window.addEventListener('storage',storage);return()=>{window.removeEventListener('lens-image-filter-changed',refresh);window.removeEventListener('storage',storage)}},[]);
  const changeOperationMode = useCallback(async (next?: "AUTO" | "MANUAL") => {
    if(modeBusy)return;
    const target = next || (operationMode === "AUTO" ? "MANUAL" : "AUTO");
    if(target==='MANUAL'&&(!info?.session.logged_in||info.session.role==='NoUser')){setToast('Sign in with Operator or higher permission to enter setup mode.');return}
    setModeBusy(true);
    try {
      await api.setMode(target === "AUTO" ? "AUTO" : "SETUP");
      setOperationMode(target);
      localStorage.setItem("lens-operation-mode", target);
      await refreshSystem();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to change operating mode");
    }finally{setModeBusy(false)}
  }, [info,modeBusy,operationMode,refreshSystem]);
  async function rebuildGlobalHistory(allDatasets: DatasetSummary[], selectNewest = true, reuseMetadata = false) {
    const historyVersion = ++historyVersionRef.current;
    const ordered = [...allDatasets].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const loaded = await Promise.all(ordered.map(async dataset => {
      try {
        const sharedAtStart = sharedInspectionRef.current;
        const existing = datasetSnapshotsRef.current.get(dataset.id);
        const requiredSamples = Math.max(dataset.sample_count,
          sharedAtStart?.job?.dataset_id === dataset.id ? sharedAtStart.job.total : 0);
        const cached = reuseMetadata && existing && existing.samples.length >= requiredSamples ? existing : undefined;
        const [sampleResponse, resultResponse] = cached
          ? [{ items: cached.samples }, { items: cached.results }]
          : await Promise.all([api.samples(dataset.id, Math.max(1000, dataset.sample_count,
            sharedAtStart?.job?.dataset_id === dataset.id ? sharedAtStart.job.total : 0)), sharedAtStart?.job?.dataset_id === dataset.id
            ? Promise.resolve({ items: sharedAtStart.results }) : api.results(dataset.id)]);
        const shared = sharedInspectionRef.current;
        const latestResults = shared?.job?.dataset_id === dataset.id ? shared.results : resultResponse.items;
        if (historyVersion === historyVersionRef.current) datasetSnapshotsRef.current.set(dataset.id, { samples: sampleResponse.items, results: latestResults });
        const resultBySample = new Map(latestResults.map(result => [result.sample_id, result]));
        return sampleResponse.items
          .sort((a, b) => a.wt_index - b.wt_index || a.position - b.position || a.id.localeCompare(b.id))
          .map(sample => ({ datasetId: dataset.id, sample, result: resultBySample.get(sample.id) }));
      } catch (error) {
        if (dataset.id === sharedInspectionRef.current?.job?.dataset_id) throw error;
        return [];
      }
    }));
    if (historyVersion !== historyVersionRef.current) return [];
    // WT numbers remain global, while each uploaded dataset begins a fresh tray
    // at P1.  Never let a partially filled previous upload make the next upload
    // start at P9/P10/etc.
    let wtOffset = 0;
    const flat = loaded.flatMap((datasetEntries) => {
      const localWtCount = Math.max(
        1,
        ...datasetEntries.map((entry) => entry.sample.wt_index || 1),
      );
      const entries = datasetEntries.map((entry, index) => ({
        ...entry,
        wt: wtOffset + (entry.sample.wt_index || Math.floor(index / wtCapacity) + 1),
        position: entry.sample.position || (index % wtCapacity) + 1,
      }));
      wtOffset += localWtCount;
      return entries;
    });
    // Results may have streamed while another dataset's metadata was loading.
    // Reconcile again at commit, not with a stale HTTP results response.
    const shared = sharedInspectionRef.current;
    const liveResults = new Map(shared?.results.map(result => [result.sample_id, result]) || []);
    const committed = flat.map(entry => entry.datasetId === shared?.job?.dataset_id
      ? { ...entry, result: liveResults.get(entry.sample.id) } : entry);
    if (shared?.job) {
      const cached = datasetSnapshotsRef.current.get(shared.job.dataset_id);
      if (cached) datasetSnapshotsRef.current.set(shared.job.dataset_id, { ...cached, results: shared.results });
    }
    setGlobalHistory(committed);
    const newestWt = flat.length ? Math.max(...flat.map((entry) => entry.wt)) : null;
    if (selectNewest) setSelectedGlobalWt(currentWt => currentWt && newestWt && currentWt <= newestWt ? currentWt : newestWt);
    return committed;
  }
  useEffect(()=>{if(datasets.length)void rebuildGlobalHistory(datasets)},[wtCapacity]);
  async function refreshDatasets(prefer?: string) {
    const selectionVersion = ++selectionVersionRef.current;
    try {
      const ds = await api.datasets();
      if (selectionVersion !== selectionVersionRef.current) return [];
      if (!prefer && sharedInspectionRef.current?.job) return [];
      setDatasets(ds);
      const rebuiltHistory = await rebuildGlobalHistory(ds);
      if (selectionVersion !== selectionVersionRef.current) return [];
      if (prefer) setSelectedGlobalWt(rebuiltHistory.find(entry => entry.datasetId === prefer)?.wt ?? null);
      const id = prefer || datasetId || ds[0]?.id || "";
      if (id) {
        return await loadDataset(id);
      }
      setSamples([]); setResults([]); setCurrent(null);
      return [];
    } catch (error) {
      setToast(`Backend unavailable: ${(error as Error).message}`);
      return [];
    }
  }
  async function loadDataset(id: string) {
    const selectionVersion = ++selectionVersionRef.current;
    try {
      const cached = datasetSnapshotsRef.current.get(id);
      const [s, r] = cached
        ? [{ items: cached.samples }, { items: cached.results }]
        : await Promise.all([api.samples(id), api.results(id)]);
      if (selectionVersion !== selectionVersionRef.current) return [];
      // Commit identity and metadata together, never new dataset + old frame.
      setDatasetId(id);
      setSamples(s.items);
      setResults(r.items);
      if (s.items.length) {
        setCurrent((c) =>
          s.items.some((x) => x.id === c) ? c : s.items[0].id,
        );
        const first = s.items.find(item => item.id === current) || s.items[0];
        setChannel(
          first.images[channel] ? channel : first.images.h
            ? "h"
            : first.images.d
              ? "d"
              : Object.keys(first.images)[0] || "h",
        );
      } else {
        setCurrent(null);
      }
      return s.items;
    } catch (e) {
      if (selectionVersion !== selectionVersionRef.current) return [];
      setToast(`Dataset load failed: ${(e as Error).message}`);
      setSamples([]); setResults([]); setCurrent(null);
      return [];
    }
  }
  useEffect(() => {
    refreshSystem();
    refreshDatasets();
    return () => {
      selectionVersionRef.current += 1;
      historyVersionRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>;
    const refresh=async()=>{
      try { const response=await api.logs(); if(!stopped){setLogs([...response.items].reverse());setLogsError('');} }
      catch(error){if(!stopped)setLogsError(error instanceof Error?error.message:'System messages are unavailable');}
      finally {if(!stopped)timer=setTimeout(refresh,2000);}
    };
    void refresh();
    return()=>{stopped=true;clearTimeout(timer);};
  }, []);

  // Subscribe independently of the selected historical frame. Only a new
  // backend job/generation loads metadata; incoming frames use that cache.
  useEffect(() => {
    if (!sharedInspection) return;
    const sharedJob = sharedInspection.job;
    setJob(sharedJob);
    if (sharedJob?.status === "queued" || sharedJob?.status === "running") setFollowLiveTray(true);
    if (!sharedJob) {
      if (discoveredSharedKeyRef.current || appliedSharedRef.current.key) {
        discoveredSharedKeyRef.current = "";
        selectionVersionRef.current += 1;
        historyVersionRef.current += 1;
        setHydratedSharedKey("");
        datasetSnapshotsRef.current.clear();
        setLiveDatasetId(null);
        setDatasetId(""); setSamples([]); setResults([]); setCurrent(null);
        setGlobalHistory([]); setSelectedGlobalWt(null);
        setHold(false);setHeldResult(null);
        appliedSharedRef.current = { key: "", latestFrame: "", terminal: "" };
        void refreshDatasets();
      }
      return;
    }
    discoveredSharedKeyRef.current = sharedKey;
    selectionVersionRef.current += 1;
    historyVersionRef.current += 1;
    setHydratedSharedKey("");
    setLiveDatasetId(sharedJob.dataset_id);
    const bySample = new Map(sharedInspection.results.map(result => [result.sample_id, result]));
    setGlobalHistory(previous => previous.map(entry => entry.datasetId === sharedJob.dataset_id
      ? { ...entry, result: bySample.get(entry.sample.id) } : entry));
    if (datasetId === sharedJob.dataset_id) setResults(sharedInspection.results);
    // A rerun already has complete tray metadata. Reset to P1 immediately and
    // reuse it; don't download the whole catalog again for every run.
    const existingMetadata = datasetSnapshotsRef.current.get(sharedJob.dataset_id);
    if (existingMetadata && existingMetadata.samples.length >= sharedJob.total
      && globalHistory.some(entry => entry.datasetId === sharedJob.dataset_id)) {
      setHydratedSharedKey(sharedKey);
      return;
    }
    let cancelled = false;
    const isCurrent = () => !cancelled && `${sharedInspectionRef.current?.stream_id}:${sharedInspectionRef.current?.job?.id}` === sharedKey;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const allDatasets = await api.datasets();
        if (!isCurrent()) return;
        setDatasets(allDatasets);
        await rebuildGlobalHistory(allDatasets, false, true);
        if (!isCurrent()) return;
        // An active job can be announced before the catalog request completes.
        if (!datasetSnapshotsRef.current.has(sharedJob.dataset_id)) {
          const response = await api.samples(sharedJob.dataset_id, Math.max(1000, sharedJob.total));
          if (!isCurrent()) return;
          datasetSnapshotsRef.current.set(sharedJob.dataset_id, { samples: response.items, results: [] });
        }
        setHydratedSharedKey(sharedKey);
      } catch {
        // Keep the last decoded canvas while metadata recovers, without losing
        // newer frames already buffered in the shared snapshot.
        if (isCurrent()) retryTimer = setTimeout(() => setHydrationRetry(value => value + 1), 1500);
      }
    })();
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, [sharedKey, sharedInspection?.stream_id, hydrationRetry]);

  useEffect(() => {
    if (!sharedInspection?.job) return;
    const sharedJob = sharedInspection.job;
    setJob(sharedJob);
    if (hydratedSharedKey !== sharedKey) return;
    const cached = datasetSnapshotsRef.current.get(sharedJob.dataset_id);
    if (!cached) return;
    datasetSnapshotsRef.current.set(sharedJob.dataset_id, { ...cached, results: sharedInspection.results });
    const bySample = new Map(sharedInspection.results.map(result => [result.sample_id, result]));
    setGlobalHistory(previous => previous.map(entry => entry.datasetId === sharedJob.dataset_id
      ? { ...entry, result: bySample.get(entry.sample.id) } : entry));
    const newest = sharedInspection.results.at(-1);
    const latestFrame = newest ? `${newest.sample_id}:${newest.created_at}` : "";
    const firstAttach = appliedSharedRef.current.key !== sharedKey;
    const newFrame = latestFrame !== appliedSharedRef.current.latestFrame;
    const running = sharedJob.status === "queued" || sharedJob.status === "running";
    const autoFollow=operationMode==='AUTO'&&(running||newFrame);
    const displayPolicy=JSON.stringify([operationMode,displayFilter,statusLegend?.defects]);
    const policyChanged=appliedDisplayPolicyRef.current!==displayPolicy;
    const resume=resumeLiveRef.current&&!hold;
    // Live synchronization wins over an idle-review display filter. Otherwise
    // History/WT advance while canvas remains on an older matching defect.
    const filterActive=operationMode==='AUTO'&&displayFilter?.apply_to_display&&!autoFollow;
    const displayResult=filterActive?sharedInspection.results.slice().reverse().find(result=>{
      const candidate=cached.samples.find(item=>item.id===result.sample_id);
      return candidate&&matchesDisplayFilter(candidate,result,displayFilter,statusLegend);
    }):newest;
    // Local MANUAL controls how uploads start, not whether another operator's
    // live inspection is visible. Idle historical browsing remains untouched.
    if ((firstAttach || newFrame || resume || policyChanged)&&(!hold||autoFollow)&&(!filterActive||displayResult)) {
      if(autoFollow){setHold(false);setHeldResult(null);setFollowLiveTray(true);}
      selectionVersionRef.current += 1;
      setDatasetId(sharedJob.dataset_id);
      setSamples(cached.samples);
      setResults(sharedInspection.results);
      setCurrent(displayResult?.sample_id || cached.samples[0]?.id || null);
      setSelectedGlobalWt(null);
      setSelectedDefect(-1);
      const latestSample = cached.samples.find(item => item.id === displayResult?.sample_id) || cached.samples[0];
      if (latestSample) setChannel(previous => latestSample.images[previous] ? previous
        : latestSample.images.h ? "h" : Object.keys(latestSample.images)[0] || "h");
    } else if (datasetId === sharedJob.dataset_id) {
      setResults(sharedInspection.results);
    }
    const terminal = running ? "" : `${sharedKey}:${sharedJob.status}`;
    if (terminal && appliedSharedRef.current.terminal !== terminal) {
      const stillCurrent = () => `${sharedInspectionRef.current?.stream_id}:${sharedInspectionRef.current?.job?.id}` === sharedKey;
      void api.logs().then(response => { if (stillCurrent()) setLogs(response.items.reverse()); }).catch(() => {});
      void api.storageState().then(response => { if (stillCurrent()) setStorage(response); }).catch(() => {});
      if (!firstAttach) setToast(sharedJob.status === "failed"
        ? `Inspection failed: ${sharedJob.error || "Unknown processing error"}`
        : `Inspection ${sharedJob.status} · ${sharedJob.completed} of ${sharedJob.total} lenses`);
    }
    appliedSharedRef.current = { key: sharedKey, latestFrame, terminal };
    appliedDisplayPolicyRef.current=displayPolicy;
    resumeLiveRef.current=false;
  }, [sharedInspection, hydratedSharedKey, sharedKey,hold,displayFilter,statusLegend,operationMode]);

  const resultMap = useMemo(
    () => new Map(results.map((r) => [r.sample_id, r])),
    [results],
  );
  const statusSymbols = useMemo(
    () => Object.fromEntries((statusLegend?.statuses || []).map((item) => [item.key, item])) as Partial<Record<Status, StatusSymbol>>,
    [statusLegend],
  );
  const statusSymbol = (status: Status): StatusSymbol => statusSymbols[status] || ({
    OK: { key: "OK", label: "Inspection OK", color: "#35d982", symbol: "✓" },
    NOK: { key: "NOK", label: "Not OK", color: "#f05262", symbol: "!" },
    WARN: { key: "WARN", label: "Warning", color: "#f4b740", symbol: "▲" },
    IDLE: { key: "IDLE", label: "Not inspected", color: "#718397", symbol: "·" },
  } satisfies Record<Status, StatusSymbol>)[status];
  const defectDefinition = (name: string): StatusSymbol|undefined => {
    const normalized = name.toLowerCase();
    return (statusLegend?.defects || []).find((item) =>
      (item.match_terms || []).some((term) => normalized.includes(term.toLowerCase())),
    );
  };
  const defectSymbol = (name: string): StatusSymbol => {
    const configured=defectDefinition(name);
    if(configured&&!customDefectIcons.has(configured.key))return statusSymbol(configured.outcome||"NOK");
    return configured || statusLegend?.fallback_defect || { key: "unknown-defect", label: "NOK", color: statusSymbol("NOK").color, symbol: "i" };
  };
  useEffect(() => {
    if (!datasetId) return;
    setGlobalHistory(previous => previous.map(entry => {
      if (entry.datasetId !== datasetId) return entry;
      const sharedJob = sharedInspectionRef.current?.job;
      if (entry.datasetId === sharedJob?.dataset_id && (sharedJob.status === "running" || sharedJob.status === "queued")) return entry;
      const liveResult=resultMap.get(entry.sample.id);
      return {...entry,result:datasetId===liveDatasetId?liveResult:liveResult||entry.result};
    }));
  }, [datasetId, liveDatasetId, resultMap]);
  const sample = useMemo(
    () => samples.find((s) => s.id === current) || null,
    [samples, current],
  );
  const currentResult = hold&&heldResult?.datasetId===datasetId&&heldResult.sampleId===current
    ? heldResult.result : current ? resultMap.get(current) : undefined;
  const currentInferenceTime = formatInferenceMs(inferenceElapsedMs(currentResult));
  const imageSizeKey = `${datasetId}:${sample?.id || ""}:${channel}`;
  const onImageDimensions = useCallback((width:number,height:number) => {
    setLoadedImageSize({key:imageSizeKey,width,height});
  }, [imageSizeKey]);
  const currentMeasurements = (currentResult?.channels.find(
    (item) => item.channel === channel,
  ) || currentResult?.channels[0])?.measurements;
  const bottomLensOffset=useMemo(()=>{
    const x=currentMeasurements?.BottomLensOffsetX,y=currentMeasurements?.BottomLensOffsetY;
    return typeof x==='number'&&typeof y==='number'&&Number.isFinite(x)&&Number.isFinite(y)?{x,y}:undefined;
  },[currentMeasurements]);
  const currentDimension = (key: "width_px" | "height_px") => {
    const value = currentMeasurements?.[key]
      ?? currentResult?.channels.find(item => item.measurements?.[key] !== undefined)?.measurements[key]
      ?? (loadedImageSize?.key === imageSizeKey ? loadedImageSize[key === "width_px" ? "width" : "height"] : undefined);
    return value === undefined ? "—" : `${value} px`;
  };
  const lastInspectionLabel = currentResult?.created_at
    ? new Date(currentResult.created_at).toLocaleString([], {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
  const dataset = datasets.find((item) => item.id === datasetId);
  const visibleDefects = useMemo(
    () =>
      errorMode === "none"
        ? []
        : (currentResult?.defects || []).filter(
          (d) => errorMode === "all" || (d.tolerance || "AT") === "AT",
        ),
    [currentResult, errorMode],
  );
  const toggleDefectFocus = (index: number) => setSelectedDefect(current => current === index ? -1 : index);
  const counts = useMemo(
    () =>
      results.reduce(
        (a, r) => {
          a[r.status] = (a[r.status] || 0) + 1;
          return a;
        },
        { OK: 0, NOK: 0, WARN: 0 } as Record<string, number>,
      ),
    [results],
  );
  const yieldResults=useMemo(()=>[...globalHistory.flatMap(entry=>entry.result?[entry.result]:[]),...results],[globalHistory,results]);
  const trendTrayLabels=useMemo(()=>new Map(globalHistory.map(entry=>[JSON.stringify([entry.datasetId,entry.sample.wt_index]),entry.wt])),[globalHistory]);
  const yieldPct = calculateInspectionYield(yieldResults);
  const okRate = results.length ? (counts.OK / results.length) * 100 : 0;
  const nokRate = results.length ? (counts.NOK / results.length) * 100 : 0;
  const warnRate = results.length ? (counts.WARN / results.length) * 100 : 0;
  const totalDefects = useMemo(() => results.reduce((total, item) => total + (item.defects?.length || 0), 0), [results]);
  const averageCycleMs = useMemo(() => {
    return averageInferenceMs(results);
  }, [results]);
  const activeGlobalWt = selectedGlobalWt || globalHistory.find(entry => entry.datasetId === datasetId && entry.sample.id === current)?.wt || 1;
  const inspectionIdentifiers = useMemo(() => {
    const filename = sample?.images[channel]?.filename || Object.values(sample?.images || {})[0]?.filename || "";
    const trayMatch = filename.match(/(?:^|_)CV[._-]?(\d{1,8})(?:_|$)/i);
    const positionMatch = filename.match(/(?:^|_)Position(\d{1,2})(?:_|$)/i);
    return {
      ctNumber: `CV-${activeGlobalWt}`,
      shuttleNumber: positionMatch?.[1] || (sample ? String(sample.position) : "—"),
      curingTray: trayMatch ? `CT.${trayMatch[1]}` : sample?.metadata.tail_code || "—",
    };
  }, [activeGlobalWt, channel, sample]);
  const sharedNewest=sharedInspection?.results.at(-1);
  const liveTrayEntry=globalHistory.find(entry=>entry.datasetId===job?.dataset_id&&entry.sample.id===sharedNewest?.sample_id)
    ||globalHistory.find(entry=>entry.datasetId===job?.dataset_id);
  // Gallery progression is independent of the held/filtered canvas. Retain
  // the last live tray on completion until an explicit historical selection.
  const trayGlobalWt=followLiveTray?liveTrayEntry?.wt||activeGlobalWt:activeGlobalWt;
  const wtEntries = useMemo(() => globalHistory.filter(entry => entry.wt === trayGlobalWt), [globalHistory, trayGlobalWt]);
  const previewStreaming=job?.status==='running'||job?.status==='queued';
  const trayThumbnailScope = JSON.stringify(wtEntries.filter(entry=>!previewStreaming||entry.result||entry.sample.id===job?.current_sample_id).slice().reverse().flatMap(entry => Object.keys(entry.sample.images)
    .filter(candidate => !entry.sample.images[candidate].relative_path.startsWith("demo:"))
    .map(candidate => ({ channel: candidate, url: thumbnailUrl(entry.datasetId, entry.sample.id, candidate) }))));
  useEffect(() => {
    const previews = JSON.parse(trayThumbnailScope) as { channel: string; url: string }[];
    if (!previews.length) return;
    const controller = new AbortController();
    const urlsFor = (allChannels: boolean) => previews.filter(preview => allChannels ? preview.channel !== channel : preview.channel === channel).map(preview => preview.url);
    const streaming=job?.status==='running'||job?.status==='queued';
    // Only the active tray is warmed. Other illuminations follow at low
    // concurrency, so switching back is served from memory/browser cache.
    const active = warmPreviews(urlsFor(false), controller.signal, streaming?1:3);
    const timer = window.setTimeout(() => {
      void active.then(() => {
        if (!controller.signal.aborted) return warmPreviews(urlsFor(true), controller.signal, 2);
      });
    }, streaming?2000:500);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [trayThumbnailScope, channel,job?.status]);
  const visibleGlobalHistory = useMemo(() => {
    if (!liveDatasetId) return globalHistory;
    const liveEntries=globalHistory.filter(entry=>entry.datasetId===liveDatasetId);
    if (!liveEntries.length) return globalHistory.filter(entry=>entry.datasetId!==liveDatasetId);
    const firstLiveWt=Math.min(...liveEntries.map(entry=>entry.wt));
    const inferredWts=liveEntries.filter(entry=>entry.result).map(entry=>entry.wt);
    const newestStartedWt=inferredWts.length?Math.max(...inferredWts):firstLiveWt;
    return globalHistory.filter(entry=>entry.datasetId!==liveDatasetId||entry.wt<=newestStartedWt);
  },[globalHistory,liveDatasetId]);
  const wtChannelImages = useMemo(
    () =>
      Array.from({ length: wtCapacity }, (_, i) => {
        const position = i + 1,
          entry = wtEntries.find((row) => row.position === position),
          s = entry?.sample,
          availableImage = s?.images[channel],
          result = entry?.datasetId === datasetId && s
            ? entry.datasetId === liveDatasetId
              ? resultMap.get(s.id)
              : resultMap.get(s.id) || entry.result
            : entry?.result,
          waitingForLiveResult = entry?.datasetId === liveDatasetId && !result,
          visibleSample = waitingForLiveResult ? undefined : s,
          image = waitingForLiveResult ? undefined : availableImage,
          defect = result?.defects?.[0]?.name || "No defect";
        return {
          position,
          entry,
          sample: visibleSample,
          image,
          result,
          defect,
          channel,
          name:
            image?.filename ||
            `Position ${position} · No ${channel.toUpperCase()} image`,
          src: visibleSample && image && entry ? sampleThumbnailUrl(entry.datasetId, visibleSample, channel) : "",
        };
      }),
    [wtEntries, datasetId, channel, resultMap, liveDatasetId],
  );
  const channelLabels: Record<string, string> = {
    ...(info?.settings.channel_labels || {}),
    h: "Telecentric",
    d: "Dark Field",
    n: "Diffuse",
    p: "Phase Contrast",
  };
  const currentPreviewChannel = sample?.images[channel]
    ? channel
    : sample?.images.h
      ? "h"
      : sample?.images.d
        ? "d"
        : Object.keys(sample?.images || {})[0] || "h";
  const detailPreviewSrc = sample
    ? sampleThumbnailUrl(datasetId, sample, currentPreviewChannel)
    : "";
  const filteredLogs = useMemo(
    () =>
      logs.filter(
        (l) =>
          logFilter === "all" ||
          (logFilter === "system"
            ? !["warning", "error"].includes(l.level.toLowerCase())
            : l.level.toLowerCase() === logFilter),
      ),
    [logs, logFilter],
  );
  const defectSummary = useMemo(() => {
    const m = new Map<string, number>();
    results
      .flatMap((r) => r.defects || [])
      .forEach((d) => m.set(d.name, (m.get(d.name) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [results]);
  const showHistory = prefs.showHistory && !focusMode;
  const showDetails = prefs.showDetails;
  const showTray = prefs.showTray && !focusMode;
  const showWorkspace = prefs.showWorkspace && !focusMode;
  const bottomLayoutEditing = canCustomize && !prefs.uiLocked;
  const displayYield = yieldPct;
  const displayNok = nokRate;
  const isRunning =
    busy || job?.status === "queued" || job?.status === "running";
  useEffect(() => {
    if (!datasetId || !sample || isRunning) return;
    const controller = new AbortController();
    // Other illuminations of this selected lens only, not the whole dataset.
    const timer = window.setTimeout(() => {
      const urls = Object.keys(sample.images).filter(candidate => candidate !== channel && !sample.images[candidate].relative_path.startsWith("demo:"))
        .map(candidate => previewUrl(datasetId, sample.id, candidate));
      void warmPreviews(urls, controller.signal, 1);
    }, 750);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [datasetId, sample, channel, isRunning]);
  const halconOnline = Boolean(info?.bridge && !/offline|unavailable|none|disconnected/i.test(info.bridge));
  useEffect(()=>{
    if(!storage?.active&&!storage?.schedule_key&&!isRunning)return;
    let active=true;
    const timer=window.setInterval(()=>void api.storageState().then(value=>{if(active)setStorage(value)}).catch(()=>{}),2000);
    return()=>{active=false;window.clearInterval(timer)};
  },[storage?.active,storage?.schedule_key,isRunning]);
  const jobProgress = job?.total
    ? Math.min(100, (job.completed / job.total) * 100)
    : 0;

  function closeApplication() {
    if(!loggedIn)return;
    if (!window.confirm("Close DSM BV 4Cam Inspection System?")) return;
    window.close();
    window.setTimeout(() => {
      if (!window.closed) setToast("Your browser prevented this tab from closing. You can close it manually.");
    }, 250);
  }

  async function run(targetDatasetId = datasetId, targetSampleCount = samples.length) {
    if(!loggedIn)return;
    const sharedStatus = sharedInspectionRef.current?.job?.status;
    if (!targetDatasetId || isRunning || sharedStatus === "queued" || sharedStatus === "running") return;
    if (!targetSampleCount) {
      setToast("This lot contains no supported inspection images.");
      return;
    }
    setBusy(true);
    try {
      const j = await api.run(targetDatasetId);
      setToast(`Inspection ${j.status} · ${j.completed} of ${j.total} lenses`);
      // Every client (including this starter) consumes the exact same stream.
      // Discover fast/finished jobs even if their socket event was missed.
      resyncInspection();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function handleLotLoaded(id: string) {
    setHold(false);setHeldResult(null);setFollowLiveTray(false);
    setLiveDatasetId(id);
    setSelectedGlobalWt(null);
    const loadedSamples = await refreshDatasets(id);
    setToast(`New lot imported · ${loadedSamples.length} lenses`);
    if (operationMode === "AUTO" && loadedSamples.length) {
      await run(id, loadedSamples.length);
    } else if (loadedSamples.length) {
      setToast(`Folder loaded · ${loadedSamples.length} lenses · Manual mode: inference has not started. Use Inspect selected, or load the folder in Automatic mode.`);
    }
  }
  async function stop() {
    if (!job || !["queued", "running"].includes(job.status)) return;
    try {
      setJob(await api.cancel(job.id));
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function inspectSelected() {
    if (!datasetId || !sample) return;
    const selectionVersion = selectionVersionRef.current;
    setBusy(true);
    try {
      const r = await api.inspectOne(datasetId, sample.id);
      if (selectionVersion === selectionVersionRef.current) {
        setResults((p) => [...p.filter((x) => x.sample_id !== r.sample_id), r]);
        setSelectedDefect(-1);
      }
      setHeldResult(previous => previous?.datasetId === r.dataset_id && previous.sampleId === r.sample_id
        ? { ...previous, result: r } : previous);
      setGlobalHistory(previous => previous.map(entry => entry.datasetId === r.dataset_id && entry.sample.id === r.sample_id
        ? { ...entry, result: r } : entry));
      await api.storageState().then(setStorage);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function snap() {
    if (!datasetId || !sample || snapshotBusy) return;
    setSnapshotBusy(true);
    const selectedSample=sample, selectedDataset=datasetId;
    try {
      setToast("Preparing all illumination images…");
      const zip=await lensSnapshotArchive(selectedSample,async illumination=>{
        await api.snapshot(selectedDataset,selectedSample.id,illumination);
        const response=await fetch(`${API}/datasets/${encodeURIComponent(selectedDataset)}/image/${encodeURIComponent(selectedSample.id)}/${illumination}`,{signal:AbortSignal.timeout(120000)});
        if(!response.ok)throw new Error(`Could not download ${channelLabels[illumination] || illumination} (HTTP ${response.status}).`);
        return response.blob();
      });
      const url=URL.createObjectURL(zip),link=document.createElement('a');
      link.href=url;link.download=`${selectedSample.base_name.replace(/[\\/:*?"<>|]/g,'_').slice(0,160)}-illuminations.zip`;
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
      setToast("Lens snapshot saved and downloaded with all available illuminations.");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setSnapshotBusy(false);
    }
  }
  async function archiveCurrentWt() {
    if (!datasetId || !sample) return;
    try {
      const r = await api.archiveRing(datasetId, sample.wt_index);
      setToast(`WT ${sample.wt_index} archived · ${r.images} images`);
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function clearInspectionHistory() {
    if (info?.session.role !== "Administrator") return;
    const confirmed = window.confirm("Clear all inspection history? Uploaded datasets, previews, and results will be removed. User accounts, settings, logs, and archived ring-buffer images will be kept.");
    if (!confirmed) return;
    setBusy(true);
    try {
      const response = await api.clearHistory();
      selectionVersionRef.current += 1;
      historyVersionRef.current += 1;
      datasetSnapshotsRef.current.clear();
      setDatasetId(""); setDatasets([]); setSamples([]); setResults([]); setGlobalHistory([]); setCurrent(null); setSelectedGlobalWt(null); setLiveDatasetId(null); setJob(null);
      setHold(false);setHeldResult(null);
      await refreshDatasets();
      resyncInspection();
      setToast(`History cleared · ${response.removed.catalogs || 0} datasets and ${response.removed.results || 0} result files removed`);
    } catch (error) {
      setToast(`Unable to clear history: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function toggleStorage() {
    if(!loggedIn)return;
    try {
      setStorage(
        storage?.active||storage?.schedule_key ? await api.storageStop() : await api.storageStart(),
      );
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function switchUser() {
    setBusy(true);
    setLoginError("");
    try {
      await api.login(loginUser, loginPassword);
      await refreshSystem();
      window.dispatchEvent(new Event("lens-auth-changed"));
      setLoginPassword("");
      setLoginOpen(false);
      setToast(`Signed in as ${loginUser}`);
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createApplicationUser() {
    setLoginError("");
    if (!isStrongPassword(newPassword)) {setLoginError("Password must be at least 8 characters and include uppercase, lowercase, a number, and a special symbol");return}
    if (newPassword !== newPasswordConfirm) {setLoginError("Passwords do not match");return}
    setBusy(true);
    try {
      await api.createUser(newUsername,newPassword,newUserRole);
      setLoginUser("");setLoginPassword("");setNewUsername("");setNewPassword("");setNewPasswordConfirm("");setLoginView("login");
      setToast(`User ${newUsername} created · sign in with the new account`);
    } catch (e) {setLoginError(e instanceof Error?e.message:"Unable to create user")}
    finally {setBusy(false)}
  }
  function select(id: string) {
    if(operationMode==='AUTO'&&['running','queued'].includes(sharedInspectionRef.current?.job?.status||''))return;
    if (!['running','queued'].includes(sharedInspectionRef.current?.job?.status || '')) setFollowLiveTray(false);
    setHold(true);setHeldResult({datasetId,sampleId:id,result:resultMap.get(id)});
    selectionVersionRef.current += 1;
    setCurrent(id);
    setSelectedDefect(-1);
    const s = samples.find((x) => x.id === id);
    const historyEntry = globalHistory.find(entry => entry.datasetId === datasetId && entry.sample.id === id);
    if (historyEntry) setSelectedGlobalWt(historyEntry.wt);
    if (s && !s.images[channel])
      setChannel(
        s.images.h ? "h" : s.images.d ? "d" : Object.keys(s.images)[0] || "h",
      );
  }
  function selectHistoryEntry(entry: GlobalHistoryEntry) {
    if(operationMode==='AUTO'&&['running','queued'].includes(sharedInspectionRef.current?.job?.status||''))return;
    if (!['running','queued'].includes(sharedInspectionRef.current?.job?.status || '')) setFollowLiveTray(false);
    setHold(true);setHeldResult({datasetId:entry.datasetId,sampleId:entry.sample.id,result:entry.datasetId===datasetId?resultMap.get(entry.sample.id)||entry.result:entry.result});
    selectionVersionRef.current += 1;
    setSelectedGlobalWt(entry.wt);
    if (entry.datasetId !== datasetId) {
      // History is already loaded. Reuse it instead of waiting for another
      // samples/results round trip every time the operator picks a tray.
      const entries = globalHistory.filter(row => row.datasetId === entry.datasetId);
      setDatasetId(entry.datasetId);
      setSamples(entries.map(row => row.sample));
      setResults(entries.flatMap(row => row.result ? [row.result] : []));
    }
    setCurrent(entry.sample.id);
    setSelectedDefect(-1);
    const available = entry.sample.images;
    if (!available[channel]) setChannel(available.h ? "h" : available.d ? "d" : Object.keys(available)[0] || "h");
  }
  function toggleLensHold(){
    if(hold){resumeLiveRef.current=true;setFollowLiveTray(true);setHeldResult(null);setHold(false)}
    else if(sample){setHeldResult({datasetId,sampleId:sample.id,result:currentResult});setHold(true)}
  }
  function relative(step: number) {
    if (!sample || !samples.length) return;
    const i = samples.findIndex((x) => x.id === sample.id),
      next = samples[(i + step + samples.length) % samples.length];
    select(next.id);
  }

  function beginResize(
    kind: "history" | "details",
    e: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (!bottomLayoutEditing || window.innerWidth < 1060) return;
    e.preventDefault();
    const host = e.currentTarget.parentElement;
    if (!host) return;
    const rect = host.getBoundingClientRect(),
      startX = e.clientX,
      h0 = prefs.historyWidth,
      v0 = prefs.viewerWidth,
      d0 = prefs.detailsWidth,
      total = h0 + v0 + d0;
    let next = { historyWidth: h0, viewerWidth: v0, detailsWidth: d0 };
    document.body.classList.add("is-resizing-dashboard");
    const root = document.documentElement;
    const move = (ev: PointerEvent) => {
      const delta = ((ev.clientX - startX) / Math.max(1, rect.width)) * total;
      if (kind === "history") {
        const h = Math.max(0.46, Math.min(1.25, h0 + delta)),
          v = Math.max(0.82, Math.min(2.5, v0 - delta));
        next = { historyWidth: h, viewerWidth: v, detailsWidth: d0 };
        root.style.setProperty("--history-fr", `${h}fr`);
        root.style.setProperty("--viewer-fr", `${v}fr`);
      } else {
        const v = Math.max(0.82, Math.min(2.5, v0 + delta)),
          d = Math.max(0.48, Math.min(1.3, d0 - delta));
        next = { historyWidth: h0, viewerWidth: v, detailsWidth: d };
        root.style.setProperty("--viewer-fr", `${v}fr`);
        root.style.setProperty("--details-fr", `${d}fr`);
      }
    };
    const up = () => {
      document.body.classList.remove("is-resizing-dashboard");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      patch(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
  function beginInspectionResize(
    kind: "history" | "control" | "details",
    e: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (!bottomLayoutEditing || window.innerWidth < 1060) return;
    e.preventDefault();
    const pointerId = e.pointerId;
    const handle = e.currentTarget;
    handle.setPointerCapture(pointerId);
    const startX = e.clientX,
      h0 = prefs.inspectionHistoryWidth,
      c0 = prefs.inspectionControlWidth,
      d0 = prefs.inspectionDetailsWidth;
    let next = {
      inspectionHistoryWidth: h0,
      inspectionControlWidth: c0,
      inspectionDetailsWidth: d0,
    };
    const root = document.documentElement;
    document.body.classList.add("is-resizing-dashboard");
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const delta = ev.clientX - startX;
      if (kind === "history") {
        const value = Math.max(240, Math.min(570, h0 + delta));
        next = { ...next, inspectionHistoryWidth: value };
        root.style.setProperty("--inspection-history-width", `${value}px`);
      }
      if (kind === "control") {
        const value = Math.max(180, Math.min(340, c0 + delta));
        next = { ...next, inspectionControlWidth: value };
        root.style.setProperty("--inspection-control-width", `${value}px`);
      }
      if (kind === "details") {
        const value = Math.max(250, Math.min(520, d0 - delta));
        next = { ...next, inspectionDetailsWidth: value };
        root.style.setProperty("--inspection-details-width", `${value}px`);
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      document.body.classList.remove("is-resizing-dashboard");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      patch(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function beginBottomResize(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!bottomLayoutEditing) return;
    e.preventDefault();
    const pointerId = e.pointerId;
    const handle = e.currentTarget;
    handle.setPointerCapture(pointerId);
    const startY = e.clientY,
      h0 = prefs.bottomHeight;
    document.body.classList.add("is-resizing-dashboard");
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const h = Math.max(
        126,
        Math.min(
          Math.min(340, window.innerHeight * 0.43),
          h0 + (startY - ev.clientY),
        ),
      );
      document.documentElement.style.setProperty(
        "--dashboard-bottom-height",
        `${h}px`,
      );
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const h = Math.max(
        126,
        Math.min(
          Math.min(340, window.innerHeight * 0.43),
          h0 + (startY - ev.clientY),
        ),
      );
      document.body.classList.remove("is-resizing-dashboard");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      patch({ bottomHeight: h });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function beginBottomSectionResize(
    leftKey: BottomWidthKey,
    rightKey: BottomWidthKey,
    e: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (!bottomLayoutEditing || window.innerWidth < 1060) return;
    e.preventDefault();
    const splitter = e.currentTarget,
      left = splitter.previousElementSibling as HTMLElement | null,
      right = splitter.nextElementSibling as HTMLElement | null;
    if (!left || !right) return;
    const startX = e.clientX,
      leftWidth = left.getBoundingClientRect().width,
      rightWidth = right.getBoundingClientRect().width,
      pairWidth = leftWidth + rightWidth,
      totalWeight = prefs[leftKey] + prefs[rightKey],
      minimum = Math.min(180, pairWidth * 0.34);
    let nextLeft = prefs[leftKey], nextRight = prefs[rightKey];
    document.body.classList.add("is-resizing-dashboard");
    const move = (event: PointerEvent) => {
      const nextLeftWidth = Math.max(
        minimum,
        Math.min(pairWidth - minimum, leftWidth + event.clientX - startX),
      );
      nextLeft = totalWeight * (nextLeftWidth / pairWidth);
      nextRight = totalWeight - nextLeft;
      left.style.flexGrow = String(nextLeft);
      right.style.flexGrow = String(nextRight);
    };
    const up = () => {
      document.body.classList.remove("is-resizing-dashboard");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      patch({ [leftKey]: nextLeft, [rightKey]: nextRight });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
  function resetLayout() {
    setFocusMode(false);
    patch({
      historyWidth: 0.66,
      viewerWidth: 1.52,
      detailsWidth: 0.78,
      bottomHeight: 188,
      showHistory: true,
      showDetails: true,
      showTray: true,
      showWorkspace: true,
      density: "compact",
    });
  }

  const layoutClass =
    !showHistory && !showDetails
      ? "viewerOnly"
      : !showHistory
        ? "noHistory"
        : !showDetails
          ? "noDetails"
          : "";

  if (inspectionMode && prefs.manualSkeleton)
    return (
      <div
        className={`premiumDashboardPage oakWorkstationPage inspectionReferencePage ${prefs.manualSkeleton ? "pdfSkeletonMode" : ""} ${!prefs.showHistory ? "studioHideHistory" : ""} ${!prefs.showDetails ? "studioHideDetails" : ""} ${!prefs.showWorkspace ? "studioHideWorkspace" : ""}`}
      >
        {prefs.manualSkeleton ? (
          <ClassicHeader
            onSwitchUser={()=>{setLoginView("login");setLoginError("");setLoginUser("");setLoginPassword("");setLoginOpen(true)}}
            onImageFilter={()=>window.dispatchEvent(new Event("lens-open-image-filter"))}
            onRegistration={()=>window.dispatchEvent(new Event("lens-open-registration"))}
            onFocus={()=>window.dispatchEvent(new Event("lens-open-focus"))}
            onSettings={()=>window.dispatchEvent(new Event("lens-open-settings"))}
            onBvTest={()=>window.dispatchEvent(new Event("lens-open-bv-test"))}
            onDataset={()=>loggedIn&&setLoader(true)}
            onInfo={()=>window.dispatchEvent(new Event("lens-open-info"))}
            onTrendLine={()=>{if(loggedIn)setTrendPopupOpen(true)}}
            onExit={()=>setToast("Exit is disabled in the browser interface")}
            onUi={()=>window.dispatchEvent(new Event("lens-open-customizer"))}
          />
        ) : (
          <TopBar
            workstation
            info={info}
            operationMode={operationMode}
            modeBusy={modeBusy}
            onOperationMode={() => changeOperationMode()}
            onRefresh={refreshSystem}
            onUpload={() => loggedIn&&setLoader(true)}
            onLayout={() =>
              window.dispatchEvent(new Event("lens-open-customizer"))
            }
            stats={
              prefs.showKpis
                ? {
                  yieldPct: displayYield,
                  total: samples.length,
                  nokRate: displayNok,
                  evaluated: results.length,
                }
                : undefined
            }
          />
        )}
        {!prefs.manualSkeleton && (
          <div className="inspectionSourceBar">
            <div className="inspectionDatasetPicker">
              <FolderOpen />
              <span>
                <small>PRODUCTION SOURCE</small>
                <b>Unified WT stream · {globalHistory.length} lenses</b>
              </span>
              <button onClick={() => loggedIn&&setLoader(true)}>Upload Folder</button>
              <button
                className="iconOnly"
                onClick={() => refreshDatasets()}
                title="Refresh datasets"
              >
                <RefreshCw />
              </button>
            </div>
            <div className={`inspectionJobPill ${job?.status || "idle"}`}>
              <i />
              <span>
                <small>
                  {job?.status === "failed"
                    ? "Inspection error"
                    : isRunning
                      ? "Inspection running"
                      : job?.status === "completed"
                        ? "Last run complete"
                        : ""}
                </small>
                <b>
                  {isRunning
                    ? `${job?.completed || 0} / ${job?.total || samples.length}`
                    : `${samples.length} lenses loaded`}
                </b>
              </span>
              {isRunning && <em style={{ width: `${jobProgress}%` }} />}
            </div>
            <button
              className="inspectionLayoutButton"
              onClick={() =>
                window.dispatchEvent(new Event("lens-open-customizer"))
              }
            >
              <LayoutDashboard />
              Adjust Layout
            </button>
          </div>
        )}

        <div className="inspectionReferenceViewport">
          <div className="inspectionReferenceGrid">
            <div className="inspectionHistoryColumn">
              <StatusMatrix
                samples={samples}
                results={resultMap}
                current={current}
                currentDatasetId={datasetId}
                onPick={select}
                history={visibleGlobalHistory}
                onHistoryPick={(entry) => { void selectHistoryEntry(entry) }}
                maxRows={30}
                capacity={wtCapacity}
                legend={statusLegend}
                customDefectIcons={customDefectIcons}
                onClearHistory={info?.session.role === "Administrator" ? () => { void clearInspectionHistory(); } : undefined}
                onArchive={async (wt) => {
                  try {
                    const r = await api.archiveRing(datasetId, wt);
                    setToast(`WT ${wt} archived · ${r.images} images`);
                  } catch (e) {
                    setToast((e as Error).message);
                  }
                }}
              />
              <div className="inspectionHistoryActions">
                <button onClick={archiveCurrentWt}>
                  <Archive />
                  Archive ring-buffer images
                </button>
                <button onClick={() => setShowLegend((v) => !v)}>
                  <CircleAlert />
                  Status symbol legend
                </button>
              </div>
              {showLegend && (
                <div className="inspectionLegendPopover">
                  <div className="inspectionLegendHead">
                    <div>
                      <b>Status symbols</b>
                      <small>Changes apply immediately everywhere</small>
                    </div>
                    <button onClick={() => setShowLegend(false)}>×</button>
                  </div>
                  <div className="inspectionLegendGrid configuredLegendGrid">
                    {(["OK", "NOK", "WARN", "IDLE"] as Status[]).map((status) => {
                      const item = statusSymbol(status);
                      return <span key={item.key}><i style={{ backgroundColor: item.color }}>{item.symbol}</i>{item.label}</span>;
                    })}
                    {(statusLegend?.defects || []).map((item) => (
                      <span key={item.key}><i style={{ backgroundColor: item.color }}>{item.symbol}</i>{item.label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              className="inspectionVerticalSplit historySplit"
              onPointerDown={(e) => beginInspectionResize("history", e)}
              title="Drag to resize WT history"
            >
              <GripVertical />
            </button>

            <section className="inspectionMachinePanel">
              <div className="inspectionStationName">
                <span>
                  <b>{info?.settings.station_name||'Station —'}</b>
                </span>
              </div>
              <div className="inspectionControlBlock">
                <h2>Current Business mode</h2>
                <button
                  className={`inspectionModeToggle ${operationMode.toLowerCase()}`}
                  onClick={() => changeOperationMode()}
                  disabled={modeBusy||(operationMode==='AUTO'&&(!info?.session.logged_in||info.session.role==='NoUser'))}
                  aria-label={`Switch to ${operationMode === "AUTO" ? "Manual" : "Automatic"} operation`}
                >
                  {operationMode === "AUTO" ? <Play /> : <Pause />}
                  <span>
                    <b>{operationMode === "AUTO" ? "Automatic operation" : "Setup operation"}</b>
                    <small>
                      {operationMode === "AUTO"
                        ? isRunning ? "Inspection cycle active" : "Ready for production"
                        : "Operator control active"}
                    </small>
                  </span>
                </button>

                {/* <button className="inspectionRunButton" onClick={run} disabled={isRunning||!samples.length}>{isRunning?<Loader2 className="spin"/>:<Play/>}{isRunning?`Running ${job?.completed||0}/${job?.total||samples.length}`:'Run All'}</button>
         <button className="inspectionStopButton" onClick={stop} disabled={!job||!['queued','running'].includes(job.status)}><Square/>Stop inspection</button> */}
              </div>

              <button
                className="inspectionStorageButton"
                onClick={toggleStorage}
              >
                <Camera />
                <span>
                  <b>Image storage</b>
                  <small>
                    {storage?.active
                      ? "Recording inspection images"
                      : storage?.schedule_key?"Schedule armed":"Storage ready"}
                  </small>
                </span>
              </button>
              <div className="inspectionWtCard">
                <h2>Current WT</h2>
                <InfoRow
                  label="CT No."
                  value={inspectionIdentifiers.ctNumber}
                />
                <InfoRow
                  label="Shuttle Nr."
                  value={inspectionIdentifiers.shuttleNumber}
                />
                <InfoRow
                  label="Curing Tray Nr."
                  value={inspectionIdentifiers.curingTray}
                />
                <InfoRow
                  label="Oven Nr."
                  value={sample?.metadata.machine || "—"}
                />
                <InfoRow
                  label="EM Tray Nr."
                  value={sample?.metadata.u_index || "—"}
                />
              </div>
              {/* <div className="inspectionMachineActions"><button onClick={()=>loggedIn&&setLoader(true)}><FolderOpen/>Upload dataset</button><button onClick={()=>window.dispatchEvent(new Event('lens-open-customizer'))}><LayoutDashboard/>Layout settings</button></div> */}
            </section>
            <button
              className="inspectionVerticalSplit controlSplit"
              onPointerDown={(e) => beginInspectionResize("control", e)}
              title="Drag to resize installation controls"
            >
              <GripVertical />
            </button>

            <LensViewer
              workstation
              datasetId={datasetId}
              sample={sample}
              channel={channel}
              defects={visibleDefects}
              sharedDefectGeometry={currentResult?.channels.some(item=>/dsm.*halcon|dsm-bv/i.test(item.engine))}
              onChannel={setChannel}
              labels={channelLabels}
              hold={hold}
              onHold={toggleLensHold}
              selectedDefect={selectedDefect}
              onSelectDefect={setSelectedDefect}
              bottomLensOffset={bottomLensOffset}
              onProbe={setProbe}
              onDimensions={onImageDimensions}
              processing={isRunning}
              capacity={wtCapacity}
              availablePositions={wtEntries.map((entry) => entry.position)}
              onPosition={(position) => {
                const entry = wtEntries.find((item) => item.position === position);
                if (entry) void selectHistoryEntry(entry);
              }}
            />
            <button
              className="inspectionVerticalSplit detailsSplit"
              onPointerDown={(e) => beginInspectionResize("details", e)}
              title="Drag to resize current lens details"
            >
              <GripVertical />
            </button>

            <section className="inspectionCurrentPanel">
              <div className="inspectionPanelTitle">
                <h2>Current Lens</h2>
                <div className="lensNav">
                  <button onClick={() => relative(-1)} title="Previous lens">
                    <ChevronLeft />
                  </button>
                  <button onClick={() => relative(1)} title="Next lens">
                    <ChevronRight />
                  </button>
                </div>
              </div>
              <div className="inspectionCurrentFields">
                <InfoRow label="Dataset" value={dataset?.name || "—"} />
                <InfoRow
                  label="Lens ID"
                  value={sample?.metadata.code || sample?.base_name}
                />
                <InfoRow label="CT No." value={inspectionIdentifiers.ctNumber} />
                <InfoRow label="Shuttle Nr." value={inspectionIdentifiers.shuttleNumber} />
                <InfoRow label="Curing Tray Nr." value={inspectionIdentifiers.curingTray} />
                <InfoRow label="Position" value={sample ? `${sample.position} / ${wtCapacity}` : "—"} />
                <InfoRow label="Image channel" value={channelLabels[channel] || channel} />
                <InfoRow
                  label="Result"
                  value={currentResult?.status || "WAITING"}
                  status={currentResult?.status}
                />
                <InfoRow label="Inference time" value={currentInferenceTime} title={inferenceTimingDescription(currentResult)} />
                <InfoRow label="Width Px" value={currentDimension("width_px")} />
                <InfoRow label="Height Px" value={currentDimension("height_px")} />
                <InfoRow label="Camera Count" value={currentMeasurements?.camera_count ?? "—"} />
              </div>
              <div className="inspectionDefectTitle">
                <h3>Detected defects</h3>
                <div>
                  <button
                    className={errorMode === "none" ? "active" : ""}
                    onClick={() => setErrorMode("none")}
                  >
                    None
                  </button>
                  <button
                    className={errorMode === "at" ? "active" : ""}
                    onClick={() => setErrorMode("at")}
                  >
                    AT only
                  </button>
                  <button
                    className={errorMode === "all" ? "active" : ""}
                    onClick={() => setErrorMode("all")}
                  >
                    All
                  </button>
                </div>
              </div>
              <div className="inspectionDefectList">
                {visibleDefects.length ? (
                  visibleDefects.map((d, i) => { const configured = defectSymbol(d.name); return (
                    <button
                      className={i === selectedDefect ? "selected" : ""}
                      key={`${d.name}-${i}`}
                      onClick={() => toggleDefectFocus(i)}
                    >
                      <i className="configuredDefectSymbol" style={{ backgroundColor: configured.color }}>{configured.symbol}</i>
                      <span>
                        <b>{d.name}</b>
                        <small>
                          {defectLocationLabel(d) ||
                            `${Math.round(d.confidence * 100)}% confidence`}
                        </small>
                      </span>
                    </button>
                  )})
                ) : (
                  <div className="inspectionNoDefect">
                    <CircleAlert />
                    No visible defects
                  </div>
                )}
              </div>
              <SelectedDefectDetails defect={visibleDefects[selectedDefect]} elapsed={currentInferenceTime}/>
              {/* <div className="inspectionDetailBox">
                <small>Defect details</small>
                <p>
                  {visibleDefects[selectedDefect]?.name
                    ? `${visibleDefects[selectedDefect].name} detected on ${channelLabels[visibleDefects[selectedDefect].channel || channel] || channel}.`
                    : "Select a detected defect to inspect its details."}
                </p>
              </div> */}
              <div className="inspectionLensActions">
                <button onClick={snap} disabled={!sample || snapshotBusy}>
                  <Camera />
                  Lens snapshot
                </button>
                <button onClick={inspectSelected} disabled={!sample || busy}>
                  <Target />
                  Inspect selected
                </button>
              </div>
            </section>

            <button
              className="inspectionHorizontalSplit"
              onPointerDown={beginBottomResize}
              title="Drag to resize the bottom workspace"
            >
              <GripHorizontal />
            </button>
            <section className="inspectionLogPanel">
              <div className="inspectionLogTabs">
                <button
                  className={inspectionBottomTab === "messages" ? "active" : ""}
                  onClick={() => setInspectionBottomTab("messages")}
                >
                  System messages
                </button>
                <button
                  className={inspectionBottomTab === "wt" ? "active" : ""}
                  onClick={() => setInspectionBottomTab("wt")}
                >
                  WT View
                </button>
                <button
                  className={inspectionBottomTab === "trend" ? "active" : ""}
                  onClick={() => setInspectionBottomTab("trend")}
                >
                  Trend statistics
                </button>
                <button disabled={!loggedIn} className={inspectionBottomTab === "trend-line" ? "active" : ""} onClick={() => setInspectionBottomTab("trend-line")}>Trend Line</button>
                <span />
                {inspectionBottomTab === "wt" && (
                  <div className="inspectionWtTabMeta">
                    <b>
                      {sample?.metadata.io_code ||
                        `WT-${String(trayGlobalWt).padStart(4, "0")}`}
                    </b>
                    <small>
                      {channelLabels[channel] || channel.toUpperCase()} · {wtCapacity}
                      positions
                    </small>
                    <em>
                      {wtChannelImages.filter((item) => item.image).length}{" "}
                      images
                    </em>
                    {/* <div className="inspectionWtToggle">
                      <button
                        className={wtViewMode === "images" ? "active" : ""}
                        onClick={() => setWtViewMode("images")}
                      >
                        Images
                      </button>
                      <button
                        className={wtViewMode === "names" ? "active" : ""}
                        onClick={() => setWtViewMode("names")}
                      >
                        Names
                      </button>
                    </div> */}
                  </div>
                )}
                {inspectionBottomTab === "messages" && (
                  <>
                    <button
                      className={logFilter === "all" ? "filterActive" : ""}
                      onClick={() => setLogFilter("all")}
                    >
                      All
                    </button>
                    <button
                      className={logFilter === "warning" ? "filterActive" : ""}
                      onClick={() => setLogFilter("warning")}
                    >
                      Warnings
                    </button>
                    <button
                      className={logFilter === "error" ? "filterActive" : ""}
                      onClick={() => setLogFilter("error")}
                    >
                      Errors
                    </button>
                  </>
                )}
              </div>
              {inspectionBottomTab === "messages" && (
                <div className="inspectionLogRows referenceMessageRows">
                  {logsError&&<div className="systemMessageNotice" role="status">Messages connection: {logsError}</div>}
                  {!filteredLogs.length&&<div className="systemMessageNotice">{job?`Inspection ${job.status} · ${job.completed} / ${job.total} lenses${job.error?` · ${job.error}`:''}`:logFilter==='all'?'No system messages yet. New backend messages appear automatically.':'No messages match this filter.'}</div>}
                  {filteredLogs.map((l, i) => (
                    <div className={l.level} key={`${l.time}-${i}`}>
                      <time>{l.time.includes("T") ? new Date(l.time).toLocaleTimeString() : l.time}</time>
                      <small >{l.level} {l.message} </small>
                      {/* <span>{l.message}</span> */}
                    </div>
                  ))}
                </div>
              )}
              {inspectionBottomTab === "wt" && (
                <div className="inspectionWtView">
                  <div className={`inspectionWtGallery ${wtViewMode}`} style={{'--wt-grid-columns': String(Math.ceil(wtCapacity / 2)), '--wt-touch-width': `${Math.ceil(wtCapacity / 2) * 82}px`} as React.CSSProperties}>
                    {wtChannelImages.map((item) => {
                      const status = item.result?.status || "IDLE",
                        firstDefect = item.result?.defects?.[0],
                        assignedOutcome = firstDefect ? defectDefinition(firstDefect.name)?.outcome : undefined,
                        displayStatus:Status = assignedOutcome || status,
                        uniqueDefects = uniqueDefectNames(item.result?.defects?.map(defect => defect.name) || []),
                        // Keep WT View aligned with WT History: a real defect
                        // uses its configured legend symbol instead of generic NOK.
                        configuredStatus = firstDefect ? defectSymbol(firstDefect.name) : statusSymbol(status),
                        tone =
                          displayStatus === "OK"
                            ? "ok"
                            : displayStatus === "NOK"
                              ? "nok"
                              : displayStatus === "WARN"
                                ? "warn"
                                : "idle",
                        resultLabel = wtResultLabel(displayStatus, uniqueDefects),
                        resultTitle = displayStatus === "OK" ? "Inspection OK" : displayStatus === "IDLE" ? "Not inspected" : uniqueDefects.length ? `${displayStatus}: ${uniqueDefects.join(", ")}` : displayStatus,
                        defectCodes = uniqueDefects.map(defectInitials).filter(Boolean).join(", ");
                      return (
                        <button
                          key={`${item.position}-${item.channel}`}
                          className={`${item.sample?.id === current ? "selected" : ""} ${!item.image ? "missing" : ""} ${tone}`}
                          style={{ "--legend-color": configuredStatus.color } as React.CSSProperties}
                          onClick={() => {
                            if (item.sample && item.entry) {
                              void selectHistoryEntry(item.entry);
                              setChannel(item.channel);
                            }
                          }}
                          disabled={!item.sample}
                          title={`${item.name} · ${item.defect}`}
                        >
                          {wtViewMode === "images" ? (
                            <div className="inspectionWtSquare">
                                {item.src ? (
                                  <img src={item.src} decoding="async" loading="eager" draggable={false} alt={item.name} />
                                ) : (
                                  <span className="inspectionMissingImage">
                                    No image
                                  </span>
                                )}
                                <b>P{item.position}</b>
                                <i
                                  className={`wtStatusDot ${tone} configuredWtStatus`}
                                  style={{ "--legend-color": configuredStatus.color } as React.CSSProperties}
                                  title={configuredStatus.label}
                                >{configuredStatus.symbol}</i>
                                <em className="wtStatusChip" title={resultTitle}>{displayStatus === "IDLE" ? "Pending" : displayStatus}</em>
                                {defectCodes && <em className="wtDefectChip" title={resultTitle}>{defectCodes}</em>}
                              </div>
                          ) : (
                            <div className="inspectionNameOnly">
                              <b>P{item.position}</b>
                              <span>{item.name}</span>
                              <small>
                                {resultLabel}
                              </small>
                              <i className={`wtStatusDot ${tone} configuredWtStatus`} style={{ "--legend-color": configuredStatus.color } as React.CSSProperties}>{configuredStatus.symbol}</i>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {inspectionBottomTab === "trend" && (
                <div className="inspectionTrendView">
                  <div className="inspectionTrendChart">
                    <TrendChart results={yieldResults} capacity={wtCapacity} />
                  </div>
                  <div className="inspectionTrendStats yieldOnly">
                    <div className="inspectionYieldRing" style={{"--yield":`${displayYield*3.6}deg`} as React.CSSProperties}>
                      <span><b>{displayYield.toFixed(1)}%</b><small>Yield</small></span>
                    </div>
                  </div>
                </div>
              )}
              {inspectionBottomTab === "trend-line" && <TrendLineWorkspace history={globalHistory} liveDefects results={yieldResults} capacity={wtCapacity} legend={statusLegend} trayLabels={trendTrayLabels} liveResultAt={sharedInspection?.results.at(-1)?.created_at} running={job?.status==='running'||job?.status==='queued'}/>}
            </section>
          </div>
        </div>

        <div className="inspectionStatusBar">
          <span>
            Current user: <b>{info?.session.username || "NoUser"}</b>
          </span>
          <span>
            Version: <b>{info?.version || "1.0.0"}</b>
          </span>
          <span>
            Last inspection:{" "}
            <b>{lastInspectionLabel}</b>
          </span>
          <span title={INFERENCE_TIMING_DESCRIPTION}>
            HALCON inference: <b>{currentInferenceTime}</b>
          </span>
          <em>{statusNow ? `${statusNow.toLocaleDateString()} · ${statusNow.toLocaleTimeString()}` : '—'}</em>
        </div>
        {loginOpen && (
          <div
            className="loginModalBackdrop"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setLoginOpen(false);
            }}
          >
            <section
              className={`loginModal authMode-${loginView}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="login-title"
            >
              <div className="loginModalBrand">
                <div className="loginEmblem emageLoginEmblem">
                  <img src="/brand/emage-mark.png" alt="Emage Group" />
                </div>
                <span>
                  <small>EMAGE GROUP · SECURE ACCESS</small>
                  <h2 id="login-title">{loginView==="create"?"Create a new user":"Sign in or switch user"}</h2>
                  <p>
                    {loginView==="create"?"Add a secure account for this inspection workstation.":"Enter the account credentials for the next workstation user."}
                  </p>
                </span>
                <button
                  onClick={() => setLoginOpen(false)}
                  aria-label="Close login"
                >
                  ×
                </button>
              </div>
              {info?.session.role==="Administrator"&&<div className="authModeSwitch" role="tablist" aria-label="Authentication mode">
                <button role="tab" aria-selected={loginView==="login"} className={loginView==="login"?"active":""} onClick={()=>{setLoginError("");setLoginView("login")}}><i>↪</i><span><b>Sign in</b><small>Switch workstation user</small></span></button>
                <button role="tab" aria-selected={loginView==="create"} className={loginView==="create"?"active":""} onClick={()=>{setLoginError("");setLoginView("create")}}><i>＋</i><span><b>Create account</b><small>Add an authorized user</small></span></button>
              </div>}
              <div className="loginCurrent">
                <span><i/>Current session</span><b>{info?.session.username || "NoUser"}</b><em>{info?.session.role || "NoUser"}</em>
              </div>
              {loginView==="login"?<div className="loginFields">
                <label><span>User name</span><input autoFocus autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={loginUser} onChange={(e)=>setLoginUser(e.target.value)} placeholder="Enter user name" onKeyDown={(e)=>{if(e.key==="Enter")void switchUser()}}/></label>
                <label><span>Password</span><input type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" value={loginPassword} onChange={(e)=>setLoginPassword(e.target.value)} placeholder="Enter password" onKeyDown={(e)=>{if(e.key==="Enter")void switchUser()}}/></label>
                <div className="loginAccessInfo"><div><span><i/>Workstation access</span><b>Protected local session</b></div><section><span><small>Production line</small><b>{info?.settings.line_name||"—"}</b></span><span><small>Inspection station</small><b>{info?.settings.station_name||"—"}</b></span><span><small>Access policy</small><b>Role controlled</b></span></section><p>Signing in changes the active operator and records the event in the system audit log.</p></div>
              </div>:<div className="loginFields createUserFields">
                <label><span>New user name</span><input autoFocus autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={newUsername} onChange={(e)=>setNewUsername(e.target.value)} placeholder="Minimum 3 characters"/></label>
                <label className="rolePicker"><span>Production role</span><div><button className={newUserRole==="Operator"?"selected":""} onClick={()=>setNewUserRole("Operator")}><i>OP</i><b>Operator</b><small>Production operation</small></button><button className={newUserRole==="Tester"?"selected":""} onClick={()=>setNewUserRole("Tester")}><i>TS</i><b>Tester</b><small>Quality validation</small></button></div></label>
                <label><span>Password</span><input type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} placeholder="Create a strong password"/></label>
                <label><span>Confirm password</span><input type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" value={newPasswordConfirm} onChange={(e)=>setNewPasswordConfirm(e.target.value)} placeholder="Repeat password" onKeyDown={(e)=>{if(e.key==="Enter")void createApplicationUser()}}/></label>
                <div className="passwordGuide"><i className={passwordChecks(newPassword).length?"valid":""}/><span>At least 8 characters</span><i className={passwordChecks(newPassword).uppercase?"valid":""}/><span>One uppercase letter</span><i className={passwordChecks(newPassword).lowercase?"valid":""}/><span>One lowercase letter</span><i className={passwordChecks(newPassword).number?"valid":""}/><span>One number</span><i className={passwordChecks(newPassword).special?"valid":""}/><span>One special symbol</span><i className={newPasswordConfirm.length>0&&newPassword===newPasswordConfirm?"valid":""}/><span>Passwords match</span></div>
              </div>}
              {loginError && <p className="loginError">{loginError}</p>}
              {loginView==="login"?<div className="loginActions">
                <button onClick={()=>setLoginOpen(false)}>Cancel</button>
                <button className="primary" onClick={switchUser} disabled={busy||!loginUser.trim()||!loginPassword}>{busy?"Signing in…":"Apply user"}</button>
              </div>:<div className="loginActions">
                <button onClick={()=>{setLoginError("");setLoginView("login")}}>Back to sign in</button>
                <button className="primary" onClick={createApplicationUser} disabled={busy||newUsername.trim().length<3||!isStrongPassword(newPassword)||!newPasswordConfirm}>{busy?"Creating…":"Create user"}</button>
              </div>}
              <footer>{loginView==="create"?"Administrator approval · accounts can be Operator or Tester only.":"Session changes are recorded in the system log."}</footer>
            </section>
          </div>
        )}
        {toast && (
          <button className="toast oakToast" onClick={() => setToast("")}>
            <TriangleAlert />
            {toast}
          </button>
        )}
        <DatasetLoader
          open={loader}
          onClose={() => setLoader(false)}
          onLoaded={(id) => { void handleLotLoaded(id) }}
        />
        {trendPopupOpen&&<TrendLineWorkspace history={globalHistory} modal liveDefects initialView="live" onClose={()=>setTrendPopupOpen(false)} results={yieldResults} capacity={wtCapacity} legend={statusLegend} trayLabels={trendTrayLabels} liveResultAt={sharedInspection?.results.at(-1)?.created_at} running={job?.status==='running'||job?.status==='queued'}/>}
      </div>
    );

  return (
    <div
      className={`premiumDashboardPage oakWorkstationPage modernDashboardPage ${focusMode ? "focusMode" : ""}`}
    >
      <TopBar
        workstation
        info={info}
        operationMode={operationMode}
        modeBusy={modeBusy}
        onOperationMode={() => changeOperationMode()}
        onRefresh={refreshSystem}
        onUpload={() => loggedIn&&setLoader(true)}
        onLayout={() => window.dispatchEvent(new Event("lens-open-customizer"))}
        stats={
          prefs.showKpis
            ? {
              yieldPct: displayYield,
              total: samples.length,
              nokRate: displayNok,
              evaluated: results.length,
            }
            : undefined
        }
      />
      <div
        className={`oakCommandDeck ${prefs.showCommandBar ? "visible" : ""}`}
      >
        <div className="oakSourceControl">
          <FolderOpen />
          <span>
            <small>SOURCE</small>
            <b>Unified WT stream · {globalHistory.length} lenses</b>
          </span>
          <button onClick={() => loggedIn&&setLoader(true)} title="Load image folder">
            Load
          </button>
          <button onClick={() => refreshDatasets()} title="Refresh datasets">
            <RefreshCw />
          </button>
          <button
            className={`oakStorageState ${storage?.active ? "active" : ""}`}
            onClick={toggleStorage}
            title={storage?.active||storage?.schedule_key ? "Stop image storage" : "Start image storage"}
          >
            <Camera />
            <span>{storage?.active ? "Recording" : storage?.schedule_key?"Scheduled":"Storage"}</span>
          </button>
        </div>
        <div className="oakDeckGroup oakModuleToggles" aria-label="Dashboard modules" inert={!bottomLayoutEditing}>
          <button
            className={prefs.showHistory ? "active" : ""}
            onClick={() => patch({ showHistory: !prefs.showHistory })}
            title="Show/hide WT History"
          >
            {prefs.showHistory ? <Eye /> : <EyeOff />}
            <span>History</span>
          </button>
          <button
            className={prefs.showDetails ? "active" : ""}
            onClick={() => patch({ showDetails: !prefs.showDetails })}
            title="Show/hide Current Lens"
          >
            {prefs.showDetails ? <Eye /> : <EyeOff />}
            <span>Details</span>
          </button>
          <button
            className={prefs.showTray ? "active" : ""}
            onClick={() => patch({ showTray: !prefs.showTray })}
            title="Show/hide Current WT"
          >
            <Columns3 />
            <span>WT Strip</span>
          </button>
          <button
            className={prefs.showWorkspace ? "active" : ""}
            onClick={() => patch({ showWorkspace: !prefs.showWorkspace })}
            title="Show/hide bottom workspace"
          >
            <LayoutDashboard />
            <span>Workspace</span>
          </button>
        </div>
        <div className="oakDeckGroup oakDeckRight" inert={!bottomLayoutEditing}>
          <div className="oakDensity">
            <button
              className={prefs.density === "compact" ? "active" : ""}
              onClick={() => patch({ density: "compact" })}
            >
              Compact
            </button>
            <button
              className={prefs.density === "comfortable" ? "active" : ""}
              onClick={() => patch({ density: "comfortable" })}
            >
              Normal
            </button>
          </div>
          <button
            className={`oakFocusButton ${focusMode ? "active" : ""}`}
            onClick={() => setFocusMode((v) => !v)}
          >
            {focusMode ? <Minimize2 /> : <Maximize2 />}
            <span>{focusMode ? "Restore" : "Focus"}</span>
          </button>
          <button onClick={resetLayout} title="Reset dashboard layout">
            <RotateCcw />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div
        className={`oakDashboardViewport ${!showTray ? "withoutTray" : ""} ${!showWorkspace ? "withoutWorkspace" : ""}`}
      >
        <div
          className={`dashboardGrid productionDashboard premiumMainSurface oakMainGrid ${layoutClass}`}
        >
          {showHistory && (
            <StatusMatrix
              samples={samples}
              results={resultMap}
              current={current}
              currentDatasetId={datasetId}
              onPick={select}
              history={visibleGlobalHistory}
              onHistoryPick={(entry) => { void selectHistoryEntry(entry) }}
              onClearHistory={info?.session.role === "Administrator" ? () => { void clearInspectionHistory(); } : undefined}
              onArchive={async (wt) => {
                try {
                  const r = await api.archiveRing(datasetId, wt);
                  setToast(`WT ${wt} archived · ${r.images} images`);
                } catch (e) {
                  setToast((e as Error).message);
                }
              }}
              capacity={wtCapacity}
              legend={statusLegend}
              customDefectIcons={customDefectIcons}
            />
          )}
          {showHistory && (
            <button
              className="oakSplit"
              onPointerDown={(e) => beginResize("history", e)}
              title="Drag to resize history and viewer"
            >
              <GripVertical />
            </button>
          )}
          <LensViewer
            workstation
            datasetId={datasetId}
            sample={sample}
            channel={channel}
            defects={visibleDefects}
            sharedDefectGeometry={currentResult?.channels.some(item=>/dsm.*halcon|dsm-bv/i.test(item.engine))}
            onChannel={setChannel}
            labels={channelLabels}
            hold={hold}
            onHold={toggleLensHold}
            selectedDefect={selectedDefect}
            onSelectDefect={setSelectedDefect}
            bottomLensOffset={bottomLensOffset}
            onProbe={setProbe}
            onDimensions={onImageDimensions}
            processing={job?.status === "running"}
            capacity={wtCapacity}
            availablePositions={wtEntries.map((entry) => entry.position)}
            onPosition={(position) => {
              const entry = wtEntries.find((item) => item.position === position);
              if (entry) void selectHistoryEntry(entry);
            }}
          />
          {showDetails && (
            <button
              className="oakSplit"
              onPointerDown={(e) => beginResize("details", e)}
              title="Drag to resize viewer and lens information"
            >
              <GripVertical />
            </button>
          )}
          {showDetails && (
            <section className="glassPanel productionPanel currentLensPanel oakDetailsPanel">
              <div className="oakPanelHead referenceInfoHead">
                <h2>Current Lens Information</h2>
                <div className="lensNav">
                  <button onClick={() => relative(-1)} title="Previous lens">
                    <ChevronLeft />
                  </button>
                  <button onClick={() => relative(1)} title="Next lens">
                    <ChevronRight />
                  </button>
                </div>
              </div>
              <div className="referenceLensInfo">
                <div className="referenceLensData">
                  <InfoRow label="Dataset" value={dataset?.name || "—"} />
                  <InfoRow
                    label="Lens ID"
                    value={sample?.metadata.code || sample?.base_name}
                  />
                  <InfoRow
                    label="CT No."
                    value={inspectionIdentifiers.ctNumber}
                  />
                  <InfoRow label="Shuttle Nr." value={inspectionIdentifiers.shuttleNumber} />
                  <InfoRow label="Curing Tray Nr." value={inspectionIdentifiers.curingTray} />
                  <InfoRow
                    label="Position"
                    value={sample ? `${sample.position} / ${wtCapacity}` : "—"}
                  />
                  <InfoRow label="Image channel" value={channelLabels[channel] || channel} />
                  <InfoRow
                    label="Result"
                    value={currentResult?.status || "WAITING"}
                    status={currentResult?.status}
                  />
                  <InfoRow label="Inference time" value={currentInferenceTime} title={inferenceTimingDescription(currentResult)} />
                  <InfoRow label="Width Px" value={currentDimension("width_px")} />
                  <InfoRow label="Height Px" value={currentDimension("height_px")} />
                  <InfoRow label="Camera Count" value={currentMeasurements?.camera_count ?? "—"} />
                </div>
                <div className="referenceLensPreview">
                  <div className="referencePreviewImage">
                    {detailPreviewSrc ? (
                      <img src={detailPreviewSrc} draggable={false} alt="Current lens" />
                    ) : null}
                  </div>
                  <button
                    className="primary"
                    onClick={inspectSelected}
                    disabled={!sample || busy}
                  >
                    <Target />
                    Open in Viewer
                  </button>
                  <button onClick={snap} disabled={!sample || snapshotBusy}>
                    <Camera />
                    Capture Image
                  </button>
                  <button onClick={archiveCurrentWt} disabled={!sample}>
                    <FolderArchive />
                    Archive Lens
                  </button>
                  <button
                    onClick={() => setToast("Lens marked for operator review")}
                    disabled={!sample}
                  >
                    <Flag />
                    Mark for Review
                  </button>
                </div>
              </div>
              <div className="oakDefectHead">
                <h3>Detected Defects ({visibleDefects.length})</h3>
                <div className="compactFilter" aria-label="Defect visibility">
                  <button className={errorMode === "none" ? "active" : ""} onClick={() => setErrorMode("none")}>None</button>
                  <button className={errorMode === "at" ? "active" : ""} onClick={() => setErrorMode("at")}>AT only</button>
                  <button className={errorMode === "all" ? "active" : ""} onClick={() => setErrorMode("all")}>All</button>
                </div>
              </div>
              <div className="defectList productionDefectList oakDefectList">
                {visibleDefects.length ? (
                  visibleDefects.map((d, i) => { const configured = defectSymbol(d.name); return (
                    <button
                      className={
                        i === selectedDefect
                          ? "defectItem selected"
                          : "defectItem"
                      }
                      key={`${d.name}-${i}`}
                      onClick={() => toggleDefectFocus(i)}
                    >
                      <i className="configuredDefectSymbol" style={{ backgroundColor: configured.color }}>{configured.symbol}</i>
                      <span>
                        <b>{d.name}</b>
                        <small>
                          {defectLocationLabel(d) ||
                            `${d.tolerance || "AT"} · ${(d.confidence * 100).toFixed(1)}%`}
                        </small>
                      </span>
                      <em className="configuredDefectTag" style={{ backgroundColor: configured.color }}>{configured.label}</em>
                    </button>
                  )})
                ) : (
                  <div className="emptyState">
                    <CircleAlert />
                    No visible defects
                  </div>
                )}
              </div>
              <SelectedDefectDetails defect={visibleDefects[selectedDefect]} elapsed={currentInferenceTime}/>
            </section>
          )}
        </div>

        {showTray && (
          <section className="oakTraySurface">

            {showLegend && (
              <div className="modernLegendPopover">
                <div className="inspectionLegendHead"><span><b>Status symbols</b><small>Inspection and HALCON results</small></span><button onClick={() => setShowLegend(false)}>×</button></div>
                <div className="inspectionLegendGrid configuredLegendGrid">
                  {(["OK", "NOK", "WARN", "IDLE"] as Status[]).map((status) => { const item = statusSymbol(status); return <span key={item.key}><i style={{ backgroundColor: item.color }}>{item.symbol}</i>{item.label}</span> })}
                  {(statusLegend?.defects || []).map((item) => <span key={item.key}><i style={{ backgroundColor: item.color }}>{item.symbol}</i>{item.label}</span>)}
                </div>
              </div>
            )}
            <div className="oakTrayStrip">
              {wtChannelImages.map((item, i) => {
                const s = item.sample;
                if (!s || !item.image)
                  return (
                    <div key={i} className="oakTrayCell empty">
                      <b>{i + 1}</b>
                      <i />
                    </div>
                  );
                const r = item.result,
                  rawStatus:Status = r?.status || "IDLE",
                  firstDefect = r?.defects?.[0],
                  assignedOutcome = firstDefect ? defectDefinition(firstDefect.name)?.outcome : undefined,
                  displayStatus:Status = assignedOutcome || rawStatus,
                  configuredStatus = firstDefect ? defectSymbol(firstDefect.name) : statusSymbol(displayStatus),
                  defectNames = uniqueDefectNames(r?.defects?.map(defect=>defect.name)||[]),
                  defectCodes = defectNames.map(defectInitials).filter(Boolean).join(", "),
                  src = item.src;
                return (
                  <button
                    className={`oakTrayCell ${displayStatus.toLowerCase()} ${s.id === current ? "selected" : ""}`}
                    key={`${item.entry?.datasetId}-${s.id}`}
                    onClick={() => { if (item.entry) selectHistoryEntry(item.entry); }}
                    title={`Position ${s.position} · ${firstDefect?.name || configuredStatus.label}`}
                    style={{"--legend-color":configuredStatus.color} as React.CSSProperties}
                  >
                    <b>P{s.position}</b>
                    <img src={src} decoding="async" loading="eager" draggable={false} alt={`Lens position ${s.position}`} />
                    <i className="oakTrayStatusIcon" aria-label={configuredStatus.label} title={configuredStatus.label}/>
                    <em className="oakTrayStatus" title={configuredStatus.label}>{displayStatus === "IDLE" ? "Pending" : displayStatus}</em>
                    {defectCodes&&<em className="oakTrayDefect" title={defectNames.join(", ")}>{defectCodes}</em>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {showWorkspace && (
          <button
            className="oakHorizontalSplit"
            onPointerDown={beginBottomResize}
            title="Drag to resize bottom workspace"
          >
            <GripHorizontal />
          </button>
        )}
        {showWorkspace && (
          <section className={`oakBottomWorkspace referenceBottomWorkspace ${bottomLayoutEditing ? "bottomAdjustable" : ""} ${modernTrendTab==='line'?'hasTrendLine':''}`}>
            {prefs.showTrend && (
              <div className={`referenceBottomPanel referenceTrendPanel ${modernTrendTab==='line'?'hasTrendLine':''}`} aria-label="Yield and trend" style={{flexGrow:prefs.trendWidth}}>
                <div className="referencePanelTabs trendOuterTabs" aria-label="Trend views">
                  <button className={modernTrendTab==='statistics'?'active':''} onClick={()=>setModernTrendTab('statistics')}>Yield Trend</button>
                  <button disabled={!loggedIn} className={modernTrendTab==='line'?'active':''} onClick={()=>{setModernTrendTab('line');setTrendInitialView(undefined)}}>Trend Line</button>
                  <button disabled={!loggedIn} className="trendShortcut" onClick={()=>{setModernTrendTab('line');setTrendInitialView('defects')}}>Defect Types</button>
                  <button disabled={!loggedIn} className="trendShortcut" onClick={()=>{setModernTrendTab('line');setTrendInitialView('3d')}}>3D Trays</button>
                </div>
                {modernTrendTab==='line'?<TrendLineWorkspace history={globalHistory} results={yieldResults} capacity={wtCapacity} legend={statusLegend} trayLabels={trendTrayLabels} initialView={trendInitialView} liveResultAt={sharedInspection?.results.at(-1)?.created_at} running={job?.status==='running'||job?.status==='queued'}/>:<div className="referenceTrendBody">
                  <TrendChart results={yieldResults} capacity={wtCapacity} />
                  <div className="referenceTrendKpis">
                    <div className="miniYieldRing">
                      <i
                        style={
                          {
                            "--yield": `${displayYield * 3.6}deg`,
                          } as React.CSSProperties
                        }
                      />
                      <span>
                        <b>{displayYield.toFixed(1)}%</b>
                        <small>WT Yield</small>
                      </span>
                    </div>
                    <div>
                      <b className="dangerText">{displayNok.toFixed(1)}%</b>
                      <small>NOK Rate (Today)</small>
                    </div>
                    <div>
                      <b>
                        {samples.length.toLocaleString()}
                      </b>
                      <small>Total Lenses (Today)</small>
                    </div>
                  </div>
                </div>}
              </div>
            )}
            {bottomLayoutEditing && prefs.showTrend && (prefs.showLogs || prefs.showActions) && (
              <button
                className="bottomSectionSplit"
                onPointerDown={(event)=>beginBottomSectionResize("trendWidth",prefs.showLogs?"logsWidth":"actionsWidth",event)}
                title="Drag to resize bottom sections"
                aria-label="Resize yield and adjacent section"
              ><GripVertical/></button>
            )}
            {prefs.showLogs && (
              <div className="referenceBottomPanel referenceLogsPanel" aria-label="System logs" style={{flexGrow:prefs.logsWidth}}>
                <div className="referencePanelTabs" aria-label="System log filters">
                  <button
                    className={logFilter==='all'?'active':''}
                    onClick={() => setLogFilter("all")}
                  >
                    All
                  </button>
                  <button className={logFilter==='warning'?'active':''} onClick={() => setLogFilter("warning")}>
                    Warnings
                  </button>
                  <button className={logFilter==='error'?'active':''} onClick={() => setLogFilter("error")}>Errors</button>
                  <button className={logFilter==='system'?'active':''} onClick={() => setLogFilter("system")}>System</button>
                </div>
                <div className="referenceLogs">
                  {logsError&&<div className="systemMessageNotice" role="status">Messages connection: {logsError}</div>}
                  {!filteredLogs.length&&<div className="systemMessageNotice">{job?`Inspection ${job.status} · ${job.completed} / ${job.total} lenses${job.error?` · ${job.error}`:''}`:'No matching messages. Backend messages refresh automatically.'}</div>}
                  {filteredLogs.slice(0, 16).map((l, i) => (
                    <div key={`${l.time}-${i}`}>
                      <time>
                        {l.time.includes("T")
                          ? new Date(l.time).toLocaleTimeString()
                          : l.time}
                      </time>
                      <b className={`inspectionLogLevel ${l.level.toLowerCase()}`}>{l.level}</b>
                      <span>{l.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bottomLayoutEditing && prefs.showLogs && prefs.showActions && (
              <button
                className="bottomSectionSplit"
                onPointerDown={(event)=>beginBottomSectionResize("logsWidth","actionsWidth",event)}
                title="Drag to resize bottom sections"
                aria-label="Resize logs and quick actions"
              ><GripVertical/></button>
            )}
            {prefs.showActions && (
              <div className="referenceBottomPanel referenceActionsPanel" aria-label="Quick actions" style={{flexGrow:prefs.actionsWidth}}>
                <div className="referenceActions inspectionControlPanel">
                  <div className="inspectionOverviewChart">
                    <div className="inspectionOverviewHead">
                      <span><small>OVERALL INSPECTION</small><b>Status distribution</b></span>
                      <div className="inspectionOverviewStats">
                        <span><b>{results.length}</b><small>Inspected</small></span>
                        <span><b>{totalDefects}</b><small>Defects</small></span>
                        <span title={`${formatInferenceMs(averageCycleMs)} per lens. ${INFERENCE_TIMING_DESCRIPTION}`}><b>{formatInferenceMs(averageCycleMs)}</b><small>Avg inference</small></span>
                      </div>
                    </div>
                    <div className="inspectionStackedBar" aria-label={`OK ${okRate.toFixed(1)}%, NOK ${nokRate.toFixed(1)}%, warning ${warnRate.toFixed(1)}%`}>
                      <i className="ok" style={{width:`${okRate}%`}}/>
                      <i className="nok" style={{width:`${nokRate}%`}}/>
                      <i className="warn" style={{width:`${warnRate}%`}}/>
                    </div>
                    <div className="inspectionBarRows">
                      <div className="ok"><span><i/>OK <b>{counts.OK}</b></span><em><i style={{width:`${okRate}%`}}/></em><strong>{okRate.toFixed(1)}%</strong></div>
                      <div className="nok"><span><i/>NOK <b>{counts.NOK}</b></span><em><i style={{width:`${nokRate}%`}}/></em><strong>{nokRate.toFixed(1)}%</strong></div>
                      <div className="warn"><span><i/>Warning <b>{counts.WARN}</b></span><em><i style={{width:`${warnRate}%`}}/></em><strong>{warnRate.toFixed(1)}%</strong></div>
                    </div>
                    <div className="inspectionRuntimeFacts">
                      <span><small>Batch</small><b>{results.length}/{samples.length || 0}</b></span>
                      <span><small>Active WT</small><b>{sample ? `WT-${String(sample.wt_index).padStart(2,"0")}` : "—"}</b></span>
                      <span><small>Channel</small><b>{currentPreviewChannel.toUpperCase()}</b></span>
                      <span><small>Mode</small><b>{operationMode}</b></span>
                    </div>
                    <div className="inspectionConnections" aria-label="Inspection system connections">
                      <span className="offline" title="Camera connectivity is not reported by the current backend"><i/><b>Camera</b><small>Not reported</small></span>
                      <span className="offline" title="PLC connectivity is not reported by the current backend"><i/><b>PLC</b><small>Not reported</small></span>
                      <span className={info ? "online" : "offline"}><i/><b>Database</b><small>{info ? "Active" : "Offline"}</small></span>
                      <span className={halconOnline ? "online" : "offline"}><i/><b>HALCON</b><small>{halconOnline ? "Ready" : "Offline"}</small></span>
                    </div>
                  </div>
                  <div className="inspectionPrimaryActions">
                  <button
                    className="closeApplication primaryCommand"
                    disabled={!loggedIn}
                    onClick={closeApplication}
                  >
                    <Power />
                    <span>Close Application</span>
                  </button>
                  <button
                    className="stop commandIcon"
                    onClick={stop}
                    disabled={
                      !job || !["queued", "running"].includes(job.status)
                    }
                    title="Stop inspection"
                    aria-label="Stop inspection"
                  >
                    <Square />
                  </button>
                  <button className={`commandIcon ${hold ? "active" : ""}`} onClick={toggleLensHold} title={hold ? "Resume live view" : "Pause live view"} aria-label={hold ? "Resume live view" : "Pause live view"}>
                    <Pause />
                  </button>
                  <button className={`more commandIcon ${moreActionsOpen ? "active" : ""}`} onClick={() => setMoreActionsOpen(v=>!v)} aria-expanded={moreActionsOpen} title="More inspection actions" aria-label="More inspection actions">
                    <MoreHorizontal />
                  </button>
                  </div>
                  {moreActionsOpen && <div className="inspectionMoreActions">
                  <button onClick={() => {void run();setMoreActionsOpen(false)}} disabled={isRunning || !samples.length}>
                    {isRunning ? <Loader2 className="spin"/> : <Play/>}
                    <span>{isRunning ? "Inspection running" : "Run All"}</span>
                  </button>
                  <button onClick={() => {loggedIn&&setLoader(true);setMoreActionsOpen(false)}}>
                    <FolderOpen />
                    <span>Upload Folder</span>
                  </button>
                  <button onClick={() => setToast("Recipe setup selected")}>
                    <Target />
                    <span>Recipe Setup</span>
                  </button>
                  <button className="adminLayoutAction"
                    onClick={() =>
                      window.dispatchEvent(new Event("lens-open-customizer"))
                    }
                  >
                    <RefreshCw />
                    <span>Adjust Layout</span>
                  </button>
                  <button onClick={archiveCurrentWt}>
                    <Archive />
                    <span>Archive / Export</span>
                  </button>
                  <button onClick={() => setFocusMode((v) => !v)}>
                    <Columns3 />
                    <span>WT View</span>
                  </button>
                  <button onClick={() => setToast("Maintenance tools ready")}>
                    <FolderArchive />
                    <span>Maintenance</span>
                  </button>
                  </div>}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {toast && (
        <button className="toast oakToast" onClick={() => setToast("")}>
          <TriangleAlert />
          {toast}
        </button>
      )}
      <DatasetLoader
        open={loader}
        onClose={() => setLoader(false)}
        onLoaded={(id) => { void handleLotLoaded(id) }}
      />
    </div>
  );
}

function MetaCell({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="premiumMetaCell">
      <small>{label}</small>
      <b title={String(value || "—")}>{value || "—"}</b>
    </div>
  );
}
function Metric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`oakMetric ${tone}`}>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}
function InfoRow({
  label,
  value,
  status,
  title,
}: {
  label: string;
  value?: string | number | null;
  status?: string;
  title?: string;
}) {
  return (
    <div className="referenceInfoRow" title={title}>
      <span>{label}</span>
      {status ? (
        <b className={`referenceResult ${status.toLowerCase()}`}>{status}</b>
      ) : (
        <b>{value || "—"}</b>
      )}
    </div>
  );
}

function SelectedDefectDetails({defect,elapsed}:{defect?:Defect;elapsed:string}){
  if(!defect)return null;
  const size=typeof defect.size_px==='number'&&Number.isFinite(defect.size_px)?`${defect.size_px.toLocaleString(undefined,{maximumFractionDigits:2})} px`:null;
  return <div className="inspectionSelectedDefect" aria-label="Selected defect details">
    <strong>{defect.name}</strong>
    {defect.tolerance&&<span>Tolerance <b>{defect.tolerance}</b></span>}
    {size&&<span>Size <b>{size}</b></span>}
    {defect.position_text&&<span>Position <b>{defect.position_text}</b></span>}
    {elapsed!=='—'&&<span title={INFERENCE_TIMING_DESCRIPTION}>Lens inference <b>{elapsed}</b></span>}
  </div>;
}

function defectLocationLabel(defect: {position_text?:string;bbox_xywh_norm?:number[]}) {
  const base = defect.position_text || "";
  if (!defect.bbox_xywh_norm || defect.bbox_xywh_norm.length < 4) return base;
  const [x, y, width, height] = defect.bbox_xywh_norm;
  const dx = x + width / 2 - .5, dy = y + height / 2 - .5;
  const centered = Math.hypot(dx, dy) < .12;
  const tooLarge = width > .35 || height > .35 || width * height > .12;
  if (centered || tooLarge) return base.replace(/\s*\(\d+ o'clock\)/i, "");
  if (/o'clock/i.test(base)) return base;
  let hour = Math.round(Math.atan2(dx, -dy) * 6 / Math.PI);
  if (hour <= 0) hour += 12;
  return base ? `${base} (${hour} o'clock)` : `${hour} o'clock`;
}
