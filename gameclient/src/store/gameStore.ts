import { create } from 'zustand';
import { connectSpacetime, getConn, LobbyApi, subscribeLobby } from '../lib/spacetime';

let lobbyUnsub: (() => void) | null = null;

export interface Song {
  id: string;
  title: string;
  bpm: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface Player {
  characterId: string | null;
  ready: boolean;
}

export interface Lobby {
  mode: 'solo' | 'host' | 'join';
  code: string | null;
  connectedP2: boolean;
  p1Ready: boolean;
  p2Ready: boolean;
  redPresent?: boolean;
  bluePresent?: boolean;
  // which side this client is? 'red' means Player 1, 'blue' means Player 2
  side?: 'red' | 'blue';
}

export interface Settings {
  volume: number;
  scanlines: boolean;
}

export interface Gameplay {
  started: boolean;
  paused: boolean;
  scoreP1: number;
  scoreP2: number;
  comboP1: number;
  comboP2: number;
  accuracyP1: number;
  accuracyP2: number;
  healthP1: number;
  healthP2: number;
  gameOver: boolean;
}

export interface GameState {
  currentScreen: 'TITLE' | 'HOME' | 'SONG_SELECT' | 'GAME' | 'HOW_TO_PLAY' | 'SETTINGS' | 'RESULTS';
  song: Song | null;
  players: {
    p1: Player;
    p2: Player;
  };
  lobby: Lobby;
  settings: Settings;
  gameplay: Gameplay;
  // Last run results (populated when a song finishes)
  lastResults?: {
    totalNotes: number;
    perfectHits: number;
    greatHits: number;
    goodHits: number;
    missedHits: number;
    accuracy: number;
  } | null;
  netConnected?: boolean;
  netError?: string | null;
  
  // Actions
  setScreen: (screen: GameState['currentScreen']) => void;
  setResults: (results: NonNullable<GameState['lastResults']>) => void;
  selectSong: (song: Song) => void;
  selectCharacter: (player: 1 | 2, characterId: string) => void;
  setMode: (mode: 'solo' | 'multiplayer') => void;
  hostLobby: () => void;
  joinLobby: (code: string) => void;
  toggleReady: (player: 1 | 2) => void;
  startMatch: () => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateGameplay: (gameplay: Partial<Gameplay>) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  currentScreen: 'TITLE',
  lastResults: null,
  song: null,
  players: {
    p1: { characterId: null, ready: false },
    p2: { characterId: null, ready: false },
  },
  lobby: {
    mode: 'solo',
    code: null,
    connectedP2: false,
    p1Ready: false,
    p2Ready: false,
  redPresent: false,
  bluePresent: false,
  side: undefined,
  },
  settings: {
    volume: 0.8,
  scanlines: false,
  },
  gameplay: {
    started: false,
    paused: false,
    scoreP1: 0,
    scoreP2: 0,
    comboP1: 0,
    comboP2: 0,
    accuracyP1: 100,
    accuracyP2: 100,
    healthP1: 100,
    healthP2: 100,
    gameOver: false,
  },

  setScreen: (screen) => set({ currentScreen: screen }),

  setResults: (results) => set({ lastResults: results }),
  
  selectSong: (song) => {
    console.log('SongSelected', { id: song.id, title: song.title, bpm: song.bpm, difficulty: song.difficulty });
    set({ song });
    // Persist song to lobby if in multiplayer
    const st = get();
    const conn = getConn();
    if (st.lobby.mode !== 'solo' && st.lobby.code && conn) {
      try { LobbyApi.setSong(conn, st.lobby.code, song.id); } catch (e) { console.warn('setSong failed', e); }
    }
  },
  
  selectCharacter: (player, characterId) => {
    console.log('CharacterSelected', { player, characterId });
    set((state) => ({
      players: {
        ...state.players,
        [player === 1 ? 'p1' : 'p2']: {
          characterId,
          ready: true,
        },
      },
    }));
    // Persist local player's character to server
    const st = get();
    const conn = getConn();
    const localPlayer = st.lobby.side === 'blue' ? 2 : 1;
    if (st.lobby.mode !== 'solo' && player === localPlayer && st.lobby.code && conn) {
      try { LobbyApi.setCharacter(conn, st.lobby.code, characterId); } catch (e) { console.warn('setCharacter failed', e); }
    }
  },
  
