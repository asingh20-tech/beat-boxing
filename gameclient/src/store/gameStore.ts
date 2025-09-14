import { create } from 'zustand';
import { connectSpacetime, getConn, getIdentity, LobbyApi, subscribeLobby } from '../lib/spacetime';

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
  currentScreen: 'TITLE' | 'HOME' | 'SONG_SELECT' | 'GAME' | 'HOW_TO_PLAY' | 'SETTINGS';
  song: Song | null;
  players: {
    p1: Player;
    p2: Player;
  };
  lobby: Lobby;
  settings: Settings;
  gameplay: Gameplay;
  netConnected?: boolean;
  netError?: string | null;
  
  // Actions
  setScreen: (screen: GameState['currentScreen']) => void;
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
  
  selectSong: (song) => {
    console.log('SongSelected', { id: song.id, title: song.title, bpm: song.bpm, difficulty: song.difficulty });
    set({ song });
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
    } else {
      const saved = localStorage.getItem('auth_token') || undefined;
      void connectSpacetime(saved).then((st) => {
        set({ netConnected: st.connected, netError: st.error });
        if (st.conn && st.connected) doCreate(st.conn);
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
          // if we're hosting and the server moved us to blue for some reason, follow it
          side: (() => {
            const id = getIdentity();
            if (!row || !id) return state.lobby.side;
            return (row.red && row.red === id) ? 'red' : (row.blue && row.blue === id) ? 'blue' : state.lobby.side;
          })(),
        }
      }));
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
    // tentative until subscription tells us which slot we are
    side: undefined,
      },
    }));
  const unsub = subscribeLobby(code, (row) => {
      set((state) => ({
        lobby: {
          ...state.lobby,
          connectedP2: !!row?.red && !!row?.blue,
          redPresent: !!row?.red,
          bluePresent: !!row?.blue,
          side: (() => {
            const id = getIdentity();
            if (!row || !id) return state.lobby.side;
            return (row.red && row.red === id) ? 'red' : (row.blue && row.blue === id) ? 'blue' : state.lobby.side;
          })(),
        }
      }));
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
      get().startMatch();
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
