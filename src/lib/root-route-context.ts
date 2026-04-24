export type RootRouteContextSnapshot = {
  isAuthenticated: boolean;
  token: string | null;
};

let clientRootRouteContextCache: RootRouteContextSnapshot | null = null;

export function getClientRootRouteContextCache() {
  return clientRootRouteContextCache;
}

export function setClientRootRouteContextCache(snapshot: RootRouteContextSnapshot) {
  clientRootRouteContextCache = snapshot;
}

export function clearClientRootRouteContextCache() {
  clientRootRouteContextCache = null;
}