  setMode: (mode) => {
    if (mode === 'multiplayer') {
  // Flip to multiplayer immediately so Song Select renders the lobby UI
  set((state) => ({ lobby: { ...state.lobby, mode: 'host', code: null, connectedP2: false, p1Ready: false, p2Ready: false, redPresent: false, bluePresent: false } }));
  // Open SpaceTimeDB connection if not already created
  if (!getConn()) {
    const saved = localStorage.getItem('auth_token') || undefined;
    void connectSpacetime(saved).then(({ connected, error }) => set({ netConnected: connected, netError: error ?? null }));
  } else {
    set({ netConnected: true, netError: null });
  }
    } else {
      set((state) => ({
        lobby: {
          ...state.lobby,
          mode: 'solo',
          code: null,
          connectedP2: false,
          p1Ready: false,
          p2Ready: false,
        },
      }));
    }
  },
  
  hostLobby: () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log('LobbyHosted', { code });
    const conn = getConn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doCreate = (c: any) => { try { LobbyApi.create(c, code); } catch (e) { console.warn('Create reducer failed', e); } };
    if (conn && get().netConnected) {
      doCreate(conn);
      // If a song is already selected locally, persist it immediately
      const s = get().song;
      if (s) { try { LobbyApi.setSong(conn, code, s.id); } catch (e) { console.warn('setSong (host immediate) failed', e); } }
    } else {
      const saved = localStorage.getItem('auth_token') || undefined;
      void connectSpacetime(saved).then((st) => {
        set({ netConnected: st.connected, netError: st.error });
        if (st.conn && st.connected) {
          doCreate(st.conn);
          const s = get().song;
          if (s) { try { LobbyApi.setSong(st.conn, code, s.id); } catch (e) { console.warn('setSong (host connect) failed', e); } }
        }
      });
    }
  set((state) => ({
      lobby: {
        ...state.lobby,
        mode: 'host',
        code,
        p1Ready: false,
        p2Ready: false,
    side: 'red',
      },
    }));
    // subscribe to lobby row to reflect P2 presence
  const unsub = subscribeLobby(code, (row) => {
      set((state) => ({
        lobby: {
          ...state.lobby,
          connectedP2: !!row?.red && !!row?.blue,
          redPresent: !!row?.red,
          bluePresent: !!row?.blue,
          // host stays red; we don't flip sides here
          side: state.lobby.side,
          p1Ready: row?.red_ready ?? state.lobby.p1Ready,
          p2Ready: row?.blue_ready ?? state.lobby.p2Ready,
        }
      }));
      // If server says started, ensure we're on GAME screen
      if (row?.started) {
        if (get().currentScreen !== 'GAME') {
          set({ currentScreen: 'GAME' });
        }
      }
      // If we're the host and row has no song_id yet, push our current song
      if (get().lobby.side === 'red' && row) {
        const localSongId = get().song?.id;
        const remoteSongId = row.song_id ?? null;
        if (localSongId && !remoteSongId) {
          const c = getConn();
          if (c && get().lobby.code) {
            try { LobbyApi.setSong(c, get().lobby.code!, localSongId); } catch (e) { console.warn('setSong (host sync) failed', e); }
          }
        }
      }
      // Mirror opponent character and scores if present
      if (row) {
        set((state) => ({
          players: {
            p1: { ...state.players.p1, characterId: state.lobby.side === 'blue' ? (row.red_char ?? state.players.p1.characterId) : state.players.p1.characterId },
            p2: { ...state.players.p2, characterId: state.lobby.side !== 'blue' ? (row.blue_char ?? state.players.p2.characterId) : state.players.p2.characterId },
          },
          gameplay: {
            ...state.gameplay,
            scoreP1: row.red_score ?? state.gameplay.scoreP1,
            scoreP2: row.blue_score ?? state.gameplay.scoreP2,
          }
        }));
      }
    });
  // store unsubscribe to clean up on reset
  lobbyUnsub?.();
  lobbyUnsub = unsub;
  },
  
