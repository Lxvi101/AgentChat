/**
 * ImageGenerationStore, lightweight singleton that tracks in-flight image
 * generations. Completed images live in Convex; this store only holds
 * pending/error items until Convex real-time sync catches up.
 *
 * React components subscribe via `useSyncExternalStore`, zero unnecessary
 * rerenders, matching the StreamManager pattern used in the chat.
 */

export interface PendingImageGeneration {
  id: string;
  prompt: string;
  modelId: string;
  modelName: string;
  aspectRatio: string;
  resolution: string;
  status: "generating" | "error";
  error?: string;
  startedAt: number;
  /** Estimated dimensions for placeholder sizing */
  width: number;
  height: number;
}

type Listener = () => void;

class ImageGenerationStore {
  private items = new Map<string, PendingImageGeneration>();
  private listeners = new Set<Listener>();
  private version = 0;
  private cachedSnapshot: PendingImageGeneration[] = [];
  private cachedSnapshotVersion = -1;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshotVersion = (): number => this.version;

  getItems = (): PendingImageGeneration[] => {
    if (this.cachedSnapshotVersion === this.version) return this.cachedSnapshot;
    this.cachedSnapshot = [...this.items.values()];
    this.cachedSnapshotVersion = this.version;
    return this.cachedSnapshot;
  };

  add(gen: PendingImageGeneration) {
    this.items.set(gen.id, gen);
    this.notify();
  }

  remove(id: string) {
    if (!this.items.has(id)) return;
    this.items.delete(id);
    this.notify();
  }

  setError(id: string, error: string) {
    const item = this.items.get(id);
    if (!item) return;
    this.items.set(id, { ...item, status: "error", error });
    this.notify();
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  private notify() {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}

export const imageStore = new ImageGenerationStore();
