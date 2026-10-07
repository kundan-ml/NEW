"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, sharedInspectionSocketUrl, thumbnailUrl } from '@/lib/api';
import { prepareDecodedPreview } from '@/lib/preview-cache';
import { isInspectionMessage, reduceInspectionMessage } from '@/lib/shared-inspection';
import type { LiveInspectionSnapshot } from '@/types';

/** Observe only: mounting/reloading a workspace must never start inference. */
export function useSharedInspection(channel = 'h') {
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const [snapshot, setSnapshot] = useState<LiveInspectionSnapshot | null>(null);
  const resyncRef = useRef<() => void>(() => {});
  const resync = useCallback(() => resyncRef.current(), []);

  useEffect(() => {
    let stopped = false;
    let current: LiveInspectionSnapshot | null = null;
    let revision = 0;
    let socket: WebSocket | null = null;
    let socketHealthy = false;
    let lastSocketMessage = 0;
    let socketStartedAt = 0;
    let reconnectDelay = 1000;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let forceNext = false;
    let controller: AbortController | null = null;
    let presentation = 0;
    let presentedFrame = '';

    function receive(value: unknown) {
      if (stopped || !isInspectionMessage(value)) return;
      const next = reduceInspectionMessage(current, value);
      if (next.snapshot !== current) {
        current = next.snapshot;
        revision += 1;
        const snapshot = current;
        const latest = snapshot?.results.at(-1);
        const frame = latest ? `${snapshot?.stream_id}:${latest.dataset_id}:${latest.sample_id}:${latest.created_at}:${channelRef.current}` : '';
        const token = ++presentation;
        const publish = () => {
          if (stopped || token !== presentation) return;
          presentedFrame = frame;
          setSnapshot(snapshot);
        };
        // Publish frame metadata and statuses only once its canvas preview is
        // decoded. Keep reducing incoming messages so stale events never win.
        if (snapshot && latest && frame !== presentedFrame) {
          void prepareDecodedPreview(thumbnailUrl(snapshot.job?.dataset_id || latest.dataset_id, latest.sample_id, channelRef.current))
            .then(publish, publish); // A missing preview must not hide job errors/results.
        } else publish();
      }
      if (next.resync) requestSnapshot(true);
    }

    function schedulePoll() {
      if (stopped) return;
      clearTimeout(pollTimer);
      // Small unchanged heartbeats, not repeated results downloads. A healthy
      // socket streams frames immediately; HTTP also recovers blocked sockets.
      const healthy = socketHealthy && Date.now() - lastSocketMessage < 45000;
      if (socketHealthy && !healthy) socket?.close();
      const active=current?.job?.status==='running'||current?.job?.status==='queued';
      pollTimer = setTimeout(() => requestSnapshot(false), healthy ? 15000 : active ? 250 : 1000);
    }

    function requestSnapshot(force: boolean) {
      if (stopped) return;
      if (inFlight) { forceNext ||= force; return; }
      clearTimeout(pollTimer);
      inFlight = true;
      const requestedRevision = revision;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      void api.liveInspection(force ? undefined : current || undefined, controller.signal)
        .then(message => {
          // A delayed HTTP response from before a server restart cannot undo
          // the newer WebSocket generation. Same-generation order is reduced.
          if (stopped || (revision !== requestedRevision && current && message.stream_id !== current.stream_id)) return;
          receive(message);
        })
        .catch(() => { /* Keep the last good frame; retry without a toast storm. */ })
        .finally(() => {
          clearTimeout(timeout);
          controller = null;
          inFlight = false;
          if (stopped) return;
          if (forceNext) { forceNext = false; requestSnapshot(true); }
          else schedulePoll();
        });
    }

    function connect() {
      if (stopped || socket) return;
      const url = sharedInspectionSocketUrl();
      if (!url) return; // HTTPS uses the same-origin HTTP fallback if needed.
      let connection: WebSocket;
      try { connection = new WebSocket(url); } catch { scheduleReconnect(); return; }
      socket = connection;
      socketStartedAt = Date.now();
      lastSocketMessage = 0;
      connectTimer = setTimeout(() => {
        if (!stopped && socket === connection && !socketHealthy) connection.close();
      }, 15000);
      connection.onmessage = event => {
        if (stopped || socket !== connection) return;
        clearTimeout(connectTimer);
        lastSocketMessage = Date.now();
        socketHealthy = true;
        reconnectDelay = 1000;
        try {
          const message: unknown = JSON.parse(event.data);
          if (isInspectionMessage(message)) receive(message);
          else requestSnapshot(true);
        } catch { requestSnapshot(true); }
      };
      connection.onerror = () => connection.close();
      connection.onclose = () => {
        if (stopped || socket !== connection) return;
        clearTimeout(connectTimer);
        socket = null;
        socketHealthy = false;
        requestSnapshot(true);
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (stopped) return;
      clearTimeout(reconnectTimer);
      clearTimeout(connectTimer);
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(10000, reconnectDelay * 2);
    }

    const recover = () => {
      if (document.visibilityState === 'hidden') return;
      if (socket && Date.now() - (lastSocketMessage || socketStartedAt) > 45000) socket.close();
      requestSnapshot(true);
      connect();
    };
    resyncRef.current = () => requestSnapshot(true);
    requestSnapshot(true);
    connect();
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      stopped = true;
      resyncRef.current = () => {};
      clearTimeout(pollTimer);
      clearTimeout(reconnectTimer);
      clearTimeout(connectTimer);
      controller?.abort();
      socket?.close();
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, []);

  return { snapshot, resync };
}
