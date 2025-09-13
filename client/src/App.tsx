import { useEffect, useMemo, useState } from 'react';
import { Identity } from '@clockworklabs/spacetimedb-sdk';
import {
  DbConnection,
  type ErrorContext,
  type EventContext,
  Message,
  User,
} from './module_bindings';
import './App.css';

const uri = import.meta.env.VITE_STDB_URI as string;
const moduleName = import.meta.env.VITE_STDB_MODULE as string;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [conn, setConn] = useState<DbConnection | null>(null);
  const [newName, setNewName] = useState('');
  const [newMessage, setNewMessage] = useState('');

  // State sourced from SpacetimeDB
  const [messages, setMessages] = useState<Message[]>([]);
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

      // Subscribe to data we care about
      subscribeToQueries(c, [
        'SELECT * FROM message',
        'SELECT * FROM user',
      ]);
    };

    const onDisconnect = () => setConnected(false);
    const onConnectError = (_ctx: ErrorContext, err: Error) =>
      console.error('Connect error', err);

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
  }, []);

  // Hook up row change callbacks -> React state
  useEffect(() => {
    if (!conn) return;

    const onMsgInsert = (_: EventContext, m: Message) =>
      setMessages(prev => [...prev, m]);
    const onMsgDelete = (_: EventContext, m: Message) =>
      setMessages(prev => prev.filter(x =>
        !(x.text === m.text && x.sent === m.sent && x.sender === m.sender)
      ));

    conn.db.message.onInsert(onMsgInsert);
    conn.db.message.onDelete(onMsgDelete);

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
      conn.db.message.removeOnInsert(onMsgInsert);
      conn.db.message.removeOnDelete(onMsgDelete);
      conn.db.user.removeOnInsert(onUserInsert);
      conn.db.user.removeOnUpdate(onUserUpdate);
      conn.db.user.removeOnDelete(onUserDelete);
    };
  }, [conn]);

  const prettyMessages = useMemo(() => {
    const nameOf = (id?: Identity | null) =>
      (id && users.get(id.toHexString())?.name) ||
      (id && id.toHexString().slice(0, 8)) ||
      'unknown';
    return [...messages].sort((a,b)=>(a.sent > b.sent ? 1 : -1)).map(m => ({
      from: nameOf(m.sender),
      text: m.text
    }));
  }, [messages, users]);

  if (!conn || !connected || !identity) {
    return <div className="app app--center"><div className="loader"/><p className="status">Connecting…</p></div>;
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">SpacetimeDB Chat</h1>
        <div className="identity">Connected as <code>{identity.toHexString().slice(0, 8)}</code></div>
      </header>

      <section className="panel">
        <form className="form form--inline" onSubmit={e => { e.preventDefault(); conn.reducers.setName(newName); setNewName(''); }}>
          <div className="field">
            <input className="input" placeholder="Set your name" value={newName} onChange={e=>setNewName(e.target.value)} />
          </div>
          <button className="btn btn--primary" type="submit" disabled={!newName.trim()}>Save</button>
        </form>

        <form className="form form--inline mt" onSubmit={e => { e.preventDefault(); conn.reducers.sendMessage(newMessage); setNewMessage(''); }}>
          <div className="field grow">
            <input className="input" placeholder="Say something…" value={newMessage} onChange={e=>setNewMessage(e.target.value)} />
          </div>
          <button className="btn btn--accent" type="submit" disabled={!newMessage.trim()}>Send</button>
        </form>
      </section>

      <section className="panel panel--messages">
        <h2 className="panel__title">Messages Hey <span className="badge">{prettyMessages.length}</span></h2>
        <ul className="messages">
          {prettyMessages.map((m, i) => (
            <li key={i} className="message">
              <div className="message__avatar" aria-hidden>{m.from.slice(0,2).toUpperCase()}</div>
              <div className="message__body">
                <span className="message__from">{m.from}</span>
                <span className="message__text">{m.text}</span>
              </div>
            </li>
          ))}
          {prettyMessages.length === 0 && <li className="message message--empty">No messages yet. Start the conversation!</li>}
        </ul>
      </section>

      <footer className="footer">Powered by SpacetimeDB • Demo</footer>
    </div>
  );
}
