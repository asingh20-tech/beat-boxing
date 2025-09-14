/* eslint-disable @typescript-eslint/no-explicit-any */
// Self-contained SpaceTimeDB wrapper for gameclient (no cross-root imports)
// Loads SDK at runtime from CDN to avoid bundler resolution issues.

export type SpacetimeState = {
  conn: any | null;
  identity: any | null;
  connected: boolean;
  error: string | null;
};

let __sdk: any | null = null;
let __conn: any | null = null;

async function loadSdk() {
  if (__sdk) return __sdk;
  const env: Record<string, string | undefined> = (import.meta as unknown as { env: Record<string, string | undefined> }).env || {};
  const url = env.VITE_STDB_SDK_URL || 'https://esm.run/@clockworklabs/spacetimedb-sdk@1.3.1';
  const dynImport = new Function('u', 'return import(u);') as (u: string) => Promise<unknown>;
  __sdk = await dynImport(url);
  return __sdk;
}

export async function connectSpacetime(savedToken?: string): Promise<SpacetimeState> {
  const env: Record<string, string | undefined> = (import.meta as unknown as { env: Record<string, string | undefined> }).env || {};
  const uri = env.VITE_STDB_URI || 'https://maincloud.spacetimedb.com';
  const moduleName = env.VITE_STDB_MODULE;
  const state: SpacetimeState = { conn: null, identity: null, connected: false, error: null };
  if (!moduleName) {
    state.error = 'VITE_STDB_MODULE not set';
    return state;
  }
  try {
    const sdk = await loadSdk();
    // Connect using whichever shape exists
    if ((sdk as any).connect) {
      __conn = await (sdk as any).connect({ uri, module: moduleName, token: savedToken });
    } else if ((sdk as any).SpaceTime?.connect) {
      __conn = await (sdk as any).SpaceTime.connect({ uri, module: moduleName, token: savedToken });
    } else if ((sdk as any).default?.connect) {
      __conn = await (sdk as any).default.connect({ uri, module: moduleName, token: savedToken });
    } else {
      throw new Error('No compatible connect() found in SDK');
    }
    state.conn = __conn;
    // Try to retrieve identity/token if available
    try {
      const id = (typeof __conn.getIdentity === 'function') ? await __conn.getIdentity() : null;
      state.identity = id ?? null;
    } catch { void 0; }
    state.connected = true;
    // Persist token if exposed
    try {
      const token = (typeof __conn.getToken === 'function') ? await __conn.getToken() : savedToken;
      if (token) localStorage.setItem('auth_token', token as string);
    } catch { void 0; }
    return state;
  } catch (e) {
    state.error = e instanceof Error ? e.message : 'Failed to connect';
    return state;
  }
}

export function getConn() { return __conn; }

async function callReducer(name: string, args: any[] = []) {
  const conn = getConn();
  if (!conn) throw new Error('Not connected');
  if (typeof (conn as any).callReducer === 'function') return (conn as any).callReducer(name, args);
  if (typeof (conn as any).call === 'function') return (conn as any).call(name, args);
  throw new Error('Reducer call API not available');
}

export const LobbyApi = {
  // keep signature (conn, code) for callers; we ignore the first arg
  create: async (_conn: unknown, code: string) => { await callReducer('create_lobby', [code]); },
  join: async (_conn: unknown, code: string) => { await callReducer('join_lobby', [code]); },
  increment: async (_conn: unknown, code: string) => { try { await callReducer('increment_by', [code, 1]); } catch { await callReducer('increment', [code]); } },
};

export type Lobby = { code: string } & Record<string, unknown>;

export function subscribeLobby(code: string, onChange: (row: Lobby | null) => void): () => void {
  const conn = getConn();
  if (!conn) return () => {};
  const subscribe = (conn as any).subscribe || (conn as any).on;
  if (!subscribe) return () => {};
  const CODE = code.toUpperCase();
  const query = `SELECT * FROM lobby WHERE code='${CODE}'`;
  let sub: any;
  (async () => {
    try {
      sub = await subscribe.call(conn, query, (rows: any[]) => {
        const row = Array.isArray(rows) ? rows[0] : null;
        onChange(row || null);
      });
    } catch (e) {
      console.warn('subscribeLobby failed', e);
    }
  })();
  return () => {
    try { sub?.unsubscribe?.(); } catch { void 0; }
    try { sub?.close?.(); } catch { void 0; }
  };
}
