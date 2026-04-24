# CLAUDE.md - AgentChat Architecture & Directives

**Welcome to AgentChat.** You are working on a next-generation, open-source AI portal. We did not build just another chat wrapper. We built a unified, ultra-low-latency interface for the world's most powerful AI models. 

**OBSESS OVER THE USER EXPERIENCE.** This app must feel like a native, 120Hz iOS application running on a desktop browser. Every detail matters. Every animation must use proper spring physics. Every interaction must be instant.

## 🚨 THE GOLDEN RULE: ZERO RE-RENDERING BUGS 🚨

Standard React applications re-render the entire component tree on every new AI token. **WE DO NOT DO THIS.** Re-rendering on every token causes layout thrashing, scrolling jank, and a sluggish UI.

We achieve an unparalleled **"Perfectness" Feeling** through our custom streaming architecture:
1. **The Stream Manager (`src/lib/stream-manager.ts`)**: We decouple streaming text from React state. We maintain a global `Map` of active streams.
2. **The `requestAnimationFrame` Loop**: Text is painted onto the screen using an aggressive `RAF` loop. The browser's main thread is NEVER blocked. 
3. **No Flash of Unstyled Content**: We offload heavy tasks (like Shiki syntax highlighting) to a dedicated Web Worker (`src/workers/shiki.worker.ts`) to ensure the main thread stays buttery smooth while tokens stream in.
4. **Concurrent Execution**: We fire Database mutations (Convex) and LLM requests (Vercel AI SDK) concurrently. We NEVER wait for the DB to respond before asking the LLM to start thinking. 

**WHEN WRITING CODE:**
* **NEVER** put high-frequency updating data (like streaming tokens) into standard React `useState`.
* **ALWAYS** use `useSyncExternalStore` or ref-based DOM mutations for real-time updates.
* **MEMOIZE HEAVILY**: Use `React.memo`, `useMemo`, and `useCallback` aggressively. If a component re-renders when a user types in an input or a token arrives, **you have introduced a bug**.

---

## 🛠️ The Tech Stack

* **Routing & SSR:** TanStack Start & Router (File-based, instant prefetching).
* **Backend & DB:** Convex (Real-time sync engine, WebSockets).
* **Streaming & Pub/Sub:** Redis (via `ioredis` pointing to Upstash).
* **Styling:** Tailwind CSS v4 + Radix UI (shadcn/ui heavily customized).
* **Animations:** Framer Motion (Spring physics only, no linear easings).
* **AI Integration:** Vercel AI SDK (Anthropic, OpenAI, Google, xAI, Fireworks, DeepSeek).
* **Voice:** Fireworks Whisper v3 Turbo (via custom WebRTC hooks).
* **Web Search:** FireCrawl integration with parallel multi-agent swarms.

---

## 📐 Code Cleanliness Principles

1. **Performance > Idiomatic React:** If standard React state makes the UI drop below 60fps, drop standard React. Use refs, manual DOM mutations, or Web Workers.
2. **Fluidity as a Feature:** Do not just snap elements into place. Use `framer-motion` `layoutId` and `AnimatePresence`. UI transitions must tell the user exactly where they are.
3. **Strict Typing:** TypeScript strict mode is on. No `any` unless absolutely necessary for external boundaries.
4. **Separation of Concerns:** * **Lib (`/src/lib`)**: Pure business logic, API clients, algorithms. No React here.
   * **Hooks (`/src/hooks`)**: React glue connecting `lib` to `components`.
   * **Components (`/src/components`)**: Dumb rendering layers.
   * **Routes (`/src/routes`)**: Page layouts and serverless API endpoints.
5. **Fail Fast, Fail Gracefully:** Network calls fail. LLMs hallucinate. Always implement optimistic UI updates, but ensure they roll back cleanly on error (see `useHybridChat.ts`).

---

## 🗂️ Complete File Tree & Explanations

### Root & Configuration
* `.env` / `.gitignore` / `.copyignore` - Environment variables and git rules.
* `package.json` / `pnpm-lock.yaml` - Dependencies (using pnpm).
* `components.json` - shadcn/ui configuration.
* `context.md` - The manifesto and architectural overview.
* `v2-journal.md` - Crucial documentation detailing our TTFT (Time To First Token) optimization sprint. Read this to understand the concurrent DB/LLM streaming logic.
* `TODO.md` - Project roadmap and checklist.
* `tsconfig.json` / `vite.config.ts` - TypeScript and Vite/Nitro build configurations (configured for Node.js serverless to support raw TCP Redis).
* `LiquidGlassSkill.md` - Documentation on implementing advanced glassmorphism CSS effects.

### Backend (`/convex`)
* `schema.ts` - The single source of truth for our relational database schema.
* `convex.config.ts` - Convex configuration, wiring up Better Auth.
* `auth.ts` / `auth.config.ts` - Better Auth integration, syncing auth users to our `users` table via Convex triggers.
* `admin.ts` - Admin-only queries/mutations (toggling signups, upgrading users, global app settings).
* `users.ts` - User profile queries and preference mutations.
* `threads.ts` - Management of conversation threads (pinning, branching, archiving, deleting).
* `messages.ts` - Core chat persistence. Handles self-healing zombie states and chunked DB fallback updates.
* `files.ts` - Secure, signed-URL generation and metadata storage for attachments.
* `folders.ts` - Organization system for grouping threads with custom system prompts.
* `imageGenerations.ts` - Tracking and persisting Fal.ai generated images.
* `http.ts` - HTTP router for webhook and auth endpoints.

