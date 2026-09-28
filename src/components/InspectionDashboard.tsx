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
import { api, previewUrl, samplePreviewUrl, WS_API } from "@/lib/api";
import { primePreview } from "@/lib/preview-cache";
import type {
  DatasetSummary,
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
import { useUI } from "./UIProvider";

type WorkspaceTab = "quality" | "activity" | "control";
type InspectionBottomTab = "messages" | "wt" | "trend";
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
  const { prefs, patch, canCustomize } = useUI();
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
  const [loader, setLoader] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [hold, setHold] = useState(false);
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
  const [inspectionBottomTab, setInspectionBottomTab] =
    useState<InspectionBottomTab>("messages");
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
  const [statusNow, setStatusNow] = useState(() => new Date());
  const wsRef = useRef<WebSocket | null>(null);
  const wsLiveRef = useRef(false);
  const wsResultOrdinalRef = useRef(0);
  const runTokenRef = useRef(0);
  const operationModeRef = useRef(operationMode);
  const wtCapacity = info?.settings.wt_capacity || 16;

  useEffect(() => {
    const saved = localStorage.getItem("lens-operation-mode");
    if (saved === "AUTO" || saved === "MANUAL") setOperationMode(saved);
    const query = new URLSearchParams(window.location.search);
    if (query.get("login") === "1") setLoginOpen(true);
    if (query.get("dataset") === "1") setLoader(true);
    if (query.has("login") || query.has("dataset"))
      window.history.replaceState({}, "", window.location.pathname);
  }, []);
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
    if (!datasetId || !samples.length) return;
    for (const candidate of samples) {
      const previewChannel = candidate.images[channel]
        ? channel
        : candidate.images.h
          ? "h"
          : candidate.images.d
            ? "d"
            : Object.keys(candidate.images)[0];
      if (previewChannel && !candidate.images[previewChannel]?.relative_path?.startsWith("demo:")) void primePreview(previewUrl(datasetId, candidate.id, previewChannel)).catch(() => {});
    }
  }, [channel, datasetId, samples]);
  useEffect(() => {
    operationModeRef.current = operationMode;
  }, [operationMode]);
  useEffect(() => {
    const timer = window.setInterval(() => setStatusNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshSystem = useCallback(async () => {
    const [systemResult, storageResult, legendResult] = await Promise.allSettled([
      api.system(), api.storageState(), api.statusSymbolLegend(),
    ]);
    if (systemResult.status === "fulfilled") setInfo(systemResult.value);
    if (storageResult.status === "fulfilled") setStorage(storageResult.value);
    if (legendResult.status === "fulfilled") setStatusLegend(legendResult.value);
  }, []);
  useEffect(()=>{const refresh=()=>{void refreshSystem()};window.addEventListener('lens-system-changed',refresh);return()=>window.removeEventListener('lens-system-changed',refresh)},[refreshSystem]);
  useEffect(()=>{const refresh=()=>{void api.statusSymbolLegend().then(setStatusLegend).catch(()=>{})};const storage=(event:StorageEvent)=>{if(event.key==='lens-status-legend-version')refresh()};window.addEventListener('lens-status-legend-changed',refresh);window.addEventListener('storage',storage);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('lens-status-legend-changed',refresh);window.removeEventListener('storage',storage);window.removeEventListener('focus',refresh)}},[]);
  const changeOperationMode = useCallback(async (next?: "AUTO" | "MANUAL") => {
    const target = next || (operationMode === "AUTO" ? "MANUAL" : "AUTO");
    setOperationMode(target);
    localStorage.setItem("lens-operation-mode", target);
    try {
      await api.setMode(target === "AUTO" ? "AUTO" : "SETUP");
      await refreshSystem();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to change operating mode");
    }
  }, [datasetId, operationMode, refreshSystem]);
  async function rebuildGlobalHistory(allDatasets: DatasetSummary[]) {
    const ordered = [...allDatasets].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const loaded = await Promise.all(ordered.map(async dataset => {
      try {
        const [sampleResponse, resultResponse] = await Promise.all([api.samples(dataset.id), api.results(dataset.id)]);
        const resultBySample = new Map(resultResponse.items.map(result => [result.sample_id, result]));
        return sampleResponse.items
          .sort((a, b) => a.wt_index - b.wt_index || a.position - b.position || a.id.localeCompare(b.id))
          .map(sample => ({ datasetId: dataset.id, sample, result: resultBySample.get(sample.id) }));
      } catch { return [] }
    }));
    const flat = loaded.flat().map((entry, index) => ({ ...entry, wt: Math.floor(index / wtCapacity) + 1, position: index % wtCapacity + 1 }));
    setGlobalHistory(flat);
    const newestWt = flat.length ? Math.ceil(flat.length / wtCapacity) : null;
    setSelectedGlobalWt(currentWt => currentWt && newestWt && currentWt <= newestWt ? currentWt : newestWt);
    return flat;
  }
  useEffect(()=>{if(datasets.length)void rebuildGlobalHistory(datasets)},[wtCapacity]);
  async function refreshDatasets(prefer?: string) {
    try {
      const ds = await api.datasets();
      setDatasets(ds);
      const rebuiltHistory = await rebuildGlobalHistory(ds);
      if (prefer) setSelectedGlobalWt(rebuiltHistory.find(entry => entry.datasetId === prefer)?.wt ?? null);
      const id = prefer || datasetId || ds[0]?.id || "";
      if (id) {
        setDatasetId(id);
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
    runTokenRef.current += 1;
    wsRef.current?.close();
    wsRef.current = null;
    setJob(null);
    setBusy(false);
    try {
      const [s, r] = await Promise.all([api.samples(id), api.results(id)]);
      setSamples(s.items);
      setResults(r.items);
      if (s.items.length) {
        setCurrent((c) =>
          s.items.some((x) => x.id === c) ? c : s.items[0].id,
        );
        const first = s.items[0];
        setChannel(
          first.images.h
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
      setToast(`Dataset load failed: ${(e as Error).message}`);
      setSamples([]); setResults([]); setCurrent(null);
      return [];
    }
  }
  useEffect(() => {
    refreshSystem();
    refreshDatasets();
    api
      .logs()
      .then((x) => {
        if (x.items.length) setLogs(x.items.reverse());
      })
      .catch(() => { });
    return () => {
      runTokenRef.current += 1;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

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
  const defectSymbol = (name: string): StatusSymbol => {
    const normalized = name.toLowerCase();
    return (statusLegend?.defects || []).find((item) =>
      (item.match_terms || []).some((term) => normalized.includes(term.toLowerCase())),
    ) || statusLegend?.fallback_defect || { key: "unknown-defect", label: "NOK", color: statusSymbol("NOK").color, symbol: "i" };
  };
  useEffect(() => {
    if (!datasetId) return;
    setGlobalHistory(previous => previous.map(entry => {
      if (entry.datasetId !== datasetId) return entry;
      const liveResult=resultMap.get(entry.sample.id);
      return {...entry,result:datasetId===liveDatasetId?liveResult:liveResult||entry.result};
    }));
  }, [datasetId, liveDatasetId, resultMap]);
  const sample = useMemo(
    () => samples.find((s) => s.id === current) || null,
    [samples, current],
  );
  const currentResult = current ? resultMap.get(current) : undefined;
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
  const currentChannelResult = currentResult?.channels.find(
    (item) => item.channel === channel,
  ) || currentResult?.channels[0];
  const measurementEntries = Object.entries(
    currentChannelResult?.measurements || {},
  );
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
  const yieldPct = results.length ? (counts.OK / results.length) * 100 : 0;
  const nokRate = results.length ? (counts.NOK / results.length) * 100 : 0;
  const warnRate = results.length ? (counts.WARN / results.length) * 100 : 0;
  const totalDefects = useMemo(() => results.reduce((total, item) => total + (item.defects?.length || 0), 0), [results]);
  const averageCycleMs = useMemo(() => {
    const times = results.flatMap(item => item.channels || []).map(item => item.elapsed_ms).filter(value => Number.isFinite(value) && value >= 0);
    return times.length ? times.reduce((total, value) => total + value, 0) / times.length : 0;
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
  const wtEntries = useMemo(() => globalHistory.filter(entry => entry.wt === activeGlobalWt), [globalHistory, activeGlobalWt]);
  const visibleGlobalHistory = useMemo(() => {
    if (!liveDatasetId) return globalHistory;
    const liveEntries=globalHistory.filter(entry=>entry.datasetId===liveDatasetId);
    if (!liveEntries.length) return globalHistory.filter(entry=>entry.datasetId!==liveDatasetId);
    const firstLiveWt=Math.min(...liveEntries.map(entry=>entry.wt));
    const inferredWts=liveEntries.filter(entry=>resultMap.has(entry.sample.id)).map(entry=>entry.wt);
    const newestStartedWt=inferredWts.length?Math.max(...inferredWts):firstLiveWt;
    return globalHistory.filter(entry=>entry.datasetId!==liveDatasetId||entry.wt<=newestStartedWt);
  },[globalHistory,liveDatasetId,resultMap]);
  const wtSamples = useMemo(() => wtEntries.map(entry => entry.sample), [wtEntries]);
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
          waitingForLiveResult = entry?.datasetId === liveDatasetId && entry.datasetId === datasetId && !result,
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
          src: visibleSample && image && entry ? samplePreviewUrl(entry.datasetId, visibleSample, channel) : "",
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
    ? samplePreviewUrl(datasetId, sample, currentPreviewChannel)
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
  const halconOnline = Boolean(info?.bridge && !/offline|unavailable|none|disconnected/i.test(info.bridge));
  const jobProgress = job?.total
    ? Math.min(100, (job.completed / job.total) * 100)
    : 0;

  function closeApplication() {
    if (!window.confirm("Close DSM BV 4Cam Inspection System?")) return;
    window.close();
    window.setTimeout(() => {
      if (!window.closed) setToast("Your browser prevented this tab from closing. You can close it manually.");
    }, 250);
  }

  async function refreshRunOutputs(did: string) {
    const [r, l, s] = await Promise.allSettled([
      api.results(did),
      api.logs(),
      api.storageState(),
    ]);
    if (r.status === "fulfilled") setResults(r.value.items);
    if (l.status === "fulfilled") setLogs(l.value.items.reverse());
    if (s.status === "fulfilled") setStorage(s.value);
  }

  async function monitorJob(jobId: string, did: string, token: number) {
    let lastCompleted = -1,
      failures = 0;
    while (runTokenRef.current === token) {
      try {
        const latest = await api.job(jobId);
        if (runTokenRef.current !== token) return;
        setJob(latest);
        failures = 0;
        const terminal = ["completed", "failed", "cancelled"].includes(
          latest.status,
        );
        if ((!wsLiveRef.current && latest.completed !== lastCompleted) || terminal) {
          lastCompleted = latest.completed;
          const r = terminal || !wsLiveRef.current ? await api.results(did) : null;
          if (r && runTokenRef.current === token) {
            setResults(r.items);
            const newest = [...r.items].sort((a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            ).at(-1);
            if (operationModeRef.current === "AUTO" && newest) {
              setSelectedGlobalWt(null);
              setCurrent(newest.sample_id);
              setSelectedDefect(-1);
            }
          }
        }
        if (terminal) {
          await refreshRunOutputs(did);
          wsRef.current?.close();
          wsRef.current = null;
          if (latest.status === "completed")
            setToast(
              `Run All completed · ${latest.completed} of ${latest.total} lenses inspected`,
            );
          else if (latest.status === "failed")
            setToast(
              `Inspection failed: ${latest.error || "Unknown processing error"}`,
            );
          else
            setToast(
              `Inspection stopped · ${latest.completed} of ${latest.total} lenses completed`,
            );
          return;
        }
      } catch (e) {
        failures += 1;
        if (failures >= 4) {
          setToast(
            `Unable to read inspection progress: ${(e as Error).message}`,
          );
          return;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    }
  }

  async function run(targetDatasetId = datasetId, targetSampleCount = samples.length) {
    if (!targetDatasetId || isRunning) return;
    if (!targetSampleCount) {
      setToast("This lot contains no supported inspection images.");
      return;
    }
    setBusy(true);
    try {
      const token = runTokenRef.current + 1;
      runTokenRef.current = token;
      wsResultOrdinalRef.current=0;
      wsRef.current?.close();
      const j = await api.run(targetDatasetId);
      setLiveDatasetId(targetDatasetId);
      setResults([]);
      setSelectedGlobalWt(null);
      setJob(j);
      setToast(`Run All started · 0 of ${j.total} lenses`);
      const ws = new WebSocket(`${WS_API}/ws/jobs/${j.id}`);
      wsRef.current = ws;
      ws.onopen=()=>{wsLiveRef.current=true};
      ws.onmessage = async (e) => {
        const m = JSON.parse(e.data);
        if (m.job) setJob(m.job);
        if (m.result) {
          const resultOrdinal=++wsResultOrdinalRef.current;
          const resultSample=samples.find(item=>item.id===m.result.sample_id);
          if(resultSample){const previewChannel=resultSample.images[channel]?channel:resultSample.images.h?"h":resultSample.images.d?"d":Object.keys(resultSample.images)[0];if(previewChannel&&!resultSample.images[previewChannel]?.relative_path?.startsWith("demo:"))await primePreview(previewUrl(targetDatasetId,resultSample.id,previewChannel)).catch(()=>{})}
          setResults((prev) => [
            ...prev.filter((x) => x.sample_id !== m.result.sample_id),
            m.result,
          ]);
          if (operationModeRef.current === "AUTO"&&resultOrdinal===wsResultOrdinalRef.current) {
            setSelectedGlobalWt(null);
            setCurrent(m.result.sample_id);
            setSelectedDefect(-1);
          }
        }
        if (["completed", "failed", "cancelled"].includes(m.type)) {
          api
            .logs()
            .then((x) => setLogs(x.items.reverse()))
            .catch(() => { });
          api
            .storageState()
            .then(setStorage)
            .catch(() => { });
          ws.close();
          wsLiveRef.current=false;
          if (wsRef.current === ws) wsRef.current = null;
        }
      };
      ws.onerror = () => {
        wsLiveRef.current=false;
        ws.close();
        if (wsRef.current === ws) wsRef.current = null;
      };
      ws.onclose=()=>{wsLiveRef.current=false};
      void monitorJob(j.id, targetDatasetId, token);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function handleLotLoaded(id: string) {
    setLiveDatasetId(id);
    setSelectedGlobalWt(null);
    const loadedSamples = await refreshDatasets(id);
    setToast(`New lot imported · ${loadedSamples.length} lenses`);
    if (operationMode === "AUTO" && loadedSamples.length) {
      await run(id, loadedSamples.length);
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
    setBusy(true);
    try {
      const r = await api.inspectOne(datasetId, sample.id);
      setResults((p) => [...p.filter((x) => x.sample_id !== r.sample_id), r]);
      setSelectedDefect(-1);
      await api.storageState().then(setStorage);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function snap() {
    if (!datasetId || !sample) return;
    try {
      const r = await api.snapshot(datasetId, sample.id, channel);
      setToast(`Lens snapshot saved: ${r.saved}`);
    } catch (e) {
      setToast((e as Error).message);
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
      runTokenRef.current += 1;
      wsRef.current?.close();
      wsRef.current = null;
      setDatasetId(""); setDatasets([]); setSamples([]); setResults([]); setGlobalHistory([]); setCurrent(null); setSelectedGlobalWt(null); setLiveDatasetId(null); setJob(null);
      await refreshDatasets();
      setToast(`History cleared · ${response.removed.catalogs || 0} datasets and ${response.removed.results || 0} result files removed`);
    } catch (error) {
      setToast(`Unable to clear history: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function toggleStorage() {
    try {
      setStorage(
        storage?.active ? await api.storageStop() : await api.storageStart(),
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
  async function selectHistoryEntry(entry: GlobalHistoryEntry) {
    setSelectedGlobalWt(entry.wt);
    if (entry.datasetId !== datasetId) {
      setDatasetId(entry.datasetId);
      await loadDataset(entry.datasetId);
    }
    setCurrent(entry.sample.id);
    setSelectedDefect(-1);
    const available = entry.sample.images;
    if (!available[channel]) setChannel(available.h ? "h" : available.d ? "d" : Object.keys(available)[0] || "h");
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
    if (prefs.uiLocked || window.innerWidth < 1060) return;
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
    if (prefs.uiLocked || window.innerWidth < 1060) return;
    e.preventDefault();
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
    const up = () => {
      document.body.classList.remove("is-resizing-dashboard");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      patch(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
  function beginBottomResize(e: ReactPointerEvent<HTMLButtonElement>) {
    if (prefs.uiLocked) return;
    e.preventDefault();
    const startY = e.clientY,
      h0 = prefs.bottomHeight;
    document.body.classList.add("is-resizing-dashboard");
    const move = (ev: PointerEvent) => {
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
      patch({ bottomHeight: h });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
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
            onDataset={()=>setLoader(true)}
            onInfo={()=>setToast(`OKLIN3 · Version ${info?.version||"7.4.0"}`)}
            onExit={()=>setToast("Exit is disabled in the browser interface")}
            onUi={()=>window.dispatchEvent(new Event("lens-open-customizer"))}
          />
        ) : (
          <TopBar
            workstation
            info={info}
            operationMode={operationMode}
            onOperationMode={() => changeOperationMode()}
            onRefresh={refreshSystem}
            onUpload={() => setLoader(true)}
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
              <button onClick={() => setLoader(true)}>Upload Folder</button>
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
                  {/* <b>Installation GDL6BV2</b> · Station 2 */} <b className="" >Station 1</b>
                </span>
              </div>
              <div className="inspectionControlBlock">
                <h2>Current Business mode</h2>
                <button
                  className={`inspectionModeToggle ${operationMode.toLowerCase()}`}
                  onClick={() => changeOperationMode()}
                  aria-label={`Switch to ${operationMode === "AUTO" ? "Manual" : "Automatic"} operation`}
                >
                  {operationMode === "AUTO" ? <Play /> : <Pause />}
                  <span>
                    <b>{operationMode === "AUTO" ? "Setup Mode ( Automatic )" : " Setup Mode ( Manual )"}</b>
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
                      : "Storage ready"}
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
              {/* <div className="inspectionMachineActions"><button onClick={()=>setLoader(true)}><FolderOpen/>Upload dataset</button><button onClick={()=>window.dispatchEvent(new Event('lens-open-customizer'))}><LayoutDashboard/>Layout settings</button></div> */}
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
              onChannel={setChannel}
              labels={channelLabels}
              hold={hold}
              onHold={() => setHold((v) => !v)}
              selectedDefect={selectedDefect}
              onProbe={setProbe}
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
                {measurementEntries.map(([key, value]) => (
                  <InfoRow key={key} label={measurementLabel(key)} value={formatMeasurement(key, value)} />
                ))}
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
                      className={i === (selectedDefect >= 0 ? selectedDefect : 0) ? "selected" : ""}
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
              {/* <div className="inspectionDetailBox">
                <small>Defect details</small>
                <p>
                  {visibleDefects[selectedDefect]?.name
                    ? `${visibleDefects[selectedDefect].name} detected on ${channelLabels[visibleDefects[selectedDefect].channel || channel] || channel}.`
                    : "Select a detected defect to inspect its details."}
                </p>
              </div> */}
              <div className="inspectionLensActions">
                <button onClick={snap} disabled={!sample}>
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
                <span />
                {inspectionBottomTab === "wt" && (
                  <div className="inspectionWtTabMeta">
                    <b>
                      {sample?.metadata.io_code ||
                        `WT-${String(activeGlobalWt).padStart(4, "0")}`}
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
                  {filteredLogs.map((l, i) => (
                    <div className={l.level} key={`${l.time}-${i}`}>
                      <time>{l.time.includes("T") ? new Date(l.time).toLocaleTimeString() : l.time}</time>
                      <span>{l.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {inspectionBottomTab === "wt" && (
                <div className="inspectionWtView">
                  <div className={`inspectionWtGallery ${wtViewMode}`} style={{'--wt-grid-columns': String(Math.ceil(wtCapacity / 2))} as React.CSSProperties}>
                    {wtChannelImages.map((item) => {
                      const status = item.result?.status || "IDLE",
                        firstDefect = status === "OK" ? undefined : item.result?.defects?.[0],
                        uniqueDefects = uniqueDefectNames(item.result?.defects?.map(defect => defect.name) || []),
                        // Keep WT View aligned with WT History: a real defect
                        // uses its configured legend symbol instead of generic NOK.
                        configuredStatus = firstDefect ? defectSymbol(firstDefect.name) : statusSymbol(status),
                        tone =
                          status === "OK"
                            ? "ok"
                            : status === "NOK"
                              ? "nok"
                              : status === "WARN"
                                ? "warn"
                                : "idle",
                        resultLabel = wtResultLabel(status, uniqueDefects),
                        resultTitle = status === "OK" ? "Inspection OK" : status === "IDLE" ? "Not inspected" : uniqueDefects.length ? `${status}: ${uniqueDefects.join(", ")}` : status,
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
                                  <img src={item.src} alt={item.name} />
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
                                <em className="wtStatusChip" title={resultTitle}>{status === "IDLE" ? "Pending" : status}</em>
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
                    <TrendChart results={results} />
                  </div>
                  <div className="inspectionTrendStats yieldOnly">
                    <div className="inspectionYieldRing" style={{"--yield":`${displayYield*3.6}deg`} as React.CSSProperties}>
                      <span><b>{displayYield.toFixed(1)}%</b><small>Yield</small></span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="inspectionStatusBar">
          <span>
            Current user: <b>{info?.session.username || "NoUser"}</b>
          </span>
          <span>
            Version: <b>{info?.version || "7.4.0"}</b>
          </span>
          <span>
            Last inspection:{" "}
            <b>{lastInspectionLabel}</b>
          </span>
          <em>{statusNow.toLocaleDateString()} · {statusNow.toLocaleTimeString()}</em>
        </div>
        {loginOpen && (
          <div
            className="loginModalBackdrop"
            onMouseDown={(e) => {
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
        onOperationMode={() => changeOperationMode()}
        onRefresh={refreshSystem}
        onUpload={() => setLoader(true)}
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
          <button onClick={() => setLoader(true)} title="Load image folder">
            Load
          </button>
          <button onClick={() => refreshDatasets()} title="Refresh datasets">
            <RefreshCw />
          </button>
          <button
            className={`oakStorageState ${storage?.active ? "active" : ""}`}
            onClick={toggleStorage}
            title={storage?.active ? "Stop image storage" : "Start image storage"}
          >
            <Camera />
            <span>{storage?.active ? "Recording" : "Storage"}</span>
          </button>
        </div>
        <div className="oakDeckGroup oakModuleToggles" aria-label="Dashboard modules">
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
        <div className="oakDeckGroup oakDeckRight">
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
            onChannel={setChannel}
            labels={channelLabels}
            hold={hold}
            onHold={() => setHold((v) => !v)}
            selectedDefect={selectedDefect}
            onProbe={setProbe}
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
                  <InfoRow
                    label="Lens ID"
                    value={sample?.metadata.code || sample?.base_name}
                  />
                  <InfoRow label="Dataset" value={dataset?.name || "—"} />
                  <InfoRow
                    label="CT No."
                    value={inspectionIdentifiers.ctNumber}
                  />
                  <InfoRow label="Shuttle Nr." value={inspectionIdentifiers.shuttleNumber} />
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
                  <i />
                  {measurementEntries.map(([key, value]) => (
                    <InfoRow key={key} label={measurementLabel(key)} value={formatMeasurement(key, value)} />
                  ))}
                  <InfoRow label="Lens Type" value={sample?.category} />
                  <InfoRow
                    label="Curing Tray Nr."
                    value={inspectionIdentifiers.curingTray}
                  />
                  <InfoRow label="Oven Nr." value={sample?.metadata.machine || "—"} />
                  <InfoRow label="EM Tray Nr." value={sample?.metadata.u_index || "—"} />
                </div>
                <div className="referenceLensPreview">
                  <div className="referencePreviewImage">
                    {detailPreviewSrc ? (
                      <img src={detailPreviewSrc} alt="Current lens" />
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
                  <button onClick={snap} disabled={!sample}>
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
                        i === (selectedDefect >= 0 ? selectedDefect : 0)
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
              {Array.from({ length: wtCapacity }, (_, i) => {
                const s = wtSamples.find((x) => x.position === i + 1);
                if (!s)
                  return (
                    <div key={i} className="oakTrayCell empty">
                      <b>{i + 1}</b>
                      <i />
                    </div>
                  );
                const r = resultMap.get(s.id),
                  configuredStatus = statusSymbol(r?.status || "IDLE"),
                  ch = s.images.h
                    ? "h"
                    : s.images.d
                      ? "d"
                      : Object.keys(s.images)[0],
                  src = samplePreviewUrl(datasetId, s, ch);
                return (
                  <button
                    className={`oakTrayCell ${(r?.status || "idle").toLowerCase()} ${s.id === current ? "selected" : ""}`}
                    key={s.id}
                    onClick={() => select(s.id)}
                    title={`Position ${s.position} · ${configuredStatus.label}`}
                  >
                    <b>{s.position}</b>
                    <img src={src} alt={`Lens position ${s.position}`} />
                    <span style={{ backgroundColor: configuredStatus.color }}>{configuredStatus.symbol} {configuredStatus.label}</span>
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
          <section className={`oakBottomWorkspace referenceBottomWorkspace ${bottomLayoutEditing ? "bottomAdjustable" : ""}`}>
            {prefs.showTrend && (
              <div className="referenceBottomPanel referenceTrendPanel" aria-label="Yield and trend" style={{flexGrow:prefs.trendWidth}}>
                <div className="referencePanelTabs" aria-label="Trend views">
                  <button className="active">Yield Trend</button>
                  <button>Defect Types</button>
                  <button>Station Comparison</button>
                </div>
                <div className="referenceTrendBody">
                  <TrendChart results={results} />
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
                </div>
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
                    className="active"
                    onClick={() => setLogFilter("all")}
                  >
                    All
                  </button>
                  <button onClick={() => setLogFilter("warning")}>
                    Warnings
                  </button>
                  <button onClick={() => setLogFilter("error")}>Errors</button>
                  <button onClick={() => setLogFilter("system")}>System</button>
                </div>
                <div className="referenceLogs">
                  {filteredLogs.slice(0, 16).map((l, i) => (
                    <div key={`${l.time}-${i}`}>
                      <time>
                        {l.time.includes("T")
                          ? new Date(l.time).toLocaleTimeString()
                          : l.time}
                      </time>
                      <i className={l.level.toLowerCase()} />
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
                        <span><b>{averageCycleMs ? `${Math.round(averageCycleMs)}ms` : "—"}</b><small>Avg cycle</small></span>
                      </div>
                    </div>
                    <div className="inspectionStackedBar" aria-label={`OK ${yieldPct.toFixed(1)}%, NOK ${nokRate.toFixed(1)}%, warning ${warnRate.toFixed(1)}%`}>
                      <i className="ok" style={{width:`${yieldPct}%`}}/>
                      <i className="nok" style={{width:`${nokRate}%`}}/>
                      <i className="warn" style={{width:`${warnRate}%`}}/>
                    </div>
                    <div className="inspectionBarRows">
                      <div className="ok"><span><i/>OK <b>{counts.OK}</b></span><em><i style={{width:`${yieldPct}%`}}/></em><strong>{yieldPct.toFixed(1)}%</strong></div>
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
                      <span className={info ? "online" : "offline"}><i/><b>Camera</b><small>{info ? "Ready" : "Offline"}</small></span>
                      <span className={info ? "online" : "offline"}><i/><b>PLC</b><small>{info ? "Linked" : "Offline"}</small></span>
                      <span className={info ? "online" : "offline"}><i/><b>Database</b><small>{info ? "Active" : "Offline"}</small></span>
                      <span className={halconOnline ? "online" : "offline"}><i/><b>HALCON</b><small>{halconOnline ? "Ready" : "Offline"}</small></span>
                    </div>
                  </div>
                  <div className="inspectionPrimaryActions">
                  <button
                    className="closeApplication primaryCommand"
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
                  <button className={`commandIcon ${hold ? "active" : ""}`} onClick={() => setHold((v) => !v)} title={hold ? "Resume live view" : "Pause live view"} aria-label={hold ? "Resume live view" : "Pause live view"}>
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
                  <button onClick={() => {setLoader(true);setMoreActionsOpen(false)}}>
                    <FolderOpen />
                    <span>Upload Folder</span>
                  </button>
                  <button onClick={() => setToast("Recipe setup selected")}>
                    <Target />
                    <span>Recipe Setup</span>
                  </button>
                  <button
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
}: {
  label: string;
  value?: string | number | null;
  status?: string;
}) {
  return (
    <div className="referenceInfoRow">
      <span>{label}</span>
      {status ? (
        <b className={`referenceResult ${status.toLowerCase()}`}>{status}</b>
      ) : (
        <b>{value || "—"}</b>
      )}
    </div>
  );
}

function measurementLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatMeasurement(key: string, value: string | number) {
  const unit = key.endsWith("_px") ? " px" : key.endsWith("_ms") ? " ms" : "";
  return `${typeof value === "number" ? Number(value.toFixed(3)) : value}${unit}`;
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
