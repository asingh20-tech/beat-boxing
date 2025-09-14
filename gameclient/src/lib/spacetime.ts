// Typed SpaceTimeDB wrapper using local generated bindings

import { DbConnection, type ErrorContext, type EventContext, type Lobby } from '../module_bindings';

export type SpacetimeState = {
  conn: DbConnection | null;
  identity: unknown | null;
  connected: boolean;
  error: string | null;
};

let currentConn: DbConnection | null = null;
let currentIdentity: unknown | null = null;

export async function connectSpacetime(savedToken?: string): Promise<SpacetimeState> {
  return new Promise((resolve) => {
    const uri = import.meta.env.VITE_STDB_URI as string;
    const moduleName = import.meta.env.VITE_STDB_MODULE as string;
    const state: SpacetimeState = { conn: null, identity: null, connected: false, error: null };
    let resolved = false;

    const builder = DbConnection.builder()
      .withUri(uri)
      .withModuleName(moduleName)
      .withToken(savedToken)
      .onConnect((c: DbConnection, id: unknown, token: string) => {
        try { localStorage.setItem('auth_token', token); } catch (e) { /* ignore quota/unavailable */ }
        state.conn = c;
        state.identity = id;
        state.connected = true;
        currentConn = c;
        currentIdentity = id;
        if (!resolved) { resolved = true; resolve(state); }
      })
      .onConnectError((_ctx: ErrorContext, err: Error) => {
        state.error = err instanceof Error ? err.message : 'Connect error';
        if (!resolved) { resolved = true; resolve(state); }
      })
      .onDisconnect(() => {
        state.connected = false;
      });

    const conn = builder.build();
    currentConn = conn;
    state.conn = conn;

    // Always subscribe to user presence
    conn.subscriptionBuilder().subscribe(['SELECT * FROM user']);

    // Timeout as a fallback
    setTimeout(() => {
      if (!resolved && !state.connected) {
        state.error = 'Timeout connecting to SpaceTimeDB';
        resolved = true; resolve(state);
      }
    }, 6000);
  });
}

export function getConn(): DbConnection | null { return currentConn; }
export function getIdentity(): unknown | null { return currentIdentity; }

export const LobbyApi = {
  create(conn: DbConnection, code: string) { conn.reducers.createLobby(code); },
  join(conn: DbConnection, code: string) { conn.reducers.joinLobby(code); },
  increment(conn: DbConnection, code: string) { conn.reducers.increment(code); },
};

export function subscribeLobby(code: string, onChange: (row: Lobby | null) => void): () => void {
  const conn = getConn();
  if (!conn) return () => {};
  const CODE = code.toUpperCase();

  const onInsert = (_ctx: EventContext, row: Lobby) => { if (row.code.toUpperCase() === CODE) onChange(row); };
  const onUpdate = (_ctx: EventContext, _old: Lobby, row: Lobby) => { if (row.code.toUpperCase() === CODE) onChange(row); };
  const onDelete = (_ctx: EventContext, row: Lobby) => { if (row.code.toUpperCase() === CODE) onChange(null); };

  conn.db.lobby.onInsert(onInsert);
  conn.db.lobby.onUpdate(onUpdate);
  conn.db.lobby.onDelete(onDelete);

  conn
    .subscriptionBuilder()
  // some SDK versions provide onApplied; if present use it to send initial snapshot
  // optional chaining guards if not available
  .onApplied?.(() => {
      const row = conn.db.lobby.code.find(CODE) || null;
      onChange(row);
    })
    .subscribe([`SELECT * FROM lobby WHERE code='${CODE}'`]);

  return () => {
    conn.db.lobby.removeOnInsert(onInsert);
    conn.db.lobby.removeOnUpdate(onUpdate);
    conn.db.lobby.removeOnDelete(onDelete);
  };
}