### Frontend Routing (`/src/routes`)
* `__root.tsx` - The absolute root layout. Handles global providers, auth checking, and smooth animation cookie injection.
* `router.tsx` / `routeTree.gen.ts` - TanStack Router initialization and auto-generated tree.
* `index.tsx` - The Auth / Landing page.
* `chat.tsx` - The master Chat Layout. Houses the sidebar, input area, drag-and-drop global state, and mobile header.
* `chat/$threadId.tsx` / `chat/index.tsx` - Dynamic thread routes. Highly optimized to prevent layout thrashing on switch.
* `settings.tsx` - Settings shell layout.
* `settings/*.tsx` - Individual settings panels (account, api-keys, customization, history, models, etc.).
* `admin.tsx` - The administrative dashboard.
* `studio.tsx` - The Image Generation Studio interface.

### API Endpoints (`/src/routes/api`)
* `auth/$.ts` - Better Auth catch-all endpoint.
* `chat/index.ts` - **CRITICAL FILE.** The main message sending endpoint. Fires DB writes and LLM streams concurrently. Reads inline files, streams direct POST response via custom SSE.
* `chat/search.ts` - Dedicated endpoint for Web Search/Agentic queries.
* `chat/stream.ts` - The `GET` endpoint for reconnecting dropped streams via Redis `XREAD BLOCK`.
* `chat/stop.ts` - Endpoint to broadcast a Redis stop signal to halt generation.
* `image/generate.ts` - Serverless endpoint to hit Fal.ai and persist to Convex.
* `search/index.ts` - Exposed programmatic search endpoint.
* `transcribe/index.ts` - WebRTC audio parsing pushing to Fireworks Whisper.

### Core Libraries (`/src/lib`)
* `stream-manager.ts` - **CRITICAL FILE.** The beating heart of the UI. A global singleton managing SSE connections, Redis fallbacks, search state updates, and the `requestAnimationFrame` loop that paints text without React re-renders.
* `redis.ts` - Redis client configuration (`ioredis`). Used for Pub/Sub and fast token streaming.
* `hybrid-chat.ts` -> mapped into hooks.
* `attachment-context.ts` - Highly optimized client-side token estimation for local files (images, text, markdown) to warn users before hitting limits.
* `models.ts` - Global registry of all supported AI models, limits, capabilities, and provider routing.
* `hosts.ts` - Vercel AI SDK provider initialization (OpenAI, Anthropic, Google, XAI, Fireworks, DeepInfra, OpenRouter).
* `image-models.ts` / `image-store.ts` - Configurations for image gen models and a lightweight sync store for in-flight image generations.
* `auth-client.ts` / `auth-server.ts` - Better Auth wrapper instances.
* `transcription.ts` / `transcription-providers/*` - Interfaces for audio-to-text.
* `web-search/*` - The orchestration engine for web search. Uses AI SDK with custom tool definitions (`firecrawl.ts`, `orchestrator.ts`) to dispatch multi-agent swarms.
* `utils.ts` - Standard Tailwind class merging (`cn`).

### Custom Hooks (`/src/hooks`)
* `useHybridChat.ts` - **CRITICAL FILE.** Merges optimistic local UI state with DB state and the global `streamManager`.
* `useStreamManagerSnapshot.ts` - Hooks up React components to the `streamManager` using `useSyncExternalStore`.
* `useSmartScroll.ts` - Manages chat scrolling. Avoids jumping and thrashing. Suspends auto-scroll if the user scrolls up.
* `useVoiceRecorder.ts` - Custom WebRTC audio recording and transcription state machine.
* `useFileUpload.ts` - Manages concurrent file uploads to Convex storage.
* `useKeyboardHeight.ts` - iOS/Android virtual keyboard layout shift compensator via Visual Viewport API.
* `use-mobile.ts` - Responsive breakpoint listener.

### Components (`/src/components`)
* `MarkdownMessage.tsx` - Renders the AI output. Optimizes parsing by removing math/katex during the live stream and applying them post-stream. Bridges to the Shiki worker.
* `ThinkingBlock.tsx` - The collapsible "Reasoning Trace" UI for models like DeepSeek/Grok.
* `WebSearchProgress.tsx` - Beautiful, animated, real-time visualization of agentic web searches and parallel swarms.
* `ModelSelector.tsx` - The dropdown for picking AI models. Includes capability badges and cost indicators.
* `VoiceInput.tsx` - The animated microphone button and recording state UI.
* `MessageAttachments.tsx` / `MessageFilePreview.tsx` - Renders files attached to messages, injecting signed URLs dynamically.
* `CreateFolderDialog.tsx` / `EditFolderDialog.tsx` - UI for managing context folders.
* `settings/*` - Reusable UI primitives for the settings pages.
* `ui/*` - Highly customized shadcn/ui and Radix UI primitives (Button, Dialog, Sheet, Sidebar, Tooltip, Sonner, etc.).

### Web Workers (`/src/workers`)
* `shiki.worker.ts` - **CRITICAL FILE.** Offloads Shiki AST parsing and syntax highlighting from the main thread. Ensures code blocks do not cause scrolling stutter during active streaming.

### Styles
* `src/styles/app.css` - Tailwind v4 CSS configuration. Contains all custom CSS variables, deep dark-mode specific tweaks, and custom keyframe animations (`suck-in`, `pop-in`, `studio-shimmer`, `folder-glow-breathe`, etc.).

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
