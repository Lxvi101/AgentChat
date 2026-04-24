import {
  createFileRoute,
  Outlet,
  Link,
  useRouter,
} from "@tanstack/react-router";
import {
  useState,
  useRef,
  useEffect,
  useMemo,
  memo,
  useCallback,
  createContext,
  useContext,
  useDeferredValue,
} from "react";
import { estimateTokenCount } from "tokenx";
import {
  ArrowUp,
  Square,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Globe,
  Paperclip,
  Copy,
  SquarePen,
  Pin,
  PinOff,
  Trash2,
  Bot,
  ChevronDown,
  X,
  Loader2,
  MoreHorizontal,
  Edit,
  Trash,
  AlertCircle,
  ShieldAlert,
  FileText,
  Image as ImageIcon,
  Search,
  ArrowDown,
  Check,
  RotateCcw,
  Upload,
  LogIn,
} from "lucide-react";
import { VoiceInput } from "~/components/VoiceInput";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";
import { Skeleton } from "~/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { useHybridChat, type OptimisticMessage } from "~/hooks/useHybridChat";
import type { SearchState } from "~/lib/stream-manager";
import { useFileUpload } from "~/hooks/useFileUpload";
import { useSmartScroll } from "~/hooks/useSmartScroll";
import { useActiveStreamIds } from "~/hooks/useStreamManagerSnapshot";
import { streamManager } from "~/lib/stream-manager";
import { MarkdownMessage } from "~/components/MarkdownMessage";
import { MessageAttachments } from "~/components/MessageAttachments";
import {
  ModelSelector,
  type ModelSelectorHandle,
} from "~/components/ModelSelector";
import { WebSearchProgress } from "~/components/WebSearchProgress";
import { ThinkingBlock } from "~/components/ThinkingBlock";
import { getModelContextLimit, getModelConfig, MODELS } from "~/lib/models";
import {
  createClipboardAttachmentFile,
  estimateAttachmentContext,
  formatCompactContextSize,
  isContextEstimableFile,
  isTextLikeFile,
  shouldConvertClipboardToAttachment,
  type AttachmentContextEstimate,
} from "~/lib/attachment-context";
import { Id } from "../../convex/_generated/dataModel";
import { CreateAgentDialog } from "~/components/CreateAgentDialog";
import { EditAgentDialog } from "~/components/EditAgentDialog";
import { DEFAULT_AGENT_EMOJI } from "~/components/AgentEmojiPicker";
import {
  useImageStudio,
  ImageStudioSidebar,
  ImageStudioContent,
} from "~/components/ImageStudio";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import { useIsMobile } from "~/hooks/use-mobile";
import { nativePushState } from "~/lib/native-history";
import { useKeyboardHeight } from "~/hooks/useKeyboardHeight";
import { useKeyboardAction } from "~/hooks/useKeyboardAction";
import { toast } from "sonner";
import { SignInDialog } from "~/components/SignInDialog";

// Context to let input area communicate focus state up to the layout
const MobileInputFocusContext = createContext<{
  isFocused: boolean;
  setIsFocused: (v: boolean) => void;
}>({ isFocused: false, setIsFocused: () => {} });

function ChatRoute() {
  return <ChatLayout ssrMode="chat" />;
}

export const Route = createFileRoute("/chat")({
  component: ChatRoute,
});

// Global variable ensures we ONLY run the long entry-fade once per hard refresh
let isInitialPageLoad = true;

