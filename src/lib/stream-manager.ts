/**
 * Global StreamManager, singleton that manages multiple concurrent SSE
 * connections so streams survive React component unmounts / thread switches.
 *
 * React components subscribe via `useSyncExternalStore`.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type StreamStatus = 'streaming' | 'settling' | 'error';

export type SearchStepStatus = 'running' | 'done' | 'error';

export interface SearchStepAgent {
  id: string;
  label: string;
  query: string;
  status: 'pending' | 'searching' | 'done' | 'error';
  summary?: string;
  sourceCount?: number;
  sources?: { url: string; title: string }[];
}

export interface SearchStep {
  id: string;
  tool: string;
  label: string;
  input?: string;
  status: SearchStepStatus;
  result?: string;
  sourceCount?: number;
  sources?: { url: string; title: string }[];
  agents?: SearchStepAgent[];
  error?: string;
}

export interface SearchState {
  active: boolean;
  done: boolean;
  steps: SearchStep[];
  /** Timestamp when search started (ms) */
  startedAt: number;
  /** Timestamp when search finished (ms), null if still running */
  finishedAt: number | null;
}

export interface ReasoningState {
  /** Whether the model is currently in a thinking phase */
  isThinking: boolean;
  /** Full accumulated reasoning text */
  fullText: string;
  /** Character-reveal text for animated display */
  displayedText: string;
}

export interface StreamEntry {
  threadId: string;
  restorationId: string;
  status: StreamStatus;
  fullText: string;
  displayedText: string;
  /** Human-readable error message set when status becomes 'error'. */
  errorMessage: string | null;
  eventSource: EventSource | null;
  staleTimer: ReturnType<typeof setTimeout> | null;
  search: SearchState | null;
  /** Reasoning/thinking trace state */
  reasoning: ReasoningState;
  /** Number of SSE reconnection attempts for this stream */
  retryCount: number;
  /** Whether we received at least one text chunk (helps distinguish slow-start from dead connection) */
  hasReceivedData: boolean;
  /** Whether this stream was started as a reconnection (uses aggressive timeouts) */
  isReconnect: boolean;
  /** Timestamp when this stream was created */
  startedAt: number;
  /** Hard lifetime timer, auto-settles after MAX_STREAM_LIFETIME_MS */
  lifetimeTimer: ReturnType<typeof setTimeout> | null;
}

type Listener = () => void;
type ErrorListener = (threadId: string, message: string | null) => void;

// ─── Constants ───────────────────────────────────────────────────────────────

/** Max SSE reconnection attempts before giving up */
const MAX_SSE_RETRIES = 3;

/** Base delay between retries in ms (doubles each attempt) */
const RETRY_BASE_DELAY_MS = 1_000;

/** Stale timeout for normal streams (no data received yet = more patient) */
const STALE_TIMEOUT_INITIAL_MS = 45_000;

/** Stale timeout after first data received */
const STALE_TIMEOUT_ACTIVE_MS = 30_000;

/** Stale timeout for reconnection attempts (much more aggressive, if dead, fail fast) */
const STALE_TIMEOUT_RECONNECT_MS = 10_000;

/** Stale timeout for search streams during slow phases */
const STALE_TIMEOUT_SEARCH_MS = 90_000;

/** Absolute maximum time a stream can stay alive (5 minutes), hard guardrail */
const MAX_STREAM_LIFETIME_MS = 5 * 60 * 1000;

// ─── StreamManager ───────────────────────────────────────────────────────────

class StreamManager {
  /** Active/settling streams keyed by threadId */
  private streams = new Map<string, StreamEntry>();

  /** Threads explicitly stopped by the user, prevents DB fallback from re-showing spinner */
  private stoppedThreadIds = new Set<string>();

  /** useSyncExternalStore listeners */
  private listeners = new Set<Listener>();

  /** Transient error listeners, fired once per stream failure. */
  private errorListeners = new Set<ErrorListener>();

