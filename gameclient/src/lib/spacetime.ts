// Reuse the generated bindings from the client app for now
import { DbConnection, type ErrorContext } from '@stdb';
import type { Identity, Lobby, EventContext } from '@stdb';

export type SpacetimeState = {
  conn: DbConnection | null;
  identity: Identity | null;
  connected: boolean;
  error: string | null;
};

export async function connectSpacetime(savedToken?: string): Promise<SpacetimeState> {
  return new Promise((resolve) => {
    const uri = import.meta.env.VITE_STDB_URI as string;
    const moduleName = import.meta.env.VITE_STDB_MODULE as string;
    let resolved = false;
    const state: SpacetimeState = { conn: null, identity: null, connected: false, error: null };

    const builder = DbConnection.builder()
      .withUri(uri)
      .withModuleName(moduleName)
      .withToken(savedToken)
      .onConnect((c: DbConnection, id: Identity, token: string) => {
        localStorage.setItem('auth_token', token);
        state.conn = c;
        state.identity = id;
        state.connected = true;
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
  state.conn = conn;
  currentConn = conn;
    // subscribe to user always
    conn.subscriptionBuilder().subscribe(['SELECT * FROM user']);
    // timeout fallback
    setTimeout(() => {
      if (!resolved && !state.connected) {
        state.error = 'Timeout connecting to SpaceTimeDB';
        resolved = true; resolve(state);
      }
    }, 6000);
  });
}

let currentConn: DbConnection | null = null;
export function getConn(): DbConnection | null { return currentConn; }

export const LobbyApi = {
  create(conn: DbConnection, code: string) { conn.reducers.createLobby(code); },
  join(conn: DbConnection, code: string) { conn.reducers.joinLobby(code); },
  increment(conn: DbConnection, code: string) { conn.reducers.increment(code); },
}

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
    .onApplied(() => {
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
