import { useSyncExternalStore } from 'react';
import { streamManager, type StreamEntry } from '~/lib/stream-manager';

/**
 * Subscribe to the stream entry for a specific thread.
 * Returns the StreamEntry if one exists, or undefined.
 */
export function useStreamEntry(threadId: string): StreamEntry | undefined {
  const version = useSyncExternalStore(
    streamManager.subscribe,
    streamManager.getSnapshotVersion,
    streamManager.getSnapshotVersion
  );
  // `version` forces re-render on any change; we then read the current value.
  // This avoids creating a new snapshot function per threadId.
  void version;
  // During "new" → real-ID transition, the stream may have been rekeyed before
  // React re-renders with the new threadId. Fall back to checking "new" so the
  // streaming response doesn't vanish for a frame (visible on mobile).
  return streamManager.getStream(threadId)
    ?? (threadId === "new" ? undefined : streamManager.getStream("new"));
}

/**
 * Returns the list of threadIds that currently have an active (streaming) SSE connection.
 * Used by sidebar to show spinning indicators.
 */
export function useActiveStreamIds(): string[] {
  return useSyncExternalStore(
    streamManager.subscribe,
    streamManager.getActiveThreadIds,
    () => [] as string[] // SSR fallback
  );
}