  /** Global RAF handle */
  private rafId: number | null = null;

  /** Per-stream last-frame timestamps for character-reveal pacing */
  private lastFrameTimes = new Map<string, number>();

  // ── Snapshot cache (useSyncExternalStore requires referential stability) ──

  private snapshotVersion = 0;
  private cachedActiveIds: string[] = [];
  private cachedActiveIdsVersion = -1;

  // ── External store protocol ──────────────────────────────────────────────

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.snapshotVersion++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Subscribe to stream error events (e.g. to display a toast). */
  onError = (listener: ErrorListener): (() => void) => {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  };

  private emitError(threadId: string, message: string | null) {
    for (const listener of this.errorListeners) {
      try {
        listener(threadId, message);
      } catch (e) {
        console.error('[stream-manager] error listener threw:', e);
      }
    }
  }

  /** Returns the stream entry for a given thread (or undefined). */
  getStream = (threadId: string): StreamEntry | undefined => {
    return this.streams.get(threadId);
  };

  /** Snapshot accessor for useSyncExternalStore, returns stable array ref. */
  getActiveThreadIds = (): string[] => {
    if (this.cachedActiveIdsVersion === this.snapshotVersion) {
      return this.cachedActiveIds;
    }
    const ids: string[] = [];
    for (const [threadId, entry] of this.streams) {
      if (entry.status === 'streaming') {
        ids.push(threadId);
      }
    }
    this.cachedActiveIds = ids;
    this.cachedActiveIdsVersion = this.snapshotVersion;
    return this.cachedActiveIds;
  };

  /** Snapshot version counter, useSyncExternalStore uses this for change detection. */
  getSnapshotVersion = (): number => {
    return this.snapshotVersion;
  };

  // ── Stream lifecycle ─────────────────────────────────────────────────────

  startStream(threadId: string, restorationId: string, initialText: string = '', isSearch: boolean = false, isReconnect: boolean = false) {
    this.cleanupEntry(threadId);
    this.stoppedThreadIds.delete(threadId);

    const entry: StreamEntry = {
      threadId,
      restorationId,
      status: 'streaming',
      fullText: initialText,
      displayedText: initialText,
      errorMessage: null,
      eventSource: null,
      staleTimer: null,
      search: isSearch ? { active: true, done: false, steps: [], startedAt: Date.now(), finishedAt: null } : null,
      reasoning: { isThinking: false, fullText: '', displayedText: '' },
      retryCount: 0,
      hasReceivedData: initialText.length > 0,
      isReconnect,
      startedAt: Date.now(),
      lifetimeTimer: null,
    };

    // Hard guardrail: auto-settle after maximum lifetime
    entry.lifetimeTimer = setTimeout(() => {
      if (this.streams.get(threadId) !== entry) return;
      if (entry.status !== 'streaming') return;
      console.warn(`[stream-manager] Stream exceeded max lifetime (${MAX_STREAM_LIFETIME_MS / 1000}s), auto-settling:`, restorationId.slice(-6));
      if (entry.hasReceivedData) {
        this.settleStream(threadId);
      } else {
        this.errorStream(threadId);
      }
    }, MAX_STREAM_LIFETIME_MS);

    this.streams.set(threadId, entry);
    this.connectSSE(entry);
    this.ensureRAF();
    this.notify();
  }

