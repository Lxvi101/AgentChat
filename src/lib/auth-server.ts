import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start'

export const {
  handler,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthReactStart({
  convexUrl: (import.meta as any).env.VITE_CONVEX_URL!,
  convexSiteUrl: (import.meta as any).env.VITE_CONVEX_SITE_URL!,
  // TTFT optimization: verify the JWT from the session cookie locally via
  // `jose.decodeJwt` instead of round-tripping to `/api/auth/convex/token`
  // over the network on every `getToken()` call. On cache hit this is
  // ~0ms vs. 30-100ms for the HTTP verify. The package still falls back to
  // a network refresh when the cached JWT is within 60s of expiry (default
  // tolerance) or missing entirely.
  jwtCache: {
    enabled: true,
    // Required by the type contract. Only exercised by the unused
    // `fetchAuthQuery` / `fetchAuthMutation` / `fetchAuthAction` wrappers
    // (our chat hot path uses `getToken()` + `ConvexHttpClient` directly).
    // If we ever call those wrappers and hit an auth error, treat
    // "unauthenticated"-flavored errors as real auth failures so the
    // wrapper doesn't waste a refresh round-trip. Anything else falls
    // through to a forced-refresh retry in case the cached JWT was stale.
    isAuthError: (error) => {
      if (!(error instanceof Error)) return false
      const msg = error.message.toLowerCase()
      return msg.includes('unauthenticated') || msg.includes('unauthorized')
    },
  },
})
