// Capture the browser's ORIGINAL pushState/replaceState before TanStack
// Router monkey-patches them.  This lets us change the URL bar without
// triggering the router, essential for the chat ↔ studio transition
// where we want to keep the component tree mounted.

export const nativePushState: typeof history.pushState =
  typeof window !== "undefined"
    ? window.history.pushState.bind(window.history)
    : (() => {});

export const nativeReplaceState: typeof history.replaceState =
  typeof window !== "undefined"
    ? window.history.replaceState.bind(window.history)
    : (() => {});