  /**
   * Start a stream by consuming the POST response body directly.
   * Returns { restorationId, newThreadId } from the init event.
   * On disconnect, seamlessly falls back to GET /api/chat/stream for reconnection.
   */
  async startStreamFromPOST(
    threadId: string,
    response: Response,
    isSearch: boolean = false,
  ): Promise<{ restorationId: string; newThreadId?: string }> {
    this.cleanupEntry(threadId);
    this.stoppedThreadIds.delete(threadId);

    const entry: StreamEntry = {
      threadId,
      restorationId: '', // Set once init event arrives
      status: 'streaming',
      fullText: '',
      displayedText: '',
      errorMessage: null,
      eventSource: null,
      staleTimer: null,
      search: isSearch ? { active: true, done: false, steps: [], startedAt: Date.now(), finishedAt: null } : null,
      reasoning: { isThinking: false, fullText: '', displayedText: '' },
      retryCount: 0,
      hasReceivedData: false,
      isReconnect: false,
      startedAt: Date.now(),
      lifetimeTimer: null,
    };

    entry.lifetimeTimer = setTimeout(() => {
      // Use entry.threadId (not the closed-over threadId) because
      // rekeyStream() may have changed it from "new" to the real ID.
      if (this.streams.get(entry.threadId) !== entry) return;
      if (entry.status !== 'streaming') return;
      console.warn(`[stream-manager] Stream exceeded max lifetime, auto-settling`);
      entry.hasReceivedData ? this.settleStream(entry.threadId) : this.errorStream(entry.threadId);
    }, MAX_STREAM_LIFETIME_MS);

    this.streams.set(threadId, entry);
    this.ensureRAF();
    this.notify();

    // Parse SSE from the POST response body
    return new Promise((resolve, reject) => {
      let initResolved = false;
      let sseBuffer = '';

      const processSSELine = (line: string) => {
        if (line.startsWith('event: ')) {
          this._currentPOSTEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            const eventType = this._currentPOSTEvent || '';
            this._currentPOSTEvent = '';

            if (eventType === 'init') {
              entry.restorationId = data.restorationId;
              initResolved = true;
              resolve({ restorationId: data.restorationId, newThreadId: data.newThreadId });
              return;
            }

            if (eventType === 'done') {
              this.settleStream(entry.threadId);
              return;
            }

            if (eventType === 'fatal') {
              const message = typeof data?.message === 'string' ? data.message : null;
              if (!entry.hasReceivedData) {
                this.errorStream(entry.threadId, message);
              } else {
                // We already rendered text, keep it and mark as errored
                // so the user still sees partial output plus the failure.
                if (message) entry.errorMessage = message;
                this.errorStream(entry.threadId, message);
              }
              this.emitError(entry.threadId, message);
              return;
            }

            // Handle search events
            if (data._searchEvent && entry.search) {
              this.handleSearchEvent(entry, data);
              return;
            }

            // Handle reasoning events
            if (data._reasoning) {
              if (data._reasoning === 'start') {
                entry.reasoning = { ...entry.reasoning, isThinking: true };
                entry.hasReceivedData = true;
                this.notify();
              } else if (data._reasoning === 'delta' && data.text) {
                entry.reasoning = {
                  ...entry.reasoning,
                  fullText: entry.reasoning.fullText + data.text,
                };
                entry.hasReceivedData = true;
              } else if (data._reasoning === 'end') {
                entry.reasoning = {
                  ...entry.reasoning,
                  isThinking: false,
                  displayedText: entry.reasoning.fullText,
                };
                this.notify();
              }
              return;
            }

            // Text chunks
            if (data.text) {
              entry.fullText += data.text;
              entry.hasReceivedData = true;
            }
          } catch (e) {
            console.error('[stream-manager] Error parsing POST SSE data', e);
          }
        }
      };

      const reader = response.body?.getReader();
      if (!reader) {
        reject(new Error('Response body is null'));
        return;
      }

      const decoder = new TextDecoder();

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // Use entry.threadId, rekeyStream() may have changed it
            if (this.streams.get(entry.threadId) !== entry) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) processSSELine(line);
            }
          }
        } catch (err) {
          console.warn('[stream-manager] POST stream disconnected:', err);
        }

        // Stream ended or disconnected, use entry.threadId throughout
        if (this.streams.get(entry.threadId) !== entry) return;
        if (entry.status !== 'streaming') return;

        if (entry.hasReceivedData && entry.restorationId) {
          entry.isReconnect = true;
          this.connectSSE(entry);
        } else if (!initResolved) {
          reject(new Error('POST stream ended before init event'));
        } else {
          this.settleStream(entry.threadId);
        }
      };

      pump();
    });
  }

  /** Temporary storage for SSE event type during POST stream parsing */
  private _currentPOSTEvent = '';

  /** Re-key a stream from one threadId to another (used when "new" → real ID) */
  rekeyStream(oldKey: string, newKey: string) {
    const entry = this.streams.get(oldKey);
    if (!entry) return;
    entry.threadId = newKey;
    this.streams.delete(oldKey);
    this.streams.set(newKey, entry);
    this.lastFrameTimes.delete(oldKey);
    this.notify();
  }

  settleStream(threadId: string, finalText?: string) {
    const entry = this.streams.get(threadId);
    if (!entry) return;

    const text = finalText ?? entry.fullText;
    this.closeSSE(entry);

    entry.status = 'settling';
    entry.fullText = text;
    entry.displayedText = text;

    // Snap reasoning to completion
    entry.reasoning = {
      isThinking: false,
      fullText: entry.reasoning.fullText,
      displayedText: entry.reasoning.fullText,
    };

    // Mark search as done
    if (entry.search && !entry.search.done) {
      entry.search = { ...entry.search, done: true, finishedAt: Date.now() };
    }

    this.lastFrameTimes.delete(threadId);
    this.notify();
  }

  errorStream(threadId: string, message?: string | null) {
    const entry = this.streams.get(threadId);
    if (!entry) return;

    this.closeSSE(entry);
    entry.status = 'error';
    if (message) entry.errorMessage = message;

    if (entry.search && !entry.search.done) {
      entry.search = { ...entry.search, done: true, finishedAt: Date.now() };
    }

    this.lastFrameTimes.delete(threadId);
    this.notify();
  }

  removeStream(threadId: string) {
    this.cleanupEntry(threadId);
    this.notify();
  }

  async stopStream(threadId: string): Promise<{ restorationId: string; finalText: string } | null> {
    const entry = this.streams.get(threadId);
    if (!entry) return null;

    const restorationId = entry.restorationId;
    const finalText = entry.fullText.length > entry.displayedText.length
      ? entry.fullText
      : entry.displayedText;

    // Mark as explicitly stopped so sidebar won't fallback to DB isGenerating
    this.stoppedThreadIds.add(threadId);

    this.settleStream(threadId, finalText);

    try {
      await fetch('/api/chat/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restorationId }),
      });
    } catch (e) {
      console.error('Failed to send stop signal:', e);
    }

    return { restorationId, finalText };
  }

  hasStream(threadId: string): boolean {
    return this.streams.has(threadId);
  }

  /** Check if a thread was explicitly stopped by the user (prevents DB fallback spinner) */
  wasExplicitlyStopped(threadId: string): boolean {
    return this.stoppedThreadIds.has(threadId);
  }

  // ── SSE connection ───────────────────────────────────────────────────────

  private connectSSE(entry: StreamEntry) {
    const { restorationId, threadId } = entry;

    const skipParam = entry.fullText.length > 0 ? `&skip=${entry.fullText.length}` : '';
    const sse = new EventSource(`/api/chat/stream?id=${restorationId}${skipParam}`);
    entry.eventSource = sse;
    let closedLocally = false;

    const getStaleTimeout = () => {
      // Reconnections use aggressive timeout, if the stream is dead, fail fast
      if (entry.isReconnect && !entry.hasReceivedData) {
        return STALE_TIMEOUT_RECONNECT_MS;
      }
      if (entry.search && !entry.search.done) {
        return STALE_TIMEOUT_SEARCH_MS;
      }
      return entry.hasReceivedData ? STALE_TIMEOUT_ACTIVE_MS : STALE_TIMEOUT_INITIAL_MS;
    };

    const resetStaleTimer = () => {
      if (entry.staleTimer) clearTimeout(entry.staleTimer);
      entry.staleTimer = setTimeout(() => {
        if (closedLocally) return;
        if (this.streams.get(threadId) !== entry) return;
        console.warn(`Stream stale for ${getStaleTimeout() / 1000}s, settling:`, restorationId);
        if (!entry.hasReceivedData) {
          this.handleSSEFailure(entry);
        } else {
          this.settleStream(threadId);
        }
      }, getStaleTimeout());
    };
    resetStaleTimer();

    const dispose = () => {
      closedLocally = true;
      this.closeSSE(entry);
    };

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle search events
        if (data._searchEvent && entry.search) {
          this.handleSearchEvent(entry, data);
          resetStaleTimer();
          return;
        }

        // Handle reasoning events
        if (data._reasoning) {
          if (data._reasoning === 'start') {
            entry.reasoning = { ...entry.reasoning, isThinking: true };
            entry.hasReceivedData = true;
            this.notify();
          } else if (data._reasoning === 'delta' && data.text) {
            entry.reasoning = {
              ...entry.reasoning,
              fullText: entry.reasoning.fullText + data.text,
            };
            entry.hasReceivedData = true;
          } else if (data._reasoning === 'end') {
            entry.reasoning = {
              ...entry.reasoning,
              isThinking: false,
              displayedText: entry.reasoning.fullText,
            };
            this.notify();
          }
          resetStaleTimer();
          return;
        }

        if (data.text) {
          entry.fullText += data.text;
          entry.hasReceivedData = true;
          resetStaleTimer();
        }
      } catch (e) {
        console.error('Error parsing SSE data', e);
      }
    };

    const handleDone = () => {
      dispose();
      this.settleStream(threadId);
    };

    const handleFatal = (ev: MessageEvent) => {
      dispose();
      let message: string | null = null;
      try {
        const parsed = JSON.parse(ev.data);
        if (typeof parsed?.message === 'string') message = parsed.message;
      } catch {}
      this.errorStream(threadId, message);
      this.emitError(threadId, message);
    };

    sse.addEventListener('done', handleDone);
    sse.addEventListener('fatal', handleFatal as EventListener);
    sse.onerror = () => {
      if (closedLocally) return;
      if (this.streams.get(threadId) !== entry) return;
      dispose();
      this.handleSSEFailure(entry);
    };
  }

  private handleSSEFailure(entry: StreamEntry) {
    const { threadId, retryCount } = entry;
    // Reconnections get fewer retries, don't waste time on dead streams
    const maxRetries = entry.isReconnect ? 1 : MAX_SSE_RETRIES;

    if (retryCount < maxRetries) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount);
      entry.retryCount++;

      setTimeout(() => {
        if (this.streams.get(threadId) !== entry) return;
        if (entry.status !== 'streaming') return;
        this.connectSSE(entry);
      }, delay);
    } else {
      console.warn(`[stream-manager] SSE retries exhausted for:`, entry.restorationId.slice(-6));
      if (entry.hasReceivedData) {
        this.settleStream(threadId);
      } else {
        const message = 'Lost connection to the model stream.';
        this.errorStream(threadId, message);
        this.emitError(threadId, message);
      }
    }
  }

  // ── Search event handling ──────────────────────────────────────────────────

  private handleSearchEvent(entry: StreamEntry, data: any) {
    if (!entry.search) return;

    const eventType = data._searchEvent as string;

    // Clone search state for React reactivity
    let search: SearchState = {
      ...entry.search,
      steps: entry.search.steps.map((s) => ({
        ...s,
        agents: s.agents ? s.agents.map((a) => ({ ...a })) : undefined,
      })),
    };

    switch (eventType) {
      case 'step-start': {
        const step: SearchStep = {
          id: data.step.id,
          tool: data.step.tool,
          label: data.step.label,
          input: data.step.input,
          status: data.step.status ?? 'running',
          sources: data.step.sources,
          agents: data.step.agents,
        };
        search.steps = [...search.steps, step];
        break;
      }

      case 'step-update': {
        const idx = search.steps.findIndex((s) => s.id === data.stepId);
        if (idx !== -1) {
          search.steps = search.steps.map((s, i) =>
            i === idx ? { ...s, ...data.updates } : s,
          );
        }
        break;
      }

      case 'step-done': {
        const idx = search.steps.findIndex((s) => s.id === data.stepId);
        if (idx !== -1) {
          search.steps = search.steps.map((s, i) =>
            i === idx ? { ...s, status: 'done' as const, ...data.updates } : s,
          );
        }
        break;
      }

      case 'step-error': {
        const idx = search.steps.findIndex((s) => s.id === data.stepId);
        if (idx !== -1) {
          search.steps = search.steps.map((s, i) =>
            i === idx ? { ...s, status: 'error' as const, error: data.error } : s,
          );
        }
        break;
      }
    }

    entry.search = search;
    this.notify();
  }

  private closeSSE(entry: StreamEntry) {
    if (entry.eventSource) {
      entry.eventSource.close();
      entry.eventSource = null;
    }
    if (entry.staleTimer) {
      clearTimeout(entry.staleTimer);
      entry.staleTimer = null;
    }
    if (entry.lifetimeTimer) {
      clearTimeout(entry.lifetimeTimer);
      entry.lifetimeTimer = null;
    }
  }

  // ── RAF animation loop (shared across all streams) ───────────────────────

  private ensureRAF() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    let anyActive = false;
    let anyChanged = false;

    for (const [threadId, entry] of this.streams) {
      if (entry.status !== 'streaming') continue;

      const hasTextBacklog = entry.displayedText.length < entry.fullText.length;
      const hasReasoningBacklog = entry.reasoning.displayedText.length < entry.reasoning.fullText.length;

      if (!hasTextBacklog && !hasReasoningBacklog) continue;

      anyActive = true;

      const lastTime = this.lastFrameTimes.get(threadId) ?? now;
      const frameDelta = Math.min(64, Math.max(16, now - lastTime));

      if (hasTextBacklog) {
        const backlog = entry.fullText.length - entry.displayedText.length;
        const baseChars = Math.max(3, Math.round(frameDelta * 0.3));
        const catchUpChars = Math.min(200, Math.ceil(backlog / 3));
        const charsToAdd = Math.min(backlog, baseChars + catchUpChars);
        entry.displayedText = entry.fullText.substring(0, entry.displayedText.length + charsToAdd);
      }

      if (hasReasoningBacklog) {
        const backlog = entry.reasoning.fullText.length - entry.reasoning.displayedText.length;
        const baseChars = Math.max(3, Math.round(frameDelta * 0.3));
        const catchUpChars = Math.min(200, Math.ceil(backlog / 3));
        const charsToAdd = Math.min(backlog, baseChars + catchUpChars);
        entry.reasoning = {
          ...entry.reasoning,
          displayedText: entry.reasoning.fullText.substring(0, entry.reasoning.displayedText.length + charsToAdd),
        };
      }

      this.lastFrameTimes.set(threadId, now);
      anyChanged = true;
    }

    if (anyChanged) {
      this.notify();
    }

    if (anyActive || this.hasAnyStreamingEntries()) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.rafId = null;
    }
  };

  private hasAnyStreamingEntries(): boolean {
    for (const entry of this.streams.values()) {
      if (entry.status === 'streaming') return true;
    }
    return false;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  private cleanupEntry(threadId: string) {
    const entry = this.streams.get(threadId);
    if (!entry) return;

    this.closeSSE(entry);
    this.lastFrameTimes.delete(threadId);
    this.streams.delete(threadId);
  }
}

// ── Singleton export ─────────────────────────────────────────────────────────

export const streamManager = new StreamManager();
