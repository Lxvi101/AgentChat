# Contributing to AgentChat

Thanks for your interest in contributing! AgentChat is an open-source AI chat portal built for speed, and we'd love your help making it even better.

## Getting Started

1. **Fork the repository** and clone your fork locally.
2. **Install dependencies** with `pnpm install` (requires pnpm 10+).
3. **Set up your environment** by copying `.env.example` to `.env.local` and filling in the required values (see the [README](README.md) for details).
4. **Start the dev server** with `pnpm dev`.

## Development Workflow

### Branch Naming

Use descriptive branch names prefixed by type:

- `feat/voice-input-improvements`
- `fix/scroll-jump-on-stream`
- `refactor/stream-manager-cleanup`
- `docs/deployment-guide`

### Code Style

- **TypeScript strict mode** is enabled. No `any` unless absolutely necessary at external boundaries.
- **Performance is king.** Never put high-frequency data (streaming tokens, scroll position) into React `useState`. Use `useSyncExternalStore`, refs, or direct DOM mutations.
- **Memoize aggressively.** Every component should be wrapped in `React.memo` where appropriate. Use `useMemo` and `useCallback` to prevent unnecessary re-renders.
- **Animations use spring physics.** Use Framer Motion with spring configs, not linear easings.
- **Separation of concerns:**
  - `src/lib/`, Pure business logic. No React.
  - `src/hooks/`, React glue connecting lib to components.
  - `src/components/`, Rendering layers. Keep them lean.
  - `src/routes/`, Page layouts and API endpoints.

### Commit Messages

Write clear, concise commit messages that explain **why**, not just what:

```
fix: prevent layout thrash when switching threads mid-stream

The thread view was re-mounting on every navigation because the key
included the stream status. Switched to a stable key based on threadId
only.
```

### Testing Your Changes

Before submitting a PR, verify:

1. `pnpm build` completes without errors.
2. The streaming experience is smooth, no visible jank when tokens arrive.
3. Navigation between threads, settings, and studio is instant.
4. Your changes work on both desktop and mobile viewports.

## Pull Requests

1. **Keep PRs focused.** One feature or fix per PR. Large refactors should be discussed in an issue first.
2. **Write a clear description.** Explain what changed, why, and how to test it.
3. **Include screenshots or recordings** for UI changes.
4. **Don't break the streaming architecture.** If your change touches `stream-manager.ts`, `useHybridChat.ts`, or the RAF loop, call it out explicitly so reviewers pay extra attention.

### PR Template

```markdown
## Summary
- Brief description of what this PR does

## Test Plan
- [ ] Verified streaming works without jank
- [ ] Tested on mobile viewport
- [ ] No new TypeScript errors introduced

## Screenshots
(if applicable)
```

## Reporting Issues

When opening an issue, please include:

- **What you expected** vs. what happened.
- **Steps to reproduce** (as minimal as possible).
- **Browser and OS** (especially for rendering or performance issues).
- **Console errors** (if any).

## Architecture Notes

Before diving into the code, read the [CLAUDE.md](CLAUDE.md) file. It contains a detailed map of the entire codebase, the streaming architecture, and the performance principles that guide every decision.

The key insight: **we never re-render when we don't need it.** The `stream-manager.ts` singleton manages SSE connections and paints text via `requestAnimationFrame`. Syntax highlighting is offloaded to a Web Worker. This is what makes AgentChat feel like a native app. Protect this architecture in your contributions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
