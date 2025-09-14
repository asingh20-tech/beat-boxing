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
        try { localStorage.setItem('auth_token', token); } catch { /* ignore quota/unavailable */ }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(conn: DbConnection, code: string) { (conn as any).reducers.createLobby(code); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  join(conn: DbConnection, code: string) { (conn as any).reducers.joinLobby(code); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  increment(conn: DbConnection, code: string) { (conn as any).reducers.increment(code); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setCharacter(conn: DbConnection, code: string, character: string) { (conn as any).reducers.callReducer?.("set_character", undefined, undefined); (conn as any).reducers.setCharacter?.(code, character); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setReady(conn: DbConnection, code: string, ready: boolean) { (conn as any).reducers.setReady?.(code, ready); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSong(conn: DbConnection, code: string, songId: string) { (conn as any).reducers.setSong?.(code, songId); },
};

export function subscribeLobby(code: string, onChange: (row: Lobby | null) => void): () => void {
  const conn = getConn();
  if (!conn) return () => {};
  const CODE = code.toUpperCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rt = conn as any;

  const onInsert = (_ctx: EventContext, row: Lobby) => { if (row.code.toUpperCase() === CODE) onChange(row); };
  const onUpdate = (_ctx: EventContext, _old: Lobby, row: Lobby) => { if (row.code.toUpperCase() === CODE) onChange(row); };
  const onDelete = (_ctx: EventContext, row: Lobby) => { if (row.code.toUpperCase() === CODE) onChange(null); };

  rt.db.lobby.onInsert(onInsert);
  rt.db.lobby.onUpdate(onUpdate);
  rt.db.lobby.onDelete(onDelete);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub: any = conn.subscriptionBuilder();
  // some SDK versions provide onApplied; if present use it to send initial snapshot
  if (typeof sub.onApplied === 'function') {
    sub.onApplied(() => {
      const row = rt.db.lobby.code.find(CODE) || null;
      onChange(row);
    });
  }
  sub.subscribe([`SELECT * FROM lobby WHERE code='${CODE}'`]);

  return () => {
    rt.db.lobby.removeOnInsert(onInsert);
    rt.db.lobby.removeOnUpdate(onUpdate);
    rt.db.lobby.removeOnDelete(onDelete);
  };
}