// Staggered Sidebar Animation Variants
const sidebarContainerVariants = {
  hidden: {}, // We don't hide the container, let the children hide themselves
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const sidebarItemVariants = {
  hidden: { opacity: 0, x: -10, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

// Helper: read mode + threadId from a pathname
function parsePathname(pathname: string): { mode: "chat" | "studio"; threadId: string } {
  if (pathname === "/studio" || pathname === "/studio/") {
    return { mode: "studio", threadId: "new" };
  }
  const match = pathname.match(/\/chat\/(.+)/);
  return { mode: "chat", threadId: match ? match[1] : "new" };
}

// Max number of ThreadViews we keep mounted in the DOM at once.
// Switching between any of these feels instant because React never
// unmounts the rendered message list, Shiki-highlighted code blocks,
// draft input, or scroll position, we toggle visibility/stacking, not `display: none`.
const MAX_MOUNTED_THREADS = 6;
type MountedSlot = { key: string; threadId: string };

// --- LAYOUT COMPONENT (persists across /chat, /chat/$threadId, and /studio) ---
export function ChatLayout({ ssrMode }: { ssrMode?: "chat" | "studio" } = {}) {
  // Seed the initial threadId from the router's location, which TanStack Start
  // populates from the request URL on the server and from the same URL on the
  // client during hydration, so the initializer returns an identical value on
  // both sides. We intentionally avoid `useMatches()` here: during SSR the
  // parent `/chat` route renders before the child `/chat/$threadId` match has
  // been resolved onto the chain, so `useMatches()` returns only the parent
  // match and we'd fall back to `"new"`, the exact hydration mismatch we just
  // debugged (server renders `chat-scroll-new` + empty state, client hydrates
  // `chat-scroll-<id>` + messages).
  const router = useRouter();

  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    return parsePathname(router.state.location.pathname).threadId;
  });

  // ── Keep-alive LRU cache of recently-viewed ThreadViews ──────────────
  // Instead of unmounting the current thread when the user clicks another
  // one in the sidebar, we keep the last N mounted and toggle `display`.
  // This is what makes switching feel native/instant: the already-parsed
  // markdown, highlighted code blocks, scroll position, and draft input
  // are still in the DOM, React has nothing to reconcile.
  //
  // Each slot has a stable `key` independent of `threadId` so that the
  // "new" → realId handoff keeps the same React instance (its hooks,
  // optimistic state, and stream wiring survive intact).
  //
  // We deliberately DO NOT reorder the slot array when the user revisits
  // a cached thread. Reordering keyed children forces React to move the
  // underlying DOM nodes, which triggers a full layout/paint of the
  // message tree, the exact thing we're trying to avoid. Instead we
  // track recency in a ref-backed map and only use it for eviction.
  const [mountedSlots, setMountedSlots] = useState<MountedSlot[]>(() => [
    { key: "slot-initial", threadId: activeThreadId },
  ]);
  const lruRef = useRef(new Map<string, number>());
  const lruTickRef = useRef(0);

  useEffect(() => {
    // Bump recency for the active thread.
    lruTickRef.current += 1;
    lruRef.current.set(activeThreadId, lruTickRef.current);

    setMountedSlots((prev) => {
      // Already mounted? Leave the array alone, ChatLayout won't re-render
      // from this setState because the reference is unchanged.
      if (prev.some((s) => s.threadId === activeThreadId)) return prev;

      // Append a fresh slot (no reorder of existing slots, so no DOM moves).
      const slot: MountedSlot = {
        key: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        threadId: activeThreadId,
      };
      const next = [...prev, slot];

      // Evict the least-recently-used non-active slot if over capacity.
      if (next.length > MAX_MOUNTED_THREADS) {
        let oldestId: string | null = null;
        let oldestTick = Infinity;
        for (const s of next) {
          if (s.threadId === activeThreadId) continue;
          const tick = lruRef.current.get(s.threadId) ?? 0;
          if (tick < oldestTick) {
            oldestTick = tick;
            oldestId = s.threadId;
          }
        }
        if (oldestId !== null) {
          lruRef.current.delete(oldestId);
          return next.filter((s) => s.threadId !== oldestId);
        }
      }
      return next;
    });
  }, [activeThreadId]);

  // ── Decouple sidebar switch from chat-body render ──────────────────
  //
  // `activeThreadId` and `mountedSlots` update urgently (so the sidebar
  // highlight, URL, and header flip on the very next frame). But the
  // heavy consumer, `MountedSlotsView` rendering the message tree, // reads the *deferred* versions. React schedules that render at low
  // priority, so the click commit is not blocked by:
  //   - mounting a fresh `ThreadView` + `useHybridChat`
  //   - Markdown / KaTeX parsing of historical messages
  //   - Shiki syntax-highlight paint-ins
  //
  // The user sees: sidebar flips instantly, old chat body stays put for
  // a frame or two, new body swaps in smoothly. This is the T3-style
  // "instant sidebar, async body" split.
  const deferredActiveThreadId = useDeferredValue(activeThreadId);
  const deferredMountedSlots = useDeferredValue(mountedSlots);

  // 2. Listen for Browser Back/Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parsePathname(window.location.pathname);
      setActiveThreadId(parsed.threadId);
      setMode(parsed.mode);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Keep track of which agent context we are in when creating a new chat
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>();
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [agentToEdit, setAgentToEdit] = useState<{
    _id: Id<"agents">;
    name: string;
    emoji?: string;
    systemPrompt?: string;
    includedFiles?: Id<"files">[];
  } | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<
    Record<string, boolean>
  >({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [signInDialogOpen, setSignInDialogOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarPage, setSidebarPage] = useState(0);
  const SIDEBAR_PAGE_SIZE = 20;
  const modelSelectorRef = useRef<ModelSelectorHandle>(null);
  const pendingBranchMessageRef = useRef<string | null>(null);

  const branchThread = useMutation(api.threads.branch);

  const handleBranch = useCallback(
    async (
      originalThreadId: string,
      cutoffMessageIndex: number,
      editedText: string,
    ) => {
      const newThreadId = await branchThread({
        originalThreadId: originalThreadId as Id<"threads">,
        cutoffMessageIndex,
      });
      pendingBranchMessageRef.current = editedText;
      setActiveThreadId(newThreadId);
      const path = `/chat/${newThreadId}`;
      lastChatPathRef.current = path;
      nativePushState(null, "", path);
      setMobileMenuOpen(false);
    },
    [branchThread],
  );

  // ─── Studio Mode (URL-driven: /studio) ─────────────────────────────────
  // ssrMode is passed by the route component wrapper, it's available on
  // both server and client, so the very first paint is correct.
  // On in-app nativePushState navigations the prop won't change (same
  // component instance), so we fall back to window.location.
  const [mode, setMode] = useState<"chat" | "studio">(
    ssrMode ?? (typeof window !== "undefined"
      ? parsePathname(window.location.pathname).mode
      : "chat"),
  );
  // Only mount the inactive sidebar layer after first client paint so the
  // server-rendered HTML doesn't contain both sidebars (Framer Motion
  // doesn't apply opacity:0 inline styles during SSR).
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);

  // ─── Studio Auth Gate ──────────────────────────────────────────────────
  // Mirror the chat view pattern: if unauthenticated, pop the SignInDialog
  // instead of firing the generate request.
  const { isAuthenticated: isStudioAuthenticated } = useConvexAuth();
  const [studioSignInOpen, setStudioSignInOpen] = useState(false);

  const studioAuthGate = useCallback(() => {
    if (!isStudioAuthenticated) {
      setStudioSignInOpen(true);
      return true; // blocked
    }
    return false; // allowed
  }, [isStudioAuthenticated]);

  // Pass the guard as onAuthRequired, when the user IS authenticated,
  // we pass undefined so the hook proceeds normally.
  const studio = useImageStudio(
    isStudioAuthenticated ? undefined : () => studioAuthGate(),
  );

  // Remember the last chat URL so we can restore it when leaving studio
  const lastChatPathRef = useRef(
    typeof window !== "undefined" && !window.location.pathname.startsWith("/studio")
      ? window.location.pathname
      : "/chat",
  );

  const isMobile = useIsMobile();
  const [mobileInputFocused, setMobileInputFocused] = useState(false);
  const mobileInputFocusContextValue = useMemo(
    () => ({
      isFocused: mobileInputFocused,
      setIsFocused: setMobileInputFocused,
    }),
    [mobileInputFocused],
  );

  const deleteAgent = useMutation(api.agents.remove);

  // 3. Ultra-fast shallow navigation
  //    Uses nativePushState to bypass TanStack Router's pushState patch,
  //    keeping ChatLayout mounted across URL changes.
  //
  // These handlers are kept referentially stable with empty dep arrays.
  // They read the latest `activeThreadId` / `mode` from refs instead of
  // closure, which is what lets memoized children (ThreadItem, the sidebar
  // swarm) skip re-rendering on every switch. Without the refs, each
  // click would rebuild handleSwitchChat → bust memo on every ThreadItem →
  // 30+ sidebar items re-render instead of 2.
  //
  // We write to the refs during render (not in an effect) so the ref is
  // always in sync with the latest rendered state, no post-render gap
  // where a click could read a stale value.
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const handleSwitchChat = useCallback((id: string) => {
    if (id === activeThreadIdRef.current && modeRef.current === "chat") return;
    // All click-response state updates fire urgently so the sidebar
    // highlight, URL, and header flip on the very next frame (~16ms).
    //
    // The heavy chat-body render is decoupled via `useDeferredValue` on
    // the props passed to `MountedSlotsView` (see below). That means
    // this urgent commit paints the new sidebar selection while the old
    // chat body stays on screen; React then renders the new thread body
    // at low priority and swaps it in when ready.
    //
    // Rationale for dropping the outer `startTransition`: wrapping
    // `setActiveThreadId` in a transition also deferred the *sidebar*
    // highlight, because the sidebar reads `activeThreadId` directly.
    // That's what made the click feel laggy even when the chat body
    // was fast. Making the setState urgent + deferring only the heavy
    // consumer gives us the T3-style "instant sidebar, smooth body"
    // split.
    const path = `/chat/${id}`;
    lastChatPathRef.current = path;
    nativePushState(null, "", path);
    setMobileMenuOpen(false);
    setActiveThreadId(id);
    setMode("chat");
  }, []);

  const handleNewChat = useCallback((agentId?: string) => {
    setActiveAgentId(agentId);
    setMode("chat");
    lastChatPathRef.current = "/chat";
    if (activeThreadIdRef.current === "new" && modeRef.current === "chat") return;
    setActiveThreadId("new");
    nativePushState(null, "", "/chat");
    setMobileMenuOpen(false);
  }, []);

  const handleThreadCreated = useCallback((newId: string) => {
    streamManager.rekeyStream("new", newId);
    // Rekey the "new" slot to the real id so the same ThreadView
    // instance (and its useHybridChat state) carries through without
    // a remount. useHybridChat has explicit logic to preserve
    // optimistic state across this specific transition.
    setMountedSlots((prev) => {
      const hasReal = prev.some((s) => s.threadId === newId);
      if (hasReal) {
        // Real id already mounted somewhere (edge case): drop the
        // "new" slot to avoid duplicates.
        return prev.filter((s) => s.threadId !== "new");
      }
      return prev.map((s) => (s.threadId === "new" ? { ...s, threadId: newId } : s));
    });
    setActiveThreadId(newId);
    const path = `/chat/${newId}`;
    lastChatPathRef.current = path;
    nativePushState(null, "", path);
  }, []);

  const handleNotFound = useCallback(() => {
    setActiveThreadId("new");
    window.history.replaceState(null, "", "/chat");
  }, []);

  // Stable reference so ThreadView's React.memo holds across ChatLayout
  // re-renders. Previously this was an inline arrow, which meant all N
  // mounted keep-alive ThreadViews re-rendered every time ChatLayout did.
  const handleExitAgent = useCallback(() => {
    setActiveAgentId(undefined);
  }, []);

  const queryClient = useQueryClient();
  const [isStaggerDone, setIsStaggerDone] = useState(false);

  // Settings & Profile Logic
  const profile = useQuery(api.users.getProfile);

  // SSR-safe: defer cookie/window reads to useEffect to prevent hydration mismatch.
  // During SSR `document` and `window` are unavailable, so the initializer would
  // produce a different value on server vs client, causing React to discard the
  // server-rendered tree and re-render from scratch.
  const [selectedModel, setSelectedModel] = useState("");
  const [isClientReady, setIsClientReady] = useState(false);
  const currentModel = selectedModel || "gemini-3-flash-preview";

  const threads = useQuery(api.threads.list);
  const agents = useQuery(api.agents.list);

  // Prefer metadata from `threads.list` (already loaded for the sidebar) so
  // switching chats does not wait on a separate `threads.get` round-trip.
  // `list` is capped at 50, fall back to `get` when the active id is not
  // in that window (deep link / older thread).
  const needsActiveThreadGet =
    activeThreadId !== "new" &&
    threads !== undefined &&
    !threads.some((t) => t._id === activeThreadId);

  const activeThreadFromGet = useQuery(
    api.threads.get,
    needsActiveThreadGet ? { threadId: activeThreadId } : "skip",
  );

  const activeThreadRecord = useMemo(() => {
    if (activeThreadId === "new") return undefined;
    if (threads === undefined) return undefined;
    const fromList = threads.find((t) => t._id === activeThreadId);
    if (fromList) return fromList;
    return activeThreadFromGet;
  }, [activeThreadId, threads, activeThreadFromGet]);

  // Model is "loading" until we can resolve metadata (list row or fallback get).
  const isModelLoading =
    isClientReady &&
    activeThreadId !== "new" &&
    activeThreadRecord === undefined;

  // On client mount, read the persisted model from cookie.
  // Runs once after hydration so SSR and client initial render match.
  useEffect(() => {
    const match = document.cookie.match(/last_model=([^;]+)/);
    if (match) setSelectedModel(decodeURIComponent(match[1]));
    setIsClientReady(true);
  }, []);

  // Auto-apply the active thread's last-used model once the thread record
  // arrives. Centralised here (instead of per-ThreadView) so the multiple
  // mounted keep-alive views can't fight over `selectedModel`.
  const lastAppliedThreadId = useRef<string | null>(null);
  useEffect(() => {
    if (activeThreadId === "new") {
      lastAppliedThreadId.current = null;
      return;
    }
    if (
      activeThreadRecord !== undefined &&
      lastAppliedThreadId.current !== activeThreadId
    ) {
      lastAppliedThreadId.current = activeThreadId;
      if (activeThreadRecord?.lastModel) {
        setSelectedModel(activeThreadRecord.lastModel);
      }
    }
  }, [activeThreadId, activeThreadRecord]);

  // Persist model choice to cookie whenever it changes
  useEffect(() => {
    if (selectedModel) {
      document.cookie = `last_model=${encodeURIComponent(selectedModel)}; path=/; max-age=31536000`;
    }
  }, [selectedModel]);

  // 1. Add the optimistic logic to the mutation definition
  const updatePrefs = useMutation(
    api.users.updatePreferences,
  ).withOptimisticUpdate((localStore, args) => {
    const currentProfile = localStore.getQuery(api.users.getProfile, {});

    // If the profile query is already in the cache, patch it locally
    if (currentProfile) {
      localStore.setQuery(
        api.users.getProfile,
        {},
        {
          ...currentProfile,
          // Apply whichever preference was changed in the arguments
          favoriteModels:
            args.favoriteModels !== undefined
              ? args.favoriteModels
              : currentProfile.favoriteModels,
        },
      );
    }
  });

  // Lift the active-agent lookup out of the render JSX so the `name` and
  // `emoji` props to MountedSlotsView stay referentially stable across
  // unrelated ChatLayout re-renders (e.g. sidebar search, model dropdown).
  const activeAgent = useMemo(() => {
    if (!activeAgentId || !agents) return null;
    return agents.find((a) => a._id === activeAgentId) ?? null;
  }, [activeAgentId, agents]);
  const activeAgentName = activeAgent?.name;
  const activeAgentEmoji = activeAgent?.emoji;
  // Snapshot of the agent's prompt/included files passed down to ThreadView
  // so the client can forward it to the server on the first send of a new
  // thread. This eliminates the server's `getThreadContext` round-trip on
  // the TTFT-critical path. Memoised so its reference only changes when
  // the underlying agent content actually changes (preserving memo on
  // MountedSlotsView/ThreadView).
  const activeAgentSnapshot = useMemo(() => {
    if (!activeAgent) return undefined;
    return {
      systemPrompt: activeAgent.systemPrompt,
      includedFiles: activeAgent.includedFiles as string[] | undefined,
    };
  }, [activeAgent]);
  const togglePin = useMutation(api.threads.togglePin).withOptimisticUpdate(
    (localStore, args) => {
      const existingThreads = localStore.getQuery(api.threads.list);
      if (existingThreads !== undefined) {
        localStore.setQuery(
          api.threads.list,
          {},
          existingThreads.map((thread) =>
            thread._id === args.threadId
              ? { ...thread, isPinned: !thread.isPinned }
              : thread,
          ),
        );
      }
    },
  );

  const removeThread = useMutation(api.threads.remove).withOptimisticUpdate(
    (localStore, args) => {
      const existingThreads = localStore.getQuery(api.threads.list);
      if (existingThreads !== undefined) {
        localStore.setQuery(
          api.threads.list,
          {},
          existingThreads.filter((t) => t._id !== args.threadId),
        );
      }
    },
  );

  const handleDeleteThread = useCallback(
    (threadId: string) => {
      removeThread({ threadId: threadId as Id<"threads"> });
      // Drop the deleted thread from the keep-alive cache so its
      // ThreadView unmounts and its subscriptions are cleaned up.
      setMountedSlots((prev) => prev.filter((s) => s.threadId !== threadId));
      if (activeThreadIdRef.current === threadId) {
        handleNewChat(undefined);
      }
    },
    [removeThread, handleNewChat],
  );

  // Stable wrappers used by memoized ThreadItems so their props stay
  // referentially identical across ChatLayout re-renders.
  const handleTogglePinById = useCallback(
    (threadId: string) => {
      togglePin({ threadId: threadId as Id<"threads"> });
    },
    [togglePin],
  );

  // --- GLOBAL KEYBOARD SHORTCUTS ---
  // Bindings are defined in src/lib/keyboard/shortcuts.ts and can be
  // rebound by the user via /settings/keyboard. The manager dispatches
  // to the most recently registered handler per action.
  useKeyboardAction("open-search", useCallback(() => setSearchDialogOpen(true), []));
  useKeyboardAction(
    "new-chat",
    useCallback(() => handleNewChat(), [handleNewChat]),
  );
  useKeyboardAction(
    "toggle-sidebar",
    useCallback(() => {
      if (modeRef.current === "studio") {
        setMode("chat");
        nativePushState(null, "", lastChatPathRef.current);
        setActiveThreadId(parsePathname(lastChatPathRef.current).threadId);
      } else {
        setSidebarOpen((prev) => !prev);
      }
    }, []),
  );
  useKeyboardAction(
    "open-model-picker",
    useCallback(() => modelSelectorRef.current?.open(), []),
  );
  useKeyboardAction(
    "delete-chat",
    useCallback(() => {
      const id = activeThreadIdRef.current;
      if (id !== "new") handleDeleteThread(id);
    }, [handleDeleteThread]),
  );
  useKeyboardAction(
    "toggle-studio",
    useCallback(() => {
      if (modeRef.current === "studio") {
        setMode("chat");
        nativePushState(null, "", lastChatPathRef.current);
        setActiveThreadId(parsePathname(lastChatPathRef.current).threadId);
      } else {
        lastChatPathRef.current = window.location.pathname;
        setMode("studio");
        nativePushState(null, "", "/studio");
      }
    }, []),
  );
  useKeyboardAction(
    "focus-input",
    useCallback(() => {
      // Scope to the active slot, inactive ThreadViews are still in the
      // DOM (inactive slots use visibility:hidden) so a plain [data-chat-composer] selector would
      // sometimes grab the wrong one.
      const el = document.querySelector<HTMLTextAreaElement>(
        '[data-thread-slot-active="true"] [data-chat-composer]',
      );
      if (el) {
        el.focus();
        // Move the cursor to the end for nicer UX
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, []),
  );
  useKeyboardAction(
    "toggle-pin",
    useCallback(() => {
      const id = activeThreadIdRef.current;
      if (id === "new") return;
      togglePin({ threadId: id as Id<"threads"> });
    }, [togglePin]),
  );
  useKeyboardAction(
    "prev-thread",
    useCallback(() => {
      if (!threads || threads.length === 0) return;
      const idx = threads.findIndex(
        (t) => t._id === activeThreadIdRef.current,
      );
      const next =
        idx === -1
          ? threads[0]
          : threads[(idx - 1 + threads.length) % threads.length];
      if (next) handleSwitchChat(next._id);
    }, [threads, handleSwitchChat]),
  );
  useKeyboardAction(
    "next-thread",
    useCallback(() => {
      if (!threads || threads.length === 0) return;
      const idx = threads.findIndex(
        (t) => t._id === activeThreadIdRef.current,
      );
      const next =
        idx === -1 ? threads[0] : threads[(idx + 1) % threads.length];
      if (next) handleSwitchChat(next._id);
    }, [threads, handleSwitchChat]),
  );
  // Composer-level shortcuts: we reach into the rendered DOM so we don't
  // need to thread submit/stop callbacks through this giant component.
  useKeyboardAction(
    "send-message",
    useCallback(() => {
      // Scope to the active slot; see focus-input above.
      const el = document.querySelector<HTMLButtonElement>(
        '[data-thread-slot-active="true"] [data-chat-submit]',
      );
      if (el && !el.disabled) el.click();
    }, []),
  );
  useKeyboardAction(
    "stop-generation",
    useCallback(() => {
      const el = document.querySelector<HTMLButtonElement>(
        '[data-thread-slot-active="true"] [data-chat-stop]',
      );
      if (el && !el.disabled) el.click();
    }, []),
  );

  // 2. Simplified handler - the Optimistic Update handles the "instant" feel
  const handleToggleFavorite = useCallback(
    (modelId: string) => {
      if (!profile) return;

      const currentFavs = profile.favoriteModels || [];
      const isFavorited = currentFavs.includes(modelId);

      const newFavs = isFavorited
        ? currentFavs.filter((id) => id !== modelId)
        : [...currentFavs, modelId];

      updatePrefs({ favoriteModels: newFavs });
    },
    [profile, updatePrefs],
  );

  // Group threads by agent (with sidebar search filtering)
  const {
    pinnedThreads,
    threadsByAgent,
    uncategorizedThreads,
    totalUncategorized,
  } = useMemo(() => {
    type Thread = NonNullable<typeof threads>[number];
    const pinned: Thread[] = [];
    const grouped: Record<string, Thread[]> = {};
    const uncategorized: Thread[] = [];

    if (agents) {
      agents.forEach((a) => (grouped[a._id] = []));
    }

    const query = sidebarSearch.toLowerCase().trim();

    if (threads) {
      threads.forEach((t) => {
        // Filter by sidebar search
        if (query) {
          const title = (t.title || `Chat ${t._id.slice(-4)}`).toLowerCase();
          if (!title.includes(query)) return;
        }

        if (t.isPinned) {
          pinned.push(t);
        } else if (t.agentId && grouped[t.agentId]) {
          grouped[t.agentId].push(t);
        } else {
          uncategorized.push(t);
        }
      });
    }

    // Paginate uncategorized threads
    const total = uncategorized.length;
    const paginated = uncategorized.slice(
      0,
      (sidebarPage + 1) * SIDEBAR_PAGE_SIZE,
    );

    return {
      pinnedThreads: pinned,
      threadsByAgent: grouped,
      uncategorizedThreads: paginated,
      totalUncategorized: total,
    };
  }, [threads, agents, sidebarSearch, sidebarPage]);

  // Only prefetch messages for threads currently visible in the sidebar
  const visibleThreadIds = useMemo(() => {
    const ids = new Set<string>();
    pinnedThreads.forEach((t) => ids.add(t._id));
    if (agents) {
      agents.forEach((a) => {
        (threadsByAgent[a._id] || []).forEach((t) => ids.add(t._id));
      });
    }
    uncategorizedThreads.forEach((t) => ids.add(t._id));
    return ids;
  }, [pinnedThreads, threadsByAgent, uncategorizedThreads, agents]);

  // Stable string signature of the visible thread IDs. Convex re-hands the
  // `threads` array on every push, rename, pin, `lastMessageAt` bump (which
  // fires on every stream token), etc., which also re-allocates
  // `visibleThreadIds` as a fresh Set. If we depend on either of those
  // directly, the prefetch loop runs several times per second during a
  // stream, each time creating QueryObservers and hashing keys. We hash
  // them into a stable string so the effect only fires when the SET of
  // visible IDs actually changes (scroll/search/new-thread), not when
  // existing thread metadata updates.
  const visibleIdsSignature = useMemo(
    () => Array.from(visibleThreadIds).sort().join("|"),
    [visibleThreadIds],
  );

  useEffect(() => {
    if (visibleThreadIds.size === 0) return;
    for (const threadId of visibleThreadIds) {
      const opts = convexQuery(api.messages.getMessages, { threadId });
      // Already cached, skip. Avoids kicking QueryObservers on every fire.
      if (queryClient.getQueryState(opts.queryKey)?.data !== undefined) {
        continue;
      }
      queryClient.prefetchQuery({
        ...opts,
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10,
      });
    }
    // Intentionally depend on the stable signature, not `visibleThreadIds`
    // or `threads`. See comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdsSignature, queryClient]);

  // Reset pagination when sidebar search changes
  useEffect(() => {
    setSidebarPage(0);
  }, [sidebarSearch]);

  const toggleAgent = (agentId: string) => {
    setExpandedAgents((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  // Failsafe to ensure subsequent interactions (pinning/agents) aren't hidden
  useEffect(() => {
    if (threads !== undefined && agents !== undefined) {
      const timer = setTimeout(() => setIsStaggerDone(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [threads, agents]);

  // Extract sidebar content for reuse in both Desktop Aside and Mobile Sheet
  const renderSidebar = () => (
    <>
      <div className="flex flex-col gap-2 relative m-1 mb-0 space-y-1 shrink-0">
        <div className="flex items-center justify-between px-2">
          <h1 className="text-color-heading">
            <span className="sr-only">AgentChat</span>
            <svg
              viewBox="0 0 366.53 65.4"
              height={22}
              aria-hidden="true"
              className="shrink-0 w-auto"
              fill="currentColor"
            >
              <path d="M23.26,62.85l-10.91,2.31c-8.64,1.83-15.37-7.44-10.95-15.09L27.36,5.1c3.93-6.8,13.75-6.8,17.68,0l25.96,44.97c4.42,7.65-2.31,16.92-10.95,15.09l-10.91-2.31c-8.53-1.81-17.35-1.81-25.88,0Z" />
              <path d="M109.55,18.25c3.63,0,7.26,1.37,9.52,3.81v-3.33h5.71v29.76h-5.71v-3.21c-2.26,2.5-5.89,3.75-9.52,3.75-20.12,0-20.12-30.77,0-30.77ZM109.55,43.25c12.5,0,12.5-19.23,0-19.23s-12.56,19.23,0,19.23Z" />
              <path d="M144.67,18.25c3.63,0,7.26,1.37,9.52,3.81v-3.33h6.07v23.1c-.36,11.79-6.9,15.89-15.24,15.89h-9.46v-5.48h9.46c4.29,0,8.45-2.32,9.23-6.96h-.54c-1.9,2.92-5.42,3.75-9.05,3.75-20.12,0-20.12-30.77,0-30.77ZM144.67,43.25c12.5,0,12.5-19.23,0-19.23s-12.56,19.23,0,19.23Z" />
              <path d="M165.03,33.48c0-19.64,30.54-20.77,30.06-.06l-.06,2.62h-23.75c.83,6.79,11.67,9.64,16.79,4.58l3.81,3.87c-9.76,9.23-26.85,2.62-26.85-11.01ZM189.32,30.63c-2.44-10.83-17.02-8.33-18.27,0h18.27Z" />
              <path d="M199.92,48.48v-29.7h6.13v3.93c6.73-8.21,21.31-3.75,21.31,6.07v19.7h-6.07v-17.5c-.18-8.81-15.06-8.16-15.06.65v16.85h-6.31Z" />
              <path d="M241.88,24.2v11.85c0,3.51-.18,6.37,6.31,6.37v6.07c-9.82,0-12.44-5.6-12.44-12.44v-11.85h-4.23v-5.48h4.23V6.82h6.13v11.9h6.31v5.48h-6.31Z" />
              <path d="M256.29,44.5c-6.01-6.01-6.01-15.71,0-21.79,6.01-5.95,15.83-5.95,21.79,0l-4.23,4.29c-8.81-8.69-22.02,4.52-13.27,13.21,3.69,3.63,9.64,3.63,13.27,0l4.23,4.29c-5.95,5.95-15.77,5.95-21.79,0Z" />
              <path d="M282.84,48.48V6.76h6.13v15.89c5.65-8.15,21.61-3.75,21.61,7.02v18.81h-6.37v-17.38c-.18-8.81-14.41-8.27-15.06.54v16.85h-6.31Z" />
              <path d="M330.46,18.25c3.63,0,7.26,1.37,9.52,3.81v-3.33h5.71v29.76h-5.71v-3.21c-2.26,2.5-5.89,3.75-9.52,3.75-20.12,0-20.12-30.77,0-30.77ZM330.46,43.25c12.5,0,12.5-19.23,0-19.23s-12.56,19.23,0,19.23Z" />
              <path d="M360.22,24.2v11.85c0,3.51-.18,6.37,6.31,6.37v6.07c-9.82,0-12.44-5.6-12.44-12.44v-11.85h-4.23v-5.48h4.23V6.82h6.13v11.9h6.31v5.48h-6.31Z" />
            </svg>
          </h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="hidden md:inline-flex items-center justify-center size-7 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Close sidebar (⌘B)"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-2 px-1 mt-2">
          <button
            onClick={() => handleNewChat()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary p-2 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 h-9 px-4 py-2 w-full text-sm button-reflect border-reflect transition-all active:scale-95"
          >
            <Plus size={16} className="opacity-70" />
            New Chat
          </button>
          <button
            onClick={() => {
              if (mode === "studio") {
                setMode("chat");
                nativePushState(null, "", lastChatPathRef.current);
                setActiveThreadId(parsePathname(lastChatPathRef.current).threadId);
              } else {
                lastChatPathRef.current = window.location.pathname;
                setMode("studio");
                nativePushState(null, "", "/studio");
              }
              setMobileMenuOpen(false);
            }}
            className={`inline-flex items-center justify-between gap-2 rounded-lg p-2 font-medium h-9 px-4 py-2 w-full text-sm border transition-all duration-200 active:scale-95 ${
              mode === "studio"
                ? "bg-studio-accent/10 text-studio-accent border-studio-accent/30"
                : "bg-secondary text-secondary-foreground border-border/50 hover:bg-accent"
            }`}
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              <ImageIcon size={16} className="opacity-70 shrink-0" />
              Image Studio
            </span>
            <span
              className="shrink-0 rounded border border-border/60 bg-background/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
              aria-hidden
            >
              Beta
            </span>
          </button>
        </div>

        {/* Sidebar Search */}
        <div className="relative px-1 mt-2">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
          />
          <input
            type="text"
            placeholder="Search chats..."
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-sidebar-accent/40 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:bg-sidebar-accent/60 transition-colors"
          />
          {sidebarSearch && (
            <button
              onClick={() => setSidebarSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto mt-4 px-2 space-y-1 firefox-scrollbar-margin-fix">
        {threads === undefined || agents === undefined ? (
          <div className="animate-pulse space-y-2 px-2 mt-4">
            <div className="h-8 bg-muted/50 rounded-md w-full"></div>
            <div className="h-8 bg-muted/50 rounded-md w-4/5"></div>
            <div className="h-8 bg-muted/50 rounded-md w-3/4"></div>
          </div>
        ) : (
          <motion.div
            variants={sidebarContainerVariants}
            initial="hidden"
            animate="visible"
            onAnimationComplete={() => setIsStaggerDone(true)}
          >
            {pinnedThreads.length > 0 && (
              <>
                <motion.div
                  variants={sidebarItemVariants}
                  initial={isStaggerDone ? false : undefined}
                  className="px-2 text-xs font-semibold text-muted-foreground mb-2 tracking-wider uppercase flex items-center gap-1.5"
                >
                  <Pin size={12} className="text-muted-foreground/60" />
                  Pinned
                </motion.div>
                {pinnedThreads.map((thread) => (
                  <motion.div
                    key={thread._id}
                    layoutId={`thread-${thread._id}`}
                    variants={sidebarItemVariants}
                    initial={isStaggerDone ? false : undefined}
                  >
                    <ThreadItem
                      thread={thread}
                      isActive={thread._id === activeThreadId}
                      onTogglePin={handleTogglePinById}
                      onSelect={handleSwitchChat}
                      onDelete={handleDeleteThread}
                    />
                  </motion.div>
                ))}
                <motion.div
                  variants={sidebarItemVariants}
                  initial={isStaggerDone ? false : undefined}
                  className="my-3 mx-2 h-px bg-border/50"
                />
              </>
            )}

            <motion.div
              variants={sidebarItemVariants}
              initial={isStaggerDone ? false : undefined}
              className="flex items-center justify-between px-2 mb-2 mt-4"
            >
              <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                Agents
              </span>
              <button
                onClick={() => setAgentDialogOpen(true)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
                title="Create Agent"
              >
                <Bot size={14} />
              </button>
            </motion.div>

            {agents.map((agent) => {
              const isExpanded = expandedAgents[agent._id] !== false;
              const agentThreads = threadsByAgent[agent._id] || [];
              const isActiveAgent = activeAgentId === agent._id;
              return (
                <motion.div
                  key={agent._id}
                  layoutId={`agent-${agent._id}`}
                  variants={sidebarItemVariants}
                  initial={isStaggerDone ? false : undefined}
                  className="mb-1"
                >
                  <div
                    className={`agent-sidebar-row group relative flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer text-sm font-medium text-sidebar-foreground transition-all duration-200 overflow-hidden ${
                      isActiveAgent
                        ? "bg-sidebar-accent/70"
                        : "hover:bg-sidebar-accent/50"
                    }`}
                    onClick={() => toggleAgent(agent._id)}
                  >
                    <div className="flex items-center gap-2 overflow-hidden pr-12">
                      <motion.div
                        animate={{ rotate: isExpanded ? 0 : -90 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="shrink-0"
                      >
                        <ChevronDown
                          size={14}
                          className="text-muted-foreground"
                        />
                      </motion.div>
                      <div
                        className={`shrink-0 flex items-center justify-center size-5 rounded-md transition-colors duration-200 ${
                          isActiveAgent
                            ? "bg-primary/10"
                            : "group-hover:bg-primary/5"
                        }`}
                      >
                        <span className="text-[13px] leading-none select-none">
                          {agent.emoji || DEFAULT_AGENT_EMOJI}
                        </span>
                      </div>
                      <span className="truncate">{agent.name}</span>
                      {agentThreads.length > 0 && (
                        <span className="text-[10px] text-muted-foreground/40 font-medium tabular-nums">
                          {agentThreads.length}
                        </span>
                      )}
                    </div>

                    <div
                      className="absolute right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-sidebar-background group-hover:bg-sidebar-accent/50 pl-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleNewChat(agent._id)}
                        className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                        title="New Chat with Agent"
                      >
                        <Plus size={14} />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors">
                            <MoreHorizontal size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            onClick={() => setAgentToEdit(agent)}
                          >
                            <Edit size={14} className="mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:bg-destructive/10"
                            onClick={() => {
                              deleteAgent({
                                agentId: agent._id as Id<"agents">,
                              });
                              if (activeAgentId === agent._id)
                                handleNewChat(undefined);
                            }}
                          >
                            <Trash size={14} className="mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key={`agent-content-${agent._id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        style={{ overflow: "hidden" }}
                      >
                        <div className="ml-4 pl-2 border-l agent-expand-bar space-y-0.5 mt-0.5">
                          {agentThreads.length === 0 ? (
                            <div className="px-2 py-2 text-xs text-muted-foreground/40 italic flex items-center gap-1.5">
                              <div className="size-1 rounded-full bg-muted-foreground/20" />
                              No conversations yet
                            </div>
                          ) : (
                            agentThreads.map((thread) => (
                              <motion.div
                                key={thread._id}
                                layoutId={`thread-${thread._id}`}
                                variants={sidebarItemVariants}
                                initial={isStaggerDone ? false : undefined}
                              >
                                <ThreadItem
                                  thread={thread}
                                  isActive={thread._id === activeThreadId}
                                  onTogglePin={handleTogglePinById}
                                  onSelect={handleSwitchChat}
                                  onDelete={handleDeleteThread}
                                />
                              </motion.div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}

            <motion.div
              variants={sidebarItemVariants}
              initial={isStaggerDone ? false : undefined}
              className="my-3 mx-2 h-px bg-border/50"
            />

            <motion.div
              variants={sidebarItemVariants}
              initial={isStaggerDone ? false : undefined}
              className="px-2 text-xs font-semibold text-muted-foreground mb-2 mt-4 tracking-wider uppercase"
            >
              Recent Chats
            </motion.div>

            {uncategorizedThreads.length === 0 ? (
              <motion.div
                variants={sidebarItemVariants}
                initial={isStaggerDone ? false : undefined}
                className="px-2 text-sm text-muted-foreground/60 italic"
              >
                {sidebarSearch ? "No matching chats." : "No recent chats."}
              </motion.div>
            ) : (
              <>
                {uncategorizedThreads.map((thread) => (
                  <motion.div
                    key={thread._id}
                    layoutId={`thread-${thread._id}`}
                    variants={sidebarItemVariants}
                    initial={isStaggerDone ? false : undefined}
                  >
                    <ThreadItem
                      thread={thread}
                      isActive={thread._id === activeThreadId}
                      onTogglePin={handleTogglePinById}
                      onSelect={handleSwitchChat}
                      onDelete={handleDeleteThread}
                    />
                  </motion.div>
                ))}
                {uncategorizedThreads.length < totalUncategorized && (
                  <motion.div
                    variants={sidebarItemVariants}
                    initial={isStaggerDone ? false : undefined}
                    className="pt-1 px-1"
                  >
                    <button
                      onClick={() => setSidebarPage((p) => p + 1)}
                      className="w-full text-xs font-medium text-primary hover:text-primary/80 py-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors"
                    >
                      Load more (
                      {totalUncategorized - uncategorizedThreads.length}{" "}
                      remaining)
                    </button>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}
      </nav>

      <div className="p-3 mt-auto flex items-center justify-between shrink-0">
        {profile === undefined ? (
          <div className="flex items-center gap-2 p-2 flex-1 min-w-0">
            <Skeleton className="size-7 rounded-full shrink-0" />
            <Skeleton className="h-4 w-24 rounded-md" />
          </div>
        ) : profile === null ? (
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setSignInDialogOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg hover:bg-sidebar-accent/50 p-2 cursor-pointer transition-colors flex-1 min-w-0 text-left"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-primary/80 to-primary flex items-center justify-center text-primary-foreground shadow-sm shrink-0">
              <LogIn size={14} />
            </div>
            <span className="text-sm font-medium text-sidebar-foreground truncate">
              Sign in
            </span>
          </button>
        ) : (
          <Link
            to="/settings/account"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 rounded-lg hover:bg-sidebar-accent/50 p-2 cursor-pointer transition-colors flex-1 min-w-0"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-primary/80 to-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shadow-sm shrink-0">
              {profile?.name?.charAt(0).toUpperCase() || "U"}
            </div>
            <span className="text-sm font-medium text-sidebar-foreground truncate">
              {profile?.name || "My Account"}
            </span>
          </Link>
        )}
        {profile?.role === "admin" && (
          <a
            href="/admin"
            className="p-2 ml-1 shrink-0 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
            title="Admin Dashboard"
          >
            <ShieldAlert size={18} />
          </a>
        )}
      </div>
    </>
  );

  return (
    <MobileInputFocusContext.Provider value={mobileInputFocusContextValue}>
      <div
        className="group/sidebar-wrapper absolute inset-0 flex w-full bg-sidebar overflow-hidden"
        style={{ "--sidebar-width": "16rem" } as React.CSSProperties}
      >
        <Outlet />

        {/* Sidebar outer wrapper, collapses via margin so main content slides smoothly on GPU */}
        <motion.div
          initial={false}
          animate={{
            marginLeft: mode === "studio" || sidebarOpen
              ? 0
              : "calc(var(--sidebar-width) * -1)",
            width: mode === "studio" ? "20rem" : "var(--sidebar-width)",
          }}
          transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
          className="hidden md:block shrink-0 overflow-hidden"
          // Explicit style ensures correct width on first SSR paint
          // (Framer Motion may not apply animate values server-side)
          style={{
            width: mode === "studio" ? "20rem" : "var(--sidebar-width)",
          }}
        >
          <aside className="relative flex flex-col z-50 h-svh w-full">
            {/* Studio sidebar layer, only mount on server if mode=studio,
                otherwise defer to after hydration to avoid SSR flash */}
            {(mode === "studio" || hasMounted) && (
              <motion.div
                initial={false}
                animate={{
                  opacity: mode === "studio" ? 1 : 0,
                  x: mode === "studio" ? 0 : -20,
                }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-0 z-10 flex flex-col"
                style={{ pointerEvents: mode === "studio" ? "auto" : "none" }}
              >
                <ImageStudioSidebar
                  prompt={studio.prompt}
                  setPrompt={studio.setPrompt}
                  selectedModel={studio.selectedModel}
                  setSelectedModel={studio.setSelectedModel}
                  aspectRatio={studio.aspectRatio}
                  setAspectRatio={studio.setAspectRatio}
                  resolution={studio.resolution}
                  setResolution={studio.setResolution}
                  textareaRef={studio.textareaRef}
                  pending={studio.pending}
                  handleGenerate={studio.handleGenerate}
                  estCost={studio.estCost}
                  references={studio.references}
                  handleAddReferences={studio.handleAddReferences}
                  handleRemoveReference={studio.handleRemoveReference}
                  handleClearReferences={studio.handleClearReferences}
                  fileInputRef={studio.fileInputRef}
                  modelSupportsRefs={studio.modelSupportsRefs}
                  onBack={() => {
                    setMode("chat");
                    nativePushState(null, "", lastChatPathRef.current);
                    setActiveThreadId(parsePathname(lastChatPathRef.current).threadId);
                  }}
                />
              </motion.div>
            )}

            {/* Chat sidebar layer, only mount on server if mode=chat,
                otherwise defer to after hydration */}
            {(mode === "chat" || hasMounted) && (
              <motion.div
                initial={false}
                animate={{
                  opacity: mode === "chat" ? 1 : 0,
                  x: mode === "chat" ? 0 : 20,
                }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-0 z-0 flex flex-col p-2"
                style={{ pointerEvents: mode === "chat" ? "auto" : "none" }}
              >
                {renderSidebar()}
              </motion.div>
            )}
          </aside>
        </motion.div>

        {/* Floating sidebar open toggle, visible when sidebar is closed (chat mode only) */}
        <AnimatePresence>
          {!sidebarOpen && mode === "chat" && (
            <motion.button
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1], delay: 0.1 }}
              onClick={() => setSidebarOpen(true)}
              className="hidden md:inline-flex fixed top-3 left-3 z-[60] items-center justify-center size-9 rounded-xl bg-sidebar border border-border/60 text-muted-foreground shadow-lg shadow-black/10 hover:text-foreground hover:bg-sidebar-accent transition-colors backdrop-blur-sm"
              title="Open sidebar (⌘B)"
            >
              <PanelLeftOpen size={18} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* MAIN CHAT AREA */}
        <main className="relative flex w-full flex-1 flex-col overflow-y-clip bg-chat-background">
          {/* Global Layout Decorators */}
          <div className="absolute inset-0 w-full overflow-hidden bg-chat-background transition-all ease-snappy sm:border-t sm:border-l sm:border-chat-border sm:translate-y-3.5 sm:rounded-tl-xl z-0">
            <div className="bg-noise absolute inset-0 -top-3.5 bg-bottom-right transition-transform ease-snappy opacity-[0.03] mix-blend-overlay"></div>
          </div>

          {/* Mobile Top Bar */}
          <div
            className="absolute top-0 left-0 right-0 z-50 md:hidden bg-chat-background/80 backdrop-blur-lg border-b border-chat-border/30"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <button className="shrink-0 inline-flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                    <PanelLeft size={20} />
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[85vw] max-w-[320px] p-0 flex flex-col bg-sidebar"
                  showCloseButton={false}
                >
                  <SheetTitle className="sr-only">
                    {mode === "studio" ? "Studio Settings" : "Menu"}
                  </SheetTitle>
                  <SheetDescription className="sr-only">
                    {mode === "studio"
                      ? "Configure image generation settings"
                      : "Navigation Menu"}
                  </SheetDescription>
                  {mode === "studio" ? (
                    <ImageStudioSidebar
                      prompt={studio.prompt}
                      setPrompt={studio.setPrompt}
                      selectedModel={studio.selectedModel}
                      setSelectedModel={studio.setSelectedModel}
                      aspectRatio={studio.aspectRatio}
                      setAspectRatio={studio.setAspectRatio}
                      resolution={studio.resolution}
                      setResolution={studio.setResolution}
                      textareaRef={studio.textareaRef}
                      pending={studio.pending}
                      handleGenerate={studio.handleGenerate}
                      estCost={studio.estCost}
                      references={studio.references}
                      handleAddReferences={studio.handleAddReferences}
                      handleRemoveReference={studio.handleRemoveReference}
                      handleClearReferences={studio.handleClearReferences}
                      fileInputRef={studio.fileInputRef}
                      modelSupportsRefs={studio.modelSupportsRefs}
                      onBack={() => {
                        setMode("chat");
                        nativePushState(null, "", lastChatPathRef.current);
                        setActiveThreadId(parsePathname(lastChatPathRef.current).threadId);
                        setMobileMenuOpen(false);
                      }}
                    />
                  ) : (
                    <div className="flex flex-col h-full p-2">
                      {renderSidebar()}
                    </div>
                  )}
                </SheetContent>
              </Sheet>

              <AnimatePresence mode="wait" initial={false}>
                {mode === "studio" ? (
                  <motion.h2
                    key="studio-label"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="text-sm font-semibold text-foreground flex items-center gap-2"
                  >
                    Image Studio
                    <span className="text-[9px] font-semibold text-studio-accent bg-studio-accent/10 px-1.5 py-0.5 rounded-md">
                      Beta
                    </span>
                  </motion.h2>
                ) : (
                  <motion.button
                    key="model-label"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    type="button"
                    onClick={() => modelSelectorRef.current?.open()}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    {!isClientReady || isModelLoading ? (
                      <span className="inline-block h-3.5 w-20 animate-pulse rounded bg-muted-foreground/20" />
                    ) : (
                      <span className="truncate max-w-[180px]">
                        {
                          (MODELS.find((m) => m.id === currentModel) || MODELS[1])
                            .name
                        }
                      </span>
                    )}
                    <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                  </motion.button>
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait" initial={false}>
                {mode === "studio" ? (
                  <motion.div
                    key="studio-spacer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="size-9"
                  />
                ) : (
                  <motion.button
                    key="new-chat-btn"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => handleNewChat()}
                    className="shrink-0 inline-flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <SquarePen size={18} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Main content, clean swap between Studio and Chat */}
          {mode === "studio" ? (
            <div className="absolute inset-0 z-20 flex flex-col max-sm:mt-12 mt-3.5">
              <ImageStudioContent
                gridItems={studio.gridItems}
                pending={studio.pending}
                handleDelete={studio.handleDelete}
              />
            </div>
          ) : (
            <MountedSlotsView
              mountedSlots={deferredMountedSlots}
              activeThreadId={deferredActiveThreadId}
              onThreadCreated={handleThreadCreated}
              onNotFound={handleNotFound}
              profile={profile}
              onToggleFavorite={handleToggleFavorite}
              activeAgentId={activeAgentId}
              activeAgentName={activeAgentName}
              activeAgentEmoji={activeAgentEmoji}
              activeAgentSnapshot={activeAgentSnapshot}
              onExitAgent={handleExitAgent}
              currentModel={currentModel}
              setSelectedModel={setSelectedModel}
              modelSelectorRef={modelSelectorRef}
              onBranch={handleBranch}
              pendingBranchMessageRef={pendingBranchMessageRef}
              isModelLoading={isModelLoading}
            />
          )}
        </main>

        <CreateAgentDialog
          open={agentDialogOpen}
          onOpenChange={setAgentDialogOpen}
        />
        <EditAgentDialog
          agent={agentToEdit}
          open={!!agentToEdit}
          onOpenChange={(open) => !open && setAgentToEdit(null)}
        />

        {/* ⌘K Search Dialog */}
        <ChatSearchDialog
          open={searchDialogOpen}
          onOpenChange={setSearchDialogOpen}
          threads={threads}
          onSelect={(id) => {
            handleSwitchChat(id);
            setSearchDialogOpen(false);
          }}
          onNewChat={() => {
            handleNewChat();
            setSearchDialogOpen(false);
          }}
        />

        {/* Studio auth gate dialog */}
        <SignInDialog
          open={studioSignInOpen}
          onOpenChange={setStudioSignInOpen}
        />

        {/* Sidebar sign-in dialog (opens from the sidebar profile area) */}
        <SignInDialog
          open={signInDialogOpen}
          onOpenChange={setSignInDialogOpen}
        />
      </div>
    </MobileInputFocusContext.Provider>
  );
}

// --- GENERATING INDICATOR (scramble text while waiting for output) ---
const GENERATING_PHRASES = [
  "Thinking it through",
  "Putting thoughts together",
  "Working on it",
  "Reasoning for you",
  "Almost there",
  "Crafting a response",
  "Piecing it together",
];

function GeneratingIndicator() {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [scrambleChars, setScrambleChars] = useState("");
  const frameRef = useRef<number | null>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const phrase = GENERATING_PHRASES[phraseIdx];
    let revealedCount = 0;
    let tick = 0;

    const scrambleAlphabet = "abcdefghijklmnopqrstuvwxyz";
    const randomChar = () =>
      scrambleAlphabet[Math.floor(Math.random() * scrambleAlphabet.length)];

    const animate = () => {
      tick++;
      // Reveal one real character every ~3 frames (~50ms at 60fps)
      if (tick % 3 === 0 && revealedCount < phrase.length) {
        revealedCount++;
      }

      const revealed = phrase.slice(0, revealedCount);
      const remainingLen = phrase.length - revealedCount;
      const scrambled = Array.from({ length: remainingLen }, () =>
        randomChar(),
      ).join("");

      setDisplayed(revealed);
      setScrambleChars(scrambled);

      if (revealedCount < phrase.length) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        // Pause on completed phrase, then move to next
        setTimeout(() => {
          setPhraseIdx((i) => (i + 1) % GENERATING_PHRASES.length);
        }, 2000);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [phraseIdx]);

  // Show elapsed time after 5 seconds
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-0 my-4 flex items-center gap-2.5 text-sm text-muted-foreground/70">
      <div className="relative flex items-center justify-center h-4 w-4 shrink-0">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
      </div>
      <span className="font-medium">
        {displayed}
        <span className="text-muted-foreground/30">{scrambleChars}</span>
      </span>
      {elapsed >= 5 && (
        <span className="text-[11px] text-muted-foreground/40 tabular-nums">
          {elapsed}s
        </span>
      )}
    </div>
  );
}

// --- THREAD SIDEBAR ITEM ---
// Memoized so the sidebar's N thread items don't all re-render when
// `activeThreadId` changes. With stable callbacks (onSelect/onTogglePin/
// onDelete) + a primitive `isActive` prop, only the two items whose
// active state flipped re-render on a switch.
const ThreadItem = memo(function ThreadItem({
  thread,
  isActive,
  onTogglePin,
  onSelect,
  onDelete,
}: {
  thread: {
    _id: string;
    isPinned?: boolean;
    isGenerating?: boolean;
    title?: string;
  };
  isActive: boolean;
  onTogglePin: (id: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const activeStreamIds = useActiveStreamIds();
  // Client-side StreamManager is the primary source; thread.isGenerating from DB
  // is the fallback for fresh page loads / other devices where StreamManager is empty.
  // If user explicitly stopped this thread, never show spinner regardless of DB state.
  const wasStopped = streamManager.wasExplicitlyStopped(thread._id);
  const isStreaming = wasStopped
    ? false
    : activeStreamIds.includes(thread._id) || (thread.isGenerating ?? false);

  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onSelect(thread._id);
    },
    [onSelect, thread._id],
  );

  // Hover/focus prefetch. The bulk prefetch in ChatLayout only covers
  // the initial set of visible threads; once the user scrolls the
  // sidebar or opens ⌘K, newly-revealed rows have no warm cache until
  // they're clicked. Prefetching on intent (hover/focus) means the
  // messages query is usually already resolved by the time the click
  // lands, so `useHybridChat` returns messages synchronously with zero
  // round-trip.
  //
  // We only prefetch if data isn't already fresh in the cache, this
  // is a no-op once warm, and the staleTime check avoids thrashing
  // the query when the mouse sweeps across many rows.
  const queryClientForPrefetch = useQueryClient();
  const handlePrefetch = useCallback(() => {
    const opts = convexQuery(api.messages.getMessages, {
      threadId: thread._id,
    });
    queryClientForPrefetch.prefetchQuery({
      ...opts,
      staleTime: 1000 * 60 * 5,
    });
  }, [queryClientForPrefetch, thread._id]);

  const handleTogglePinClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onTogglePin(thread._id);
    },
    [onTogglePin, thread._id],
  );
  const handleTogglePinMenu = useCallback(() => {
    onTogglePin(thread._id);
  }, [onTogglePin, thread._id]);
  const handleDelete = useCallback(() => {
    onDelete(thread._id);
  }, [onDelete, thread._id]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="relative group">
          <a
            href={`/chat/${thread._id}`}
            onClick={handleSelect}
            onMouseEnter={handlePrefetch}
            onFocus={handlePrefetch}
            onTouchStart={handlePrefetch}
            className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors pr-8 ${
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}
          >
            {isStreaming && (
              <Loader2
                size={12}
                className="shrink-0 animate-spin text-primary"
              />
            )}
            <span className="truncate">
              {thread.title || `Chat ${thread._id.slice(-4)}`}
            </span>
          </a>
          <button
            onClick={handleTogglePinClick}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted/60 text-muted-foreground transition-opacity"
            title={thread.isPinned ? "Unpin" : "Pin"}
          >
            {thread.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48 z-[60]">
        <ContextMenuItem onClick={handleTogglePinMenu} className="cursor-pointer">
          {thread.isPinned ? (
            <PinOff className="mr-2 size-4" />
          ) : (
            <Pin className="mr-2 size-4" />
          )}
          {thread.isPinned ? "Unpin Chat" : "Pin Chat"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={handleDelete}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
        >
          <Trash2 className="mr-2 size-4" />
          Delete Chat
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

// --- ⌘K SEARCH DIALOG ---
function ChatSearchDialog({
  open,
  onOpenChange,
  threads,
  onSelect,
  onNewChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threads: { _id: string; title?: string; isPinned?: boolean }[] | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!threads) return [];
    const q = query.toLowerCase().trim();
    if (!q) return threads.slice(0, 20);
    return threads
      .filter((t) => {
        const title = (t.title || `Chat ${t._id.slice(-4)}`).toLowerCase();
        return title.includes(q);
      })
      .slice(0, 20);
  }, [threads, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex === 0) {
        onNewChat();
      } else if (filtered[selectedIndex - 1]) {
        onSelect(filtered[selectedIndex - 1]._id);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg p-0 gap-0 overflow-hidden"
      >
        <DialogTitle className="sr-only">Search Chats</DialogTitle>
        <DialogDescription className="sr-only">
          Search through your chat history
        </DialogDescription>
        <div className="flex items-center border-b border-border px-4 py-3">
          <Search
            size={16}
            className="text-muted-foreground/60 mr-3 shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search chats..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-[360px] overflow-y-auto py-1">
          {/* New Chat option always first */}
          <button
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
              selectedIndex === 0
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50"
            }`}
            onClick={onNewChat}
            onMouseEnter={() => setSelectedIndex(0)}
          >
            <Plus size={14} className="shrink-0" />
            <span className="font-medium">New Chat</span>
            <kbd className="ml-auto hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
              <span className="text-[11px]">⌘</span>⇧O
            </kbd>
          </button>

          {filtered.length === 0 && query && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">
              No chats found for &ldquo;{query}&rdquo;
            </div>
          )}

          {filtered.map((thread, i) => (
            <button
              key={thread._id}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                selectedIndex === i + 1
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50"
              }`}
              onClick={() => onSelect(thread._id)}
              onMouseEnter={() => setSelectedIndex(i + 1)}
            >
              <span className="truncate">
                {thread.title || `Chat ${thread._id.slice(-4)}`}
              </span>
              {thread.isPinned && (
                <Pin size={10} className="shrink-0 text-muted-foreground/40" />
              )}
            </button>
          ))}
        </div>
        <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[11px] text-muted-foreground/50">
          <span className="flex items-center gap-1">
            <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 text-[10px]">
              ↑↓
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 text-[10px]">
              ↵
            </kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 text-[10px]">
              esc
            </kbd>
            close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PendingAttachment {
  id: string;
  file: File;
  isUploading: boolean;
  uploadedId?: string;
  previewUrl?: string;
  error?: string;
  source: "upload" | "clipboard";
  contextEstimate?: AttachmentContextEstimate;
  contextReady?: boolean; // true once uploaded + context estimated
  showCheckmark?: boolean; // triggers the checkmark pop animation
}

function formatContextLimit(limit: number) {
  if (limit >= 1_000_000) {
    return `${(limit / 1_000_000).toFixed(0)}M`;
  }

  return `${(limit / 1_000).toFixed(0)}k`;
}

function formatImageDimensions(dimensions?: { width: number; height: number }) {
  if (!dimensions) return null;
  return `${dimensions.width} x ${dimensions.height}`;
}

// Stable animation constants to prevent re-creating objects every render
const ANIMATE_IN = { opacity: 0, y: 12 };
const ANIMATE_VISIBLE = { opacity: 1, y: 0 };
const ANIMATE_TRANSITION = {
  duration: 0.3,
  ease: [0.25, 0.1, 0.25, 1] as const,
};
const DEFAULT_REASONING_STATE = {
  isThinking: true,
  fullText: "",
  displayedText: "",
} as const;

// --- MEMOIZED MESSAGE ITEM ---
const ChatMessageItem = memo(function ChatMessageItem({
  msg,
  index,
  isEditing,
  editingText,
  setEditingText,
  setEditingMessageIndex,
  threadId,
  onBranch,
  searchState,
  isLastMessage,
  currentModelSupportsReasoning,
}: {
  msg: OptimisticMessage;
  index: number;
  isEditing: boolean;
  editingText: string;
  setEditingText: (v: string) => void;
  setEditingMessageIndex: (v: number | null) => void;
  threadId: string;
  onBranch: (
    originalThreadId: string,
    cutoffMessageIndex: number,
    editedText: string,
  ) => Promise<void>;
  searchState: SearchState | null;
  isLastMessage: boolean;
  currentModelSupportsReasoning: boolean;
}) {
  const isUser = msg.role === "user";
  const shouldAnimate = msg.isGenerating || msg._id.startsWith("opt-");
  const hasUserText = Boolean(msg.parts[0]?.trim());

  // Memoize the persisted search meta to avoid rebuilding on every render
  const persistedMeta = useMemo(() => {
    if (!msg.searchMeta?.steps?.length) return null;
    return {
      active: true,
      done: true,
      steps: msg.searchMeta.steps.map((s: any) => ({
        id: s.id,
        tool: s.tool,
        label: s.label,
        input: s.input,
        status: s.status,
        result: s.result,
        sourceCount: s.sourceCount,
        sources: s.sources,
        agents: s.agents,
        error: s.error,
      })),
      startedAt: msg._id ? 0 : 0, // stable value, not Date.now()
      finishedAt: 0,
    };
  }, [msg.searchMeta, msg._id]);

  const effectiveSearch = useMemo(() => {
    const isActiveStream = searchState?.active && msg.isGenerating;
    if (isActiveStream) return searchState;
    if (isLastMessage && searchState?.active) return searchState;
    return persistedMeta;
  }, [searchState, msg.isGenerating, isLastMessage, persistedMeta]);

  // Memoize reasoning state to avoid inline object recreation
  const reasoningBlock = useMemo(() => {
    const shouldShowReasoningStatus =
      msg.isGenerating && !searchState?.active && currentModelSupportsReasoning;

    const reasoningState = shouldShowReasoningStatus
      ? (msg.reasoning ?? DEFAULT_REASONING_STATE)
      : msg.reasoning;

    if (!reasoningState) return null;

    const visibleReasoningState =
      shouldShowReasoningStatus && !reasoningState.isThinking
        ? { ...reasoningState, isThinking: true }
        : reasoningState;

    if (
      !visibleReasoningState.isThinking &&
      !visibleReasoningState.displayedText
    ) {
      return null;
    }

    return {
      reasoning: visibleReasoningState,
      statusNote: visibleReasoningState.displayedText
        ? undefined
        : "This model is reasoning. Its internal chain of thought is not exposed.",
    };
  }, [
    msg.isGenerating,
    msg.reasoning,
    searchState?.active,
    currentModelSupportsReasoning,
  ]);

  const [copied, setCopied] = useState(false);

  return (
    <motion.div
      initial={shouldAnimate ? ANIMATE_IN : false}
      animate={ANIMATE_VISIBLE}
      transition={ANIMATE_TRANSITION}
      className={`group relative flex flex-col w-full ${isUser ? "items-end" : "items-start"} break-after-avoid chat-message-row`}
      layout={false}
    >
      {isUser ? (
        <div className="relative w-fit max-w-full md:max-w-[80%] flex flex-col items-end gap-2">
          {msg.files && msg.files.length > 0 && (
            <MessageAttachments files={msg.files} />
          )}

          {isEditing ? (
            <div className="w-full min-w-[300px] flex flex-col gap-2">
              <textarea
                autoFocus
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (editingText.trim() && threadId !== "new") {
                      onBranch(threadId, index, editingText.trim());
                      setEditingMessageIndex(null);
                      setEditingText("");
                    }
                  }
                  if (e.key === "Escape") {
                    setEditingMessageIndex(null);
                    setEditingText("");
                  }
                }}
                className="w-full rounded-2xl bg-muted px-4 py-2.5 text-[16px] sm:text-[15px] text-foreground resize-none border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={Math.max(2, editingText.split("\n").length)}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setEditingMessageIndex(null);
                    setEditingText("");
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:bg-muted/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (editingText.trim() && threadId !== "new") {
                      onBranch(threadId, index, editingText.trim());
                      setEditingMessageIndex(null);
                      setEditingText("");
                    }
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <>
              {hasUserText && (
                <div className="rounded-2xl bg-muted px-4 py-2.5 text-[15px] text-foreground wrap-break-word break-words">
                  {msg.parts[0]}
                </div>
              )}

              {hasUserText && (
                <div className="absolute right-0 top-full mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => {
                      setEditingMessageIndex(index);
                      setEditingText(msg.parts[0] || "");
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg p-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                  >
                    <SquarePen size={14} />
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(msg.parts[0] || "");
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="relative w-full text-foreground pb-2">
          {/* Web search progress indicator */}
          <AnimatePresence>
            {effectiveSearch ? (
              <div className="mb-3">
                <WebSearchProgress search={effectiveSearch} />
              </div>
            ) : null}
          </AnimatePresence>
          {msg.isError ? (
            <>
              {/* If the stream produced partial content before failing,
                  still render it so the user doesn't lose context. */}
              {msg.parts[0] && msg.parts[0] !== "" && !msg.parts[0].startsWith("[") ? (
                <div className="prose prose-neutral dark:prose-invert max-w-none prose-pre:m-0 prose-pre:bg-transparent prose-pre:p-0">
                  <MarkdownMessage content={msg.parts[0]} isStreaming={false} />
                </div>
              ) : null}
              <div className="mx-0 my-4 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 shrink-0 mt-0.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="whitespace-pre-wrap break-words">
                  {msg.errorMessage
                    ? msg.errorMessage
                    : msg.parts[0] && msg.parts[0].startsWith("[") && msg.parts[0].endsWith("]")
                      ? msg.parts[0].slice(1, -1)
                      : msg.parts[0] && msg.parts[0] !== ""
                        ? msg.parts[0]
                        : "Failed to generate a response. Please try again."}
                </span>
              </div>
            </>
          ) : (
            <>
              {/* Thinking/reasoning trace */}
              {reasoningBlock && (
                <ThinkingBlock
                  reasoning={reasoningBlock.reasoning}
                  statusNote={reasoningBlock.statusNote}
                />
              )}
              <div className="prose prose-neutral dark:prose-invert max-w-none prose-pre:m-0 prose-pre:bg-transparent prose-pre:p-0">
                <MarkdownMessage
                  content={msg.parts[0]}
                  isStreaming={msg.isStreamingRender ?? msg.isGenerating}
                />
              </div>
              {msg.isGenerating &&
                !searchState?.active &&
                !msg.parts[0] &&
                !reasoningBlock && <GeneratingIndicator />}
              {/* Copy button for assistant messages */}
              {!msg.isGenerating && msg.parts[0] && (
                <div className="flex items-center gap-1 mt-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(msg.parts[0] || "");
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span className="text-xs">
                      {copied ? "Copied" : "Copy"}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  );
});

// --- KEEP-ALIVE SLOT HOST ---
// Owns the rendered stack of recently-viewed ThreadViews. Pulled into its
// own memoized component so sidebar state (search, expand, dialogs) and
// other ChatLayout concerns do not re-render the slot tree.
//
// Critical CSS detail: inactive slots use `visibility: hidden`, `opacity: 0`,
// and `pointer-events: none` (not `display: none`) so the subtree stays
// laid out. The active wrapper is z-indexed above siblings so paint order
// matches focus/hit-testing. Flipping active is a cheap style toggle vs a
// cold relayout when re-showing `display: none` subtrees.
const MountedSlotsView = memo(function MountedSlotsView({
  mountedSlots,
  activeThreadId,
  onThreadCreated,
  onNotFound,
  profile,
  onToggleFavorite,
  activeAgentId,
  activeAgentName,
  activeAgentEmoji,
  activeAgentSnapshot,
  onExitAgent,
  currentModel,
  setSelectedModel,
  modelSelectorRef,
  onBranch,
  pendingBranchMessageRef,
  isModelLoading,
}: {
  mountedSlots: MountedSlot[];
  activeThreadId: string;
  onThreadCreated: (id: string) => void;
  onNotFound: () => void;
  profile:
    | {
        favoriteModels?: string[];
        autoFollowStream?: boolean;
      }
    | null
    | undefined;
  onToggleFavorite: (id: string) => void;
  activeAgentId?: string;
  activeAgentName?: string;
  activeAgentEmoji?: string;
  activeAgentSnapshot?: { systemPrompt?: string; includedFiles?: string[] };
  onExitAgent?: () => void;
  currentModel: string;
  setSelectedModel: (model: string) => void;
  modelSelectorRef?: React.RefObject<ModelSelectorHandle | null>;
  onBranch: (
    originalThreadId: string,
    cutoffMessageIndex: number,
    editedText: string,
  ) => Promise<void>;
  pendingBranchMessageRef: React.RefObject<string | null>;
  isModelLoading: boolean;
}) {
  return (
    <>
      {mountedSlots.map((slot) => {
        const isActive = slot.threadId === activeThreadId;
        return (
          <div
            key={slot.key}
            data-thread-slot-active={isActive ? "true" : "false"}
            aria-hidden={!isActive}
            className={
              isActive ? "absolute inset-0 z-10" : "absolute inset-0 z-0"
            }
            style={isActive ? undefined : INACTIVE_SLOT_STYLE}
          >
            <ThreadView
              threadId={slot.threadId}
              isActive={isActive}
              onThreadCreated={onThreadCreated}
              onNotFound={onNotFound}
              profile={profile}
              onToggleFavorite={onToggleFavorite}
              activeAgentId={activeAgentId}
              activeAgentName={activeAgentName}
              activeAgentEmoji={activeAgentEmoji}
              activeAgentSnapshot={activeAgentSnapshot}
              onExitAgent={onExitAgent}
              currentModel={currentModel}
              setSelectedModel={setSelectedModel}
              modelSelectorRef={modelSelectorRef}
              onBranch={onBranch}
              pendingBranchMessageRef={pendingBranchMessageRef}
              isModelLoading={isModelLoading}
            />
          </div>
        );
      })}
    </>
  );
});

// Frozen object so every inactive slot gets the *same* style reference.
// Prevents React from detecting "new" props on the wrapper div and
// triggering an unnecessary DOM style write during the switch.
const INACTIVE_SLOT_STYLE = Object.freeze({
  visibility: "hidden" as const,
  opacity: 0,
  pointerEvents: "none" as const,
});

// --- CHILD TAB COMPONENT ---
const ThreadView = memo(function ThreadView({
  threadId,
  isActive,
  onThreadCreated,
  onNotFound,
  profile,
  onToggleFavorite,
  activeAgentId,
  activeAgentName,
  activeAgentEmoji,
  activeAgentSnapshot,
  onExitAgent,
  currentModel,
  setSelectedModel,
  modelSelectorRef,
  onBranch,
  pendingBranchMessageRef,
  isModelLoading,
}: {
  threadId: string;
  isActive: boolean;
  onThreadCreated: (id: string) => void;
  onNotFound: () => void;
  profile:
    | {
        favoriteModels?: string[];
        autoFollowStream?: boolean;
      }
    | null
    | undefined;
  onToggleFavorite: (id: string) => void;
  activeAgentId?: string;
  activeAgentName?: string;
  activeAgentEmoji?: string;
  /** Client-resolved agent systemPrompt + includedFiles, used to skip the
   *  server's `getThreadContext` round-trip on new threads. */
  activeAgentSnapshot?: { systemPrompt?: string; includedFiles?: string[] };
  onExitAgent?: () => void;
  currentModel: string;
  setSelectedModel: (model: string) => void;
  modelSelectorRef?: React.RefObject<ModelSelectorHandle | null>;
  onBranch: (
    originalThreadId: string,
    cutoffMessageIndex: number,
    editedText: string,
  ) => Promise<void>;
  pendingBranchMessageRef: React.RefObject<string | null>;
  isModelLoading: boolean;
}) {
  // Inactive (keep-alive) views don't need to reconnect dropped streams,
  // auto-apply the thread's model to the shared selector, fire pending
  // branch sends, or listen for global keyboard shortcuts. Only the
  // currently-visible view handles those side effects.
  const {
    messages,
    sendMessage,
    isGenerating,
    hasError,
    stopGeneration,
    isLoadingHistory,
    searchState,
  } = useHybridChat(threadId, isActive);

  // Render the message list at low priority.
  //
  // React uses the previous `deferredMessages` value during an urgent render
  // pass, then schedules a second pass with the fresh value. On a thread
  // switch this means:
  //   1. urgent pass: scaffold + sidebar + composer paint (<16ms)
  //   2. deferred pass: heavy message list mounts (MarkdownMessage, KaTeX,
  //      etc.) while the user already sees the new thread's chrome
  //
  // Combined with `useDeferredValue(activeThreadId)` + `useDeferredValue(
  // mountedSlots)` at the ChatLayout level, the user's perceived switch
  // latency is bounded by the urgent pass alone, the expensive work
  // happens "off the visual critical path" and can be interrupted if
  // they click again.
  //
  // We deliberately keep `isGenerating` and `searchState` on the urgent
  // path because those drive the sidebar spinner and progress UI that
  // the user sees immediately.
  const deferredMessages = useDeferredValue(messages);
  const { uploadFile } = useFileUpload();
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const [signInDialogOpen, setSignInDialogOpen] = useState(false);
  const isMobile = useIsMobile();
  const keyboardHeight = useKeyboardHeight();
  const { setIsFocused: setMobileInputFocused, isFocused: mobileInputFocused } =
    useContext(MobileInputFocusContext);

  // threadRecord is only used for the "Chat not found" check below, and
  // that check only needs to fire for the currently-visible slot. With
  // up to MAX_MOUNTED_THREADS keep-alive slots, each running its own
  // `threads.get` subscription would mean N redundant Convex queries
  // open over the WebSocket, and N copies of the not-found toast if a
  // thread was deleted in another tab. Skip when inactive.
  //
  // Model auto-select is owned by ChatLayout's `activeThreadRecord`
  // effect so keep-alive views can't race over the shared selector.
  const threadRecord = useQuery(
    api.threads.get,
    !isActive || threadId === "new" ? "skip" : { threadId },
  );

  const [isInitialMount, setIsInitialMount] = useState(() => isInitialPageLoad);
  useEffect(() => {
    if (isInitialPageLoad && !isLoadingHistory) {
      requestAnimationFrame(() => {
        isInitialPageLoad = false;
        setIsInitialMount(false);
      });
    }
  }, [isLoadingHistory]);

  useEffect(() => {
    if (
      isActive &&
      threadId !== "new" &&
      !isAuthLoading &&
      isAuthenticated &&
      threadRecord === null
    ) {
      toast.error("Chat not found", {
        description: "This conversation doesn't exist or was deleted.",
      });
      onNotFound();
    }
  }, [
    isActive,
    threadId,
    threadRecord,
    onNotFound,
    isAuthLoading,
    isAuthenticated,
  ]);

  const [input, setInput] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isOverDropTarget, setIsOverDropTarget] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<
    { id: string; name: string }[]
  >([]);
  const dragCounter = useRef(0);

  // Inline editing state for chat branching
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(
    null,
  );
  const [editingText, setEditingText] = useState("");

  const [prevThreadId, setPrevThreadId] = useState(threadId);
  if (threadId !== prevThreadId) {
    setPrevThreadId(threadId);
    if (!(prevThreadId === "new" && threadId !== "new")) {
      setInput("");
      // Revoke blob URLs before clearing on navigation to prevent memory leak
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      setAttachments([]);
    }
    setEditingMessageIndex(null);
    setEditingText("");
  }

  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-send pending branch message when navigating to a branched thread.
  // Scoped to isActive so inactive keep-alive views can't accidentally
  // consume the shared branch ref.
  const hasFiredBranch = useRef(false);
  useEffect(() => {
    if (!isActive) return;
    if (hasFiredBranch.current) return;
    const pending = pendingBranchMessageRef.current;
    if (!pending || threadId === "new" || isLoadingHistory) return;
    hasFiredBranch.current = true;
    pendingBranchMessageRef.current = null;
    sendMessage(pending, currentModel, activeAgentId).then((newId) => {
      if (newId && threadId === "new") onThreadCreated(newId);
    });
  }, [isActive, threadId, isLoadingHistory]);

  const contextLimit = getModelContextLimit(currentModel);

  const allText = useMemo(
    () => messages.map((m) => m.parts[0] || "").join("\n"),
    [messages],
  );

  const baseContextTokens = useMemo(() => {
    return estimateTokenCount(allText + "\n" + input);
  }, [allText, input]);

  const attachmentContext = useMemo(() => {
    const validAttachments = attachments.filter(
      (attachment) => !attachment.error,
    );
    const pending = validAttachments.some(
      (attachment) =>
        isContextEstimableFile(attachment.file) && !attachment.contextEstimate,
    );
    const tokens = validAttachments.reduce(
      (total, attachment) =>
        total + (attachment.contextEstimate?.contextTokens ?? 0),
      0,
    );
    const isApproximate = validAttachments.some(
      (attachment) => attachment.contextEstimate?.isApproximate,
    );

    return {
      tokens,
      pending,
      isApproximate,
    };
  }, [attachments]);

  const contextTokens = baseContextTokens + attachmentContext.tokens;

  const isOverLimit = contextTokens >= contextLimit;
  const anyFileUploading = attachments.some((a) => a.isUploading);
  const currentModelConfig = getModelConfig(currentModel);
  const currentModelSupportsReasoning = currentModelConfig?.reasoning ?? false;

  const {
    containerRef: scrollContainerRef,
    handleScroll,
    isFollowing,
    showFollowButton,
    scrollToBottom,
  } = useSmartScroll(isGenerating, messages, profile?.autoFollowStream ?? true);

  // When the mobile keyboard opens, scroll chat to bottom so input stays visible
  useEffect(() => {
    if (isMobile && keyboardHeight > 0) {
      scrollToBottom();
    }
  }, [isMobile, keyboardHeight, scrollToBottom]);

  const handleFilesAdded = useCallback(
    (files: File[], source: PendingAttachment["source"] = "upload") => {
      const supportsImages = currentModelConfig?.supportsImages ?? false;
      const supportsAudio = currentModelConfig?.supportsAudio ?? false;

      files.forEach(async (file) => {
        const id = Math.random().toString();
        const previewUrl = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        let errorMessage: string | undefined;

        if (file.type === "application/pdf") {
          errorMessage = "PDFs are not supported yet.";
        } else if (file.type.startsWith("image/") && !supportsImages) {
          errorMessage = `"${currentModelConfig?.name || "This model"}" doesn't support images.`;
        } else if (
          (file.type.startsWith("audio/") || file.type.startsWith("video/")) &&
          !supportsAudio
        ) {
          errorMessage = `"${currentModelConfig?.name || "This model"}" doesn't support audio/video.`;
        }

        if (errorMessage) {
          // Record the attachment but mark it with an error so the user gets visual feedback
          setAttachments((prev) => [
            ...prev,
            {
              id,
              file,
              isUploading: false,
              previewUrl,
              error: errorMessage,
              source,
            },
          ]);
          return;
        }

        setAttachments((prev) => [
          ...prev,
          { id, file, isUploading: true, previewUrl, source },
        ]);

        if (isContextEstimableFile(file)) {
          void estimateAttachmentContext(file)
            .then((contextEstimate) => {
              setAttachments((prev) =>
                prev.map((attachment) =>
                  attachment.id === id
                    ? { ...attachment, contextEstimate }
                    : attachment,
                ),
              );
            })
            .catch((error) => {
              console.error("Failed to estimate attachment context:", error);
            });
        }

        try {
          const uploadedId = await uploadFile(file);
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, isUploading: false, uploadedId } : a,
            ),
          );
        } catch (e) {
          console.error("Failed to upload", file.name);
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    isUploading: false,
                    error: `Failed to upload ${file.name}`,
                  }
                : a,
            ),
          );
        }
      });
    },
    [currentModelConfig, uploadFile],
  );

  // Mark attachments as "context ready" with checkmark animation when upload + estimation completes
  useEffect(() => {
    setAttachments((prev) => {
      let changed = false;
      const next = prev.map((a) => {
        if (!a.error && !a.isUploading && a.uploadedId && !a.contextReady) {
          changed = true;
          return { ...a, contextReady: true, showCheckmark: true };
        }
        return a;
      });
      return changed ? next : prev;
    });
  }, [
    attachments
      .map((a) => `${a.id}:${a.isUploading}:${a.uploadedId}`)
      .join(","),
  ]);

  // Clear checkmark animation after it plays
  useEffect(() => {
    const withCheckmark = attachments.filter((a) => a.showCheckmark);
    if (withCheckmark.length === 0) return;
    const timer = setTimeout(() => {
      setAttachments((prev) =>
        prev.map((a) => (a.showCheckmark ? { ...a, showCheckmark: false } : a)),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [attachments.map((a) => `${a.id}:${a.showCheckmark}`).join(",")]);

  const retryAttachment = useCallback(
    (id: string) => {
      const att = attachments.find((a) => a.id === id);
      if (!att) return;
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, error: undefined, isUploading: true, contextReady: false }
            : a,
        ),
      );
      uploadFile(att.file)
        .then((uploadedId) => {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, isUploading: false, uploadedId } : a,
            ),
          );
        })
        .catch(() => {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    isUploading: false,
                    error: `Failed to upload ${att.file.name}`,
                  }
                : a,
            ),
          );
        });
    },
    [attachments, uploadFile],
  );

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  // Global drag handlers, applied to the entire chat area for the overlay
  const handleGlobalDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
      setIsOverDropTarget(false);
    }
  }, []);

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Drop target specific handlers (the input form area)
  const handleDropTargetEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOverDropTarget(true);
  }, []);

  const handleDropTargetLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOverDropTarget(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsOverDropTarget(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        // Trigger suck-in animation entries
        const suckedFiles = files.map((f) => ({
          id: Math.random().toString(),
          name: f.name,
        }));
        setDroppedFiles(suckedFiles);
        // Clear suck-in animation after it plays
        setTimeout(() => setDroppedFiles([]), 500);

        handleFilesAdded(files);
      }

      setIsDragging(false);
    },
    [handleFilesAdded],
  );

  // Also handle drop on the overlay itself (anywhere in the chat)
  const handleOverlayDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsOverDropTarget(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        const suckedFiles = files.map((f) => ({
          id: Math.random().toString(),
          name: f.name,
        }));
        setDroppedFiles(suckedFiles);
        setTimeout(() => setDroppedFiles([]), 500);
        handleFilesAdded(files);
      }

      setIsDragging(false);
    },
    [handleFilesAdded],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardFiles = Array.from(e.clipboardData.files ?? []);
      if (clipboardFiles.length > 0) {
        e.preventDefault();
        handleFilesAdded(clipboardFiles, "clipboard");
        return;
      }

      const pastedText = e.clipboardData.getData("text/plain");
      if (!shouldConvertClipboardToAttachment(pastedText)) return;

      e.preventDefault();
      handleFilesAdded(
        [createClipboardAttachmentFile(pastedText)],
        "clipboard",
      );
    },
    [handleFilesAdded],
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!isAuthenticated) {
      setSignInDialogOpen(true);
      return;
    }

    const validAttachments = attachments.filter((a) => !a.error);
    const hasValidInput = input.trim() || validAttachments.length > 0;

    if (!hasValidInput || isGenerating || isOverLimit || anyFileUploading)
      return;

    const submittedInput = input;
    const filesToUpload = validAttachments.map((a) => a.file);
    const uploadedFileIds = validAttachments
      .map((a) => a.uploadedId)
      .filter(Boolean) as string[];

    // Revoke blob URLs before clearing to prevent memory leak
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });

    setInput("");
    setAttachments([]);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      });
    });

    try {
      const wasSearchEnabled = searchEnabled;
      // Reset search toggle after sending (one-shot per message)
      setSearchEnabled(false);

      // Fast path: extract text from text-like files and send inline
      // to skip the server-side fetch round-trip. Only for files < 2MB total.
      let inlineFiles:
        | { name: string; mimeType: string; text: string }[]
        | undefined;
      const textAttachments = validAttachments.filter((a) =>
        isTextLikeFile(a.file),
      );
      if (textAttachments.length > 0) {
        const totalSize = textAttachments.reduce(
          (sum, a) => sum + a.file.size,
          0,
        );
        if (totalSize < 2 * 1024 * 1024) {
          const results = await Promise.all(
            textAttachments.map(async (a) => ({
              name: a.file.name,
              mimeType: a.file.type || "text/plain",
              text: await a.file.text(),
            })),
          );
          inlineFiles = results;
        }
      }

      // Only send agentSnapshot for new threads, the server uses it to skip
      // its `getThreadContext` round-trip. Existing-thread paths don't need it
      // (their Promise.all already parallelises the context fetch).
      const snapshotForSend =
        threadId === "new" ? activeAgentSnapshot : undefined;

      const newThreadId = await sendMessage(
        submittedInput,
        currentModel,
        activeAgentId,
        uploadedFileIds.length > 0 ? uploadedFileIds : undefined,
        filesToUpload,
        wasSearchEnabled,
        inlineFiles,
        snapshotForSend,
      );

      if (newThreadId && threadId === "new") {
        onThreadCreated(newThreadId);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setInput(submittedInput);
    }
  };

  const handleTranscription = useCallback((text: string) => {
    setInput((prev) => {
      const separator = prev.trim() ? " " : "";
      return prev + separator + text;
    });
  }, []);

  // Scroll to bottom on first paint of this ThreadView *instance* only.
  // We intentionally do NOT fire on every [threadId] change, with the
  // keep-alive slot cache, each slot is bound to one threadId for its
  // lifetime, and revisits must preserve the previous scroll position
  // (that's the whole point of keep-alive; re-running this would wipe it).
  //
  // Runs once per slot mount, deferred until messages have actually
  // populated so scrollHeight reflects the real content.
  const hasInitialScrolledRef = useRef(false);
  useEffect(() => {
    if (hasInitialScrolledRef.current) return;
    if (isLoadingHistory) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    hasInitialScrolledRef.current = true;
  }, [isLoadingHistory]);

  const hasValidInput = input.trim() || attachments.some((a) => !a.error);
  const hasApproximateContext = attachmentContext.isApproximate;

  // Circular progress indicator component
  const ProgressRing = ({
    size = 20,
    stroke = 2,
    spinning = false,
  }: {
    size?: number;
    stroke?: number;
    spinning?: boolean;
  }) => {
    const radius = (size - stroke) / 2;
    const circumference = radius * 2 * Math.PI;
    return (
      <svg
        width={size}
        height={size}
        className={spinning ? "animate-spin" : ""}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={`${circumference * 0.3} ${circumference * 0.7}`}
          className="progress-ring-circle text-primary"
          opacity={0.8}
        />
      </svg>
    );
  };

  // Status indicator for attachment cards (progress / checkmark / error)
  const AttachmentStatus = ({ att }: { att: PendingAttachment }) => {
    if (att.error) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            retryAttachment(att.id);
          }}
          className="flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-destructive hover:bg-destructive/20 transition-colors"
          title={att.error}
        >
          <RotateCcw size={10} />
          <span className="text-[9px] font-semibold">Retry</span>
        </button>
      );
    }
    if (att.isUploading) {
      return <ProgressRing size={16} stroke={2} spinning />;
    }
    if (att.showCheckmark) {
      return (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center size-4 rounded-full bg-emerald-500 text-white"
        >
          <Check size={10} strokeWidth={3} />
        </motion.div>
      );
    }
    if (att.contextReady) {
      return (
        <div className="flex items-center justify-center size-4 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
          <Check size={10} strokeWidth={2.5} />
        </div>
      );
    }
    return null;
  };

  const renderAttachmentCard = (att: PendingAttachment) => {
    const contextLabel = att.contextEstimate?.contextTokens
      ? formatCompactContextSize(
          att.contextEstimate.contextTokens,
          att.contextEstimate.isApproximate,
        )
      : null;
    const dimensionLabel = formatImageDimensions(
      att.contextEstimate?.dimensions,
    );
    const extension = att.file.name.split(".").pop() || "file";
    const isTextPreview =
      att.contextEstimate?.kind === "text" && att.contextEstimate.previewText;
    const isImagePreview = Boolean(att.previewUrl);

    if (isTextPreview) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={`relative group/file flex min-h-[88px] w-[220px] shrink-0 flex-col justify-between rounded-xl border p-3 shadow-sm transition-all duration-200 ${
            att.error
              ? "border-destructive/40 bg-destructive/5"
              : att.contextReady
                ? "border-emerald-500/20 bg-muted/40"
                : "border-border bg-muted/40"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                <FileText
                  size={12}
                  className={
                    att.error
                      ? "text-destructive/70"
                      : "text-muted-foreground/70"
                  }
                />
                <span>
                  {att.source === "clipboard"
                    ? "Clipboard"
                    : att.contextEstimate?.previewLabel}
                </span>
              </div>
              <div
                className={`mt-1 truncate text-sm font-medium ${att.error ? "text-destructive/90" : "text-foreground"}`}
              >
                {att.file.name}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <AttachmentStatus att={att} />
              {!att.isUploading && (
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="rounded-full bg-muted-foreground p-1 text-background opacity-0 shadow-sm transition-opacity group-hover/file:opacity-100 hover:bg-foreground"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          </div>

          <div
            className={`mt-2 line-clamp-3 whitespace-pre-wrap text-left text-xs leading-5 ${att.error ? "text-destructive/70" : "text-muted-foreground"}`}
          >
            {att.contextEstimate?.previewText}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground/80">
            <span className="truncate uppercase tracking-wide">
              {att.contextEstimate?.previewLabel}
            </span>
            <div className="flex items-center gap-2">
              {contextLabel ? <span>{contextLabel} ctx</span> : null}
            </div>
          </div>

          {att.error && (
            <div className="absolute -top-1.5 -left-1.5 z-10 rounded-full bg-background shadow-sm">
              <AlertCircle
                size={14}
                className="fill-destructive/10 text-destructive"
              />
            </div>
          )}
        </motion.div>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className={`relative group/file flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border shadow-sm transition-all duration-200 ${
          att.error
            ? "border-destructive/40 bg-destructive/5"
            : att.contextReady
              ? "border-emerald-500/20 bg-muted/50"
              : "border-border bg-muted/50"
        }`}
      >
        {isImagePreview ? (
          <>
            <img
              src={att.previewUrl}
              className={`h-full w-full object-cover ${att.error ? "grayscale opacity-40 mix-blend-luminosity" : ""}`}
              alt={att.file.name}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-[10px] font-medium text-white">
              {contextLabel ? `${contextLabel} ctx` : dimensionLabel || "Image"}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center px-1 text-center">
            {att.contextEstimate?.kind === "image" ? (
              <ImageIcon
                size={16}
                className={
                  att.error
                    ? "mb-1 text-destructive/60"
                    : "mb-1 text-muted-foreground"
                }
              />
            ) : (
              <Paperclip
                size={16}
                className={
                  att.error
                    ? "mb-1 text-destructive/60"
                    : "mb-1 text-muted-foreground"
                }
              />
            )}
            <span
              className={`w-full truncate px-1 text-[10px] font-medium ${att.error ? "text-destructive/80" : "text-muted-foreground"}`}
            >
              {extension}
            </span>
          </div>
        )}

        {/* Upload progress overlay */}
        {att.isUploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[2px]">
            <ProgressRing size={24} stroke={2.5} spinning />
          </div>
        )}

        {/* Context ready checkmark pop */}
        {att.showCheckmark && !att.error && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-emerald-500/15 backdrop-blur-[1px]"
          >
            <div className="flex items-center justify-center size-6 rounded-full bg-emerald-500 text-white shadow-sm">
              <Check size={14} strokeWidth={3} />
            </div>
          </motion.div>
        )}

        {/* Error badge with retry */}
        {att.error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-background/70 backdrop-blur-[2px]">
            <AlertCircle size={14} className="text-destructive" />
            <button
              type="button"
              onClick={() => retryAttachment(att.id)}
              className="flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-destructive hover:bg-destructive/20 transition-colors"
              title={att.error}
            >
              <RotateCcw size={8} />
              <span className="text-[8px] font-semibold">Retry</span>
            </button>
          </div>
        )}

        {!att.isUploading && !att.error && (
          <button
            type="button"
            onClick={() => removeAttachment(att.id)}
            className="absolute -top-2 -right-2 z-10 rounded-full bg-muted-foreground p-1 text-background opacity-0 shadow-sm transition-opacity group-hover/file:opacity-100 hover:bg-foreground"
          >
            <X size={10} />
          </button>
        )}
      </motion.div>
    );
  };

  // Escape key exits agent context when textarea is not focused.
  // Only the active view binds the listener, otherwise every mounted
  // keep-alive view would fire onExitAgent on a single Escape press.
  useEffect(() => {
    if (!isActive || !activeAgentId || !onExitAgent) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        onExitAgent();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isActive, activeAgentId, onExitAgent]);

  return (
    <div
      className="absolute inset-0 max-sm:mt-0 mt-3.5 flex flex-col z-20"
      onDragEnter={handleGlobalDragEnter}
      onDragLeave={handleGlobalDragLeave}
      onDragOver={handleGlobalDragOver}
    >
      {/* Dynamic Island Agent Pill */}
      <AnimatePresence>
        {activeAgentId && activeAgentName && messages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.85, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -16, scale: 0.85, filter: "blur(8px)" }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="absolute top-2 sm:top-5 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="agent-pill flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium text-foreground/90 select-none">
              <div className="flex items-center justify-center size-5 rounded-md bg-primary/8">
                <span className="text-[13px] leading-none select-none">
                  {activeAgentEmoji || DEFAULT_AGENT_EMOJI}
                </span>
              </div>
              <span className="truncate max-w-[200px]">{activeAgentName}</span>
              <button
                onClick={onExitAgent}
                className="agent-pill-exit ml-0.5 flex items-center justify-center size-5 rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                title="Exit agent (Esc)"
              >
                <X size={11} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Drop Zone Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="drop-zone-overlay absolute inset-0 z-[60] flex flex-col items-center justify-center"
            onDrop={handleOverlayDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              className="flex flex-col items-center gap-3"
            >
              <div
                className={`flex items-center justify-center size-16 rounded-2xl border-2 border-dashed transition-all duration-200 ${
                  isOverDropTarget
                    ? "border-primary bg-primary/10 scale-110"
                    : "border-muted-foreground/30 bg-muted/20"
                }`}
              >
                <Upload
                  size={28}
                  className={`transition-colors ${isOverDropTarget ? "text-primary" : "text-muted-foreground/50"}`}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground/80">
                  Drop files here
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Images, code, text, and more
                </p>
              </div>
            </motion.div>

            {/* Suck-in animation ghosts */}
            <AnimatePresence>
              {droppedFiles.map((df) => (
                <motion.div
                  key={df.id}
                  initial={{ scale: 1, opacity: 0.8, y: 0 }}
                  animate={{ scale: 0.15, opacity: 0, y: 80 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.32, 0, 0.67, 0] }}
                  className="absolute flex items-center gap-2 rounded-lg bg-card border border-border/50 px-3 py-2 shadow-lg pointer-events-none"
                >
                  <FileText size={14} className="text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                    {df.name}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable Chat Container */}
      <div
        id={`chat-scroll-${threadId}`}
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="chat-scroll-container absolute inset-0 overflow-y-scroll pt-14 sm:pt-3.5 z-20"
        style={{
          bottom:
            isMobile && keyboardHeight > 0 ? `${keyboardHeight}px` : undefined,
        }}
      >
        {/*
         * Plain <div>, no mount animation.
         *
         * We deliberately skip any fade/blur/translate transition here.
         * On thread switches, any mount animation reads as "jank" because
         * the user already sees the old content disappear; a 500ms fade-in
         * on top of that is the slowest-feeling part of the switch.
         *
         * The `--hidden` variant just keeps the container invisible while
         * the very first messages query is still loading (so we don't
         * flash an empty white rectangle before rows arrive).
         */}
        <div
          className={`chat-message-list mx-auto relative flex w-full max-w-3xl flex-col space-y-12 px-4 pt-safe-offset-10 pb-[15vh] min-h-full ${
            isInitialMount && isLoadingHistory
              ? "chat-message-list--hidden"
              : ""
          }`}
        >
          {deferredMessages.length === 0 && !isLoadingHistory && (
            <div className="absolute inset-x-0 top-[20vh] flex flex-col items-center justify-center px-8">
              {/* Agent context pill in empty state */}
              {activeAgentId && activeAgentName && (
                <div className="agent-empty-pill mb-5 flex items-center gap-2.5 rounded-full px-5 py-2">
                  <div className="flex items-center justify-center size-6 rounded-lg bg-primary/8">
                    <span className="text-[14px] leading-none select-none">
                      {activeAgentEmoji || DEFAULT_AGENT_EMOJI}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-foreground/80">
                    {activeAgentName}
                  </span>
                  {onExitAgent && (
                    <button
                      onClick={onExitAgent}
                      className="agent-pill-exit ml-1 flex items-center justify-center size-5 rounded-full text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                      title="Exit agent (Esc)"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}

              <h2 className="text-3xl font-semibold text-color-heading text-center">
                {activeAgentId
                  ? "What are we working on?"
                  : "How can I help you today?"}
              </h2>
            </div>
          )}

          {deferredMessages.map((msg, i) => (
            <ChatMessageItem
              key={
                msg.restorationId ? `stream-${msg.restorationId}` : msg._id || i
              }
              msg={msg}
              index={i}
              isEditing={editingMessageIndex === i}
              editingText={editingText}
              setEditingText={setEditingText}
              setEditingMessageIndex={setEditingMessageIndex}
              threadId={threadId}
              onBranch={onBranch}
              searchState={searchState}
              isLastMessage={i === deferredMessages.length - 1}
              currentModelSupportsReasoning={currentModelSupportsReasoning}
            />
          ))}
          <div className="scroll-anchor-element" aria-hidden="true" />
        </div>
      </div>

      {/* Scroll to bottom / follow toggle */}
      <AnimatePresence>
        {showFollowButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.15 }}
            onClick={scrollToBottom}
            className="absolute bottom-32 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 rounded-full border border-border/50 bg-card/90 backdrop-blur-sm px-3 py-1.5 text-xs text-muted-foreground shadow-lg hover:bg-card hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowDown size={14} />
            {isGenerating ? "Follow" : "Bottom"}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input Area Overlay */}
      <div
        className={`pointer-events-none absolute bottom-0 z-30 w-full transition-all duration-200 flex flex-col pt-12 bg-gradient-to-t from-chat-background via-chat-background to-transparent ${
          isMobile && mobileInputFocused
            ? "px-0 pb-0"
            : "px-3 sm:px-4 pb-4 sm:pb-8"
        }`}
        style={{
          backgroundColor:
            isMobile && mobileInputFocused
              ? "var(--chat-background)"
              : isMobile
                ? "var(--chat-background)"
                : "transparent",
          paddingBottom: !(isMobile && mobileInputFocused)
            ? "max(env(safe-area-inset-bottom, 16px), 16px)"
            : undefined,
          bottom:
            isMobile && keyboardHeight > 0 ? `${keyboardHeight}px` : undefined,
        }}
      >
        <div className="relative mx-auto flex w-full max-w-3xl flex-col">
          <div className="pointer-events-auto w-full">
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              onDragEnter={handleDropTargetEnter}
              onDragLeave={handleDropTargetLeave}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className={`relative flex w-full flex-col gap-2 p-2 text-secondary-foreground transition-all duration-200 ${
                isMobile && mobileInputFocused
                  ? "rounded-t-[24px] border-t border-border/50 bg-card shadow-2xl"
                  : "rounded-[28px] border border-border/50 bg-card/80 backdrop-blur-xl shadow-lg shadow-black/5"
              } ${isOverDropTarget ? "drop-target-active" : ""}`}
            >
              {(activeAgentId || attachments.length > 0) && (
                <div className="flex flex-col gap-2 px-3 pt-2 pb-1 text-left">
                  {activeAgentId && activeAgentName && (
                    <motion.div
                      initial={{ opacity: 0, x: -8, filter: "blur(4px)" }}
                      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                      className="flex items-center"
                    >
                      <span className="agent-input-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold tracking-wider uppercase text-foreground/70">
                        <span className="text-[11px] leading-none select-none">
                          {activeAgentEmoji || DEFAULT_AGENT_EMOJI}
                        </span>
                        {activeAgentName}
                      </span>
                    </motion.div>
                  )}

                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((att) => (
                        <Tooltip key={att.id} delayDuration={0}>
                          <TooltipTrigger asChild>
                            {renderAttachmentCard(att)}
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className={
                              att.error
                                ? "border-destructive bg-destructive font-medium text-destructive-foreground shadow-md"
                                : undefined
                            }
                          >
                            <div className="space-y-1">
                              <p className="max-w-[280px] break-all">
                                {att.file.name}
                              </p>
                              {att.contextEstimate?.contextTokens ? (
                                <p>
                                  Context:{" "}
                                  {formatCompactContextSize(
                                    att.contextEstimate.contextTokens,
                                    att.contextEstimate.isApproximate,
                                  )}{" "}
                                  ctx
                                </p>
                              ) : null}
                              {att.contextEstimate?.dimensions ? (
                                <p>
                                  {formatImageDimensions(
                                    att.contextEstimate.dimensions,
                                  )}
                                </p>
                              ) : null}
                              {att.error ? <p>{att.error}</p> : null}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex min-w-0 grow flex-row items-start px-3 mt-1">
                <textarea
                  data-chat-composer
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={handlePaste}
                  onFocus={() => {
                    if (isMobile) setMobileInputFocused(true);
                  }}
                  onBlur={() => {
                    if (isMobile) setMobileInputFocused(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  rows={1}
                  placeholder="Type your message here..."
                  className="w-full min-h-[24px] max-h-[240px] resize-none bg-transparent text-[16px] sm:text-[15px] leading-6 text-foreground outline-none placeholder:text-secondary-foreground/60 [field-sizing:content]"
                />
              </div>

              {isOverLimit && (
                <div className="text-xs text-destructive font-medium px-3 text-left">
                  Context limit reached, switch models or clear chat.
                </div>
              )}

              <div className="mt-1 flex w-full flex-row-reverse justify-between items-center px-2">
                <div className="flex shrink-0 items-center justify-center gap-2">
                  <div className="flex flex-col items-end">
                    {attachmentContext.tokens > 0 && (
                      <span className="text-[10px] font-medium tabular-nums text-muted-foreground/50">
                        Files +
                        {formatCompactContextSize(
                          attachmentContext.tokens,
                          attachmentContext.isApproximate,
                        )}
                      </span>
                    )}
                    {attachmentContext.pending &&
                      attachmentContext.tokens === 0 && (
                        <span className="text-[10px] font-medium text-muted-foreground/40">
                          Estimating file context...
                        </span>
                      )}
                    <span
                      className={`text-[10px] font-medium tabular-nums ${isOverLimit ? "text-destructive" : "text-muted-foreground/40"}`}
                    >
                      {formatCompactContextSize(
                        contextTokens,
                        hasApproximateContext,
                      )}
                      {" / "}
                      {formatContextLimit(contextLimit)}
                    </span>
                  </div>
                  <VoiceInput
                    onTranscription={handleTranscription}
                    disabled={isGenerating || anyFileUploading}
                  />
                  {isGenerating ? (
                    <button
                      type="button"
                      data-chat-stop
                      onClick={(e) => {
                        e.preventDefault();
                        stopGeneration();
                      }}
                      className="flex size-8 items-center justify-center rounded-full bg-destructive font-semibold text-destructive-foreground shadow-sm hover:bg-destructive/90 transition-all active:scale-95"
                      title="Stop generating"
                    >
                      <Square size={12} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      data-chat-submit
                      disabled={
                        !hasValidInput || isOverLimit || anyFileUploading
                      }
                      className="flex size-8 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-30 transition-all active:scale-95"
                    >
                      {anyFileUploading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <ArrowUp size={18} />
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 min-w-0">
                  <div className="hidden md:block min-w-0">
                    <ModelSelector
                      // Only the active slot owns the shared selector ref, // otherwise mounted keep-alive views would overwrite it.
                      ref={isActive ? modelSelectorRef : undefined}
                      selectedModel={currentModel}
                      onSelectModel={setSelectedModel}
                      favoriteModels={profile?.favoriteModels || []}
                      onToggleFavorite={onToggleFavorite}
                      isModelLoading={isModelLoading}
                    />
                  </div>

                  <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFilesAdded(Array.from(e.target.files));
                      }
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    accept="image/*,text/*,.md,.json,.js,.ts,.tsx,.py,.csv,audio/*"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isGenerating || anyFileUploading}
                    className="flex shrink-0 size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                  >
                    <Paperclip size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSearchEnabled((v) => !v)}
                    disabled={isGenerating}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 h-8 text-xs font-medium transition-all ${
                      searchEnabled
                        ? "bg-primary/10 text-primary border border-primary/30 shadow-sm"
                        : "text-muted-foreground hover:bg-muted/40"
                    } disabled:opacity-50`}
                  >
                    <Globe
                      size={14}
                      className={searchEnabled ? "text-primary" : ""}
                    />
                    <span className="hidden sm:inline">Search</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      <SignInDialog
        open={signInDialogOpen}
        onOpenChange={setSignInDialogOpen}
      />
    </div>
  );
});
