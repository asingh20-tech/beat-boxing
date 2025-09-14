import { useEffect, useMemo, useState } from 'react';
import { Identity } from '@clockworklabs/spacetimedb-sdk';
import {
  DbConnection,
  type ErrorContext,
  type EventContext,
  Lobby,
  User,
} from './module_bindings';
import './App.css';

const uri = import.meta.env.VITE_STDB_URI as string;
const moduleName = import.meta.env.VITE_STDB_MODULE as string;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [conn, setConn] = useState<DbConnection | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [codeNotice, setCodeNotice] = useState<string | null>(null);

  // State sourced from SpacetimeDB
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [users, setUsers] = useState<Map<string, User>>(new Map());

  useEffect(() => {
    const subscribeToQueries = (c: DbConnection, queries: string[]) => {
      c.subscriptionBuilder()
        .onApplied(() => console.log('Client cache initialized'))
        .subscribe(queries);
    };

    const onConnect = (c: DbConnection, id: Identity, token: string) => {
      setIdentity(id);
      setConnected(true);
      localStorage.setItem('auth_token', token);

      // Subscribe to data we care about (user presence and any lobbies we view)
      subscribeToQueries(c, [
        'SELECT * FROM user',
      ]);
    };

    const onDisconnect = () => setConnected(false);
    const onConnectError = (_ctx: ErrorContext, err: Error) => {
      console.error('Connect error', err);
      setConnectError(err?.message || 'Failed to connect');
    };

    const saved = localStorage.getItem('auth_token') || undefined;

    setConn(
      DbConnection.builder()
        .withUri(uri)               // <- Maincloud host
        .withModuleName(moduleName) 
        .withToken(saved)           // omit/undefined to mint a new identity
        .onConnect(onConnect)
        .onDisconnect(onDisconnect)
        .onConnectError(onConnectError)
        .build()
    );

    // Surface a timeout if connect hangs
    const t = setTimeout(() => {
      if (!connected) {
        setConnectError(prev => prev ?? 'Timeout connecting. Check module name and host.');
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [connected]);

  // Hook up row change callbacks -> React state
  useEffect(() => {
    if (!conn) return;

    // Lobby updates
    const onLobbyInsert = (_: EventContext, l: Lobby) => {
      if (currentCode && l.code.toUpperCase() === currentCode.toUpperCase()) setLobby(l);
    };
    const onLobbyUpdate = (_: EventContext, _old: Lobby, l: Lobby) => {
      if (currentCode && l.code.toUpperCase() === currentCode.toUpperCase()) setLobby(l);
    };
    const onLobbyDelete = (_: EventContext, l: Lobby) => {
      if (currentCode && l.code.toUpperCase() === currentCode.toUpperCase()) setLobby(null);
    };

    conn.db.lobby.onInsert(onLobbyInsert);
    conn.db.lobby.onUpdate(onLobbyUpdate);
    conn.db.lobby.onDelete(onLobbyDelete);

    const onUserInsert = (_: EventContext, u: User) =>
      setUsers(prev => new Map(prev.set(u.identity.toHexString(), u)));
    const onUserUpdate = (_: EventContext, ou: User, nu: User) =>
      setUsers(prev => {
        prev.delete(ou.identity.toHexString());
        return new Map(prev.set(nu.identity.toHexString(), nu));
      });
    const onUserDelete = (_: EventContext, u: User) =>
      setUsers(prev => {
        prev.delete(u.identity.toHexString());
        return new Map(prev);
      });

    conn.db.user.onInsert(onUserInsert);
    conn.db.user.onUpdate(onUserUpdate);
    conn.db.user.onDelete(onUserDelete);

    return () => {
      conn.db.lobby.removeOnInsert(onLobbyInsert);
      conn.db.lobby.removeOnUpdate(onLobbyUpdate);
      conn.db.lobby.removeOnDelete(onLobbyDelete);
      conn.db.user.removeOnInsert(onUserInsert);
      conn.db.user.removeOnUpdate(onUserUpdate);
      conn.db.user.removeOnDelete(onUserDelete);
    };
  }, [conn, currentCode]);

  // When currentCode changes, (re)subscribe to that lobby row
  useEffect(() => {
    if (!conn || !currentCode) return;
    const code = currentCode.toUpperCase();
    const query = `SELECT * FROM lobby WHERE code='${code}'`;
  conn
      .subscriptionBuilder()
      .onApplied(() => {
        // Seed from client cache if exists
        const row = conn.db.lobby.code.find(code);
    setLobby(row ?? null);
      })
      .subscribe([query]);
    return () => {
      setLobby(null);
    };
  }, [conn, currentCode]);

  const role = useMemo<'red' | 'blue' | null>(() => {
    if (!identity || !lobby) return null;
    const me = identity;
    if (lobby.red && lobby.red.toHexString() === me.toHexString()) return 'red';
    if (lobby.blue && lobby.blue.toHexString() === me.toHexString()) return 'blue';
    return null;
  }, [identity, lobby]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!conn || !currentCode || !role) return;
      if (e.key === ' ' || e.key === 'Enter') {
        conn.reducers.increment(currentCode);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [conn, currentCode, role]);

  if (!conn || !connected || !identity) {
    return (
      <div className="app app--center">
        <div className="loader"/>
        <p className="status">Connecting to SpaceTimeDB…</p>
        <p className="status">Module: <code>{moduleName || 'unset'}</code> • Host: <code>{uri || 'unset'}</code></p>
        {connectError && (
          <div className="panel" style={{maxWidth:520}}>
            <h2 className="panel__title">Connection problem</h2>
            <p style={{marginTop:0}}>{connectError}</p>
            <ul>
              <li>Check that VITE_STDB_MODULE matches the published module name.</li>
              <li>Or point VITE_STDB_URI to your local SpaceTimeDB host.</li>
              <li>If identities changed, try resetting your auth token.</li>
            </ul>
            <div style={{display:'flex', gap:8}}>
              <button className="btn" onClick={() => { localStorage.removeItem('auth_token'); location.reload(); }}>Reset identity</button>
              <button className="btn btn--primary" onClick={() => location.reload()}>Retry</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Two-Player Lobby Counters</h1>
        <div className="identity">Connected as <code>{identity.toHexString().slice(0, 8)}</code></div>
      </header>

      {/* Lobby controls */}
      <section className="panel">
        <form className="form form--inline" onSubmit={async e => {
          e.preventDefault();
          if (!conn) return;
          const gen = (len:number)=>Array.from(crypto.getRandomValues(new Uint8Array(len))).map(b=>"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b%36]).join("");
          const codeRaw = (codeInput.trim() || gen(6));
          const code = codeRaw.toUpperCase();
          conn.reducers.createLobby(code);
          setCurrentCode(code);
          setCodeInput(code);
          try {
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(code);
              setCodeNotice(`Lobby code ${code} created and copied to clipboard`);
            } else {
              setCodeNotice(`Lobby code ${code} created`);
            }
          } catch {
            setCodeNotice(`Lobby code ${code} created`);
          }
        }}>
          <div className="field">
            <input className="input" placeholder="Create or enter lobby code" value={codeInput} onChange={e=>setCodeInput(e.target.value)} />
          </div>
          <button className="btn btn--primary" type="submit" disabled={!codeInput.trim()}>Create Lobby</button>
          <button className="btn" type="button" onClick={() => {
            const code = codeInput.trim().toUpperCase();
            if (!conn || !code) return;
            conn.reducers.joinLobby(code);
            setCurrentCode(code);
          }} disabled={!codeInput.trim()}>Join Lobby</button>
        </form>
  {codeNotice && <div className="status" style={{marginTop:8}}>{codeNotice}</div>}
      </section>

      {currentCode && (
        <section className="panel">
          <h2 className="panel__title">Lobby <code>{currentCode}</code></h2>
          <div style={{display:'flex', gap:8, marginBottom:12}}>
            <button className="btn" onClick={async()=>{
              if (!currentCode) return;
              try {
                if (navigator.clipboard && window.isSecureContext) {
                  await navigator.clipboard.writeText(currentCode);
                  setCodeNotice(`Copied ${currentCode} to clipboard`);
                }
              } catch { /* ignore clipboard errors */ }
            }}>Copy Code</button>
          </div>
          {!lobby && <p className="status">Loading lobby…</p>}
          {lobby && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16, alignItems:'center'}}>
              <div style={{background:'#2a0f12', border:'1px solid #57161b', borderRadius:12, padding:16}}>
                <h3 style={{marginTop:0, color:'#ef4444'}}>Red</h3>
                <div style={{fontSize:48, fontWeight:700}}>{lobby.red_count}</div>
                <div style={{opacity:.8, marginTop:6}}>{lobby.red ? (users.get(lobby.red.toHexString())?.name ?? lobby.red.toHexString().slice(0,8)) : '— empty —'}</div>
              </div>
              <div style={{background:'#0f1b2a', border:'1px solid #1e3a8a', borderRadius:12, padding:16}}>
                <h3 style={{marginTop:0, color:'#3b82f6'}}>Blue</h3>
                <div style={{fontSize:48, fontWeight:700}}>{lobby.blue_count}</div>
                <div style={{opacity:.8, marginTop:6}}>{lobby.blue ? (users.get(lobby.blue.toHexString())?.name ?? lobby.blue.toHexString().slice(0,8)) : '— empty —'}</div>
              </div>
              <div style={{gridColumn:'1 / span 2', display:'flex', gap:12, alignItems:'center'}}>
                <button className="btn btn--accent" onClick={()=> conn!.reducers.increment(currentCode)} disabled={!role}>Increment ({role ?? 'spectating'})</button>
                <span className="status">Tip: press Space or Enter to increment</span>
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="footer">Powered by SpacetimeDB • Lobby Demo</footer>
    </div>
  );
}