  joinLobby: (code) => {
    console.log('LobbyJoined', { code });
    const conn = getConn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doJoin = (c: any) => { try { LobbyApi.join(c, code); } catch (e) { console.warn('Join reducer failed', e); } };
    if (conn && get().netConnected) {
      doJoin(conn);
    } else {
      const saved = localStorage.getItem('auth_token') || undefined;
      void connectSpacetime(saved).then((st) => {
        set({ netConnected: st.connected, netError: st.error });
        if (st.conn && st.connected) doJoin(st.conn);
      });
    }
  set((state) => ({
      lobby: {
        ...state.lobby,
        mode: 'join',
        code,
        connectedP2: false,
        p1Ready: false,
        p2Ready: false,
  side: 'blue',
      },
    }));
  const unsub = subscribeLobby(code, (row) => {
      set((state) => ({
        lobby: {
          ...state.lobby,
          connectedP2: !!row?.red && !!row?.blue,
          redPresent: !!row?.red,
          bluePresent: !!row?.blue,
      // joiner stays blue; we don't flip sides here
  side: state.lobby.side,
  p1Ready: row?.red_ready ?? state.lobby.p1Ready,
  p2Ready: row?.blue_ready ?? state.lobby.p2Ready,
        }
      }));
      if (row?.started) {
        if (get().currentScreen !== 'GAME') {
          set({ currentScreen: 'GAME' });
        }
      }
      if (row) {
        set((state) => ({
          players: {
            p1: { ...state.players.p1, characterId: state.lobby.side === 'blue' ? (row.red_char ?? state.players.p1.characterId) : state.players.p1.characterId },
            p2: { ...state.players.p2, characterId: state.lobby.side !== 'blue' ? (row.blue_char ?? state.players.p2.characterId) : state.players.p2.characterId },
          },
          gameplay: {
            ...state.gameplay,
            scoreP1: row.red_score ?? state.gameplay.scoreP1,
            scoreP2: row.blue_score ?? state.gameplay.scoreP2,
          }
        }));
      }
    });
  lobbyUnsub?.();
  lobbyUnsub = unsub;
  },
  
  toggleReady: (player) => {
    const st = get();
    const desired = !st.lobby[`p${player}Ready` as const];
    console.log('PlayerReady', { player, ready: desired });
    // Optimistic local toggle
    set((state) => {
      const key: keyof Lobby = player === 1 ? 'p1Ready' : 'p2Ready';
      return { lobby: { ...state.lobby, [key]: desired } as Lobby };
    });
    // Persist to server, but only allow local side to change itself
    const conn = getConn();
    const side = get().lobby.side;
    const canChange = (player === 1 && side === 'red') || (player === 2 && side === 'blue');
    if (conn && canChange && st.lobby.code) {
      try { LobbyApi.setReady(conn, st.lobby.code, desired); } catch (e) { console.warn('setReady failed', e); }
    }
    // Auto-start when both ready and song chosen
    const bothReady = get().lobby.p1Ready && get().lobby.p2Ready;
    if (bothReady && get().song) {
      const code = get().lobby.code;
      const conn2 = getConn();
      if (code && conn2) {
        try { LobbyApi.startMatch(conn2, code); } catch (e) { console.warn('startMatch reducer failed', e); }
      } else {
        // fallback: local start
        get().startMatch();
      }
    }
  },
  
  startMatch: () => {
  const { lobby } = get();
  const mode = lobby.connectedP2 ? 'versus' : 'solo';
    console.log('MatchStart', { mode });
    set((state) => ({
      currentScreen: 'GAME',
      gameplay: {
        ...state.gameplay,
        started: true,
      },
    }));
  },
  
  updateSettings: (newSettings) => 
    set((state) => {
      const updatedSettings = { ...state.settings, ...newSettings };
      // Persist volume to localStorage
      if (newSettings.volume !== undefined) {
        localStorage.setItem('beatboxing-volume', newSettings.volume.toString());
      }
      return { settings: updatedSettings };
    }),
  
  updateGameplay: (newGameplay) =>
    set((state) => ({
      gameplay: { ...state.gameplay, ...newGameplay },
    })),
  
  resetGame: () => 
    set({
      currentScreen: 'TITLE',
      song: null,
      players: {
        p1: { characterId: null, ready: false },
        p2: { characterId: null, ready: false },
      },
      lobby: {
        mode: 'solo',
        code: null,
        connectedP2: false,
        p1Ready: false,
        p2Ready: false,
      },
      gameplay: {
        started: false,
        paused: false,
        scoreP1: 0,
        scoreP2: 0,
        comboP1: 0,
        comboP2: 0,
        accuracyP1: 100,
        accuracyP2: 100,
        healthP1: 100,
        healthP2: 100,
        gameOver: false,
      },
    }),
}));
