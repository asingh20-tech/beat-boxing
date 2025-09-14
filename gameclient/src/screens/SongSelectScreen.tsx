import React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { NeonButton } from '../components/ui/NeonButton';
import { GraffitiPanel } from '../components/ui/GraffitiPanel';
import { useGameStore, Song } from '../store/gameStore';
import { playNavSfx, playSelectSfx } from '../lib/sfx';

interface Character {
  id: string;
  name: string;
  power: number;
  speed: number;
  style: number;
  color: string;
}

const CHARACTERS: Character[] = [
  { id: 'striker', name: 'STRIKER', power: 85, speed: 70, style: 60, color: 'from-red-500 to-orange-500' },
  { id: 'guardian', name: 'GUARDIAN', power: 60, speed: 85, style: 80, color: 'from-blue-500 to-cyan-500' },
];

type AppWindow = Window & { gameAudioContext?: AudioContext; gameGainNode?: GainNode };

export const SongSelectScreen: React.FC = () => {
  const {
    song, players, lobby, netConnected, netError,
    selectSong, selectCharacter, toggleReady, startMatch, setScreen,
    hostLobby, joinLobby
  } = useGameStore();

  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSongIndex, setSelectedSongIndex] = useState(0);
  const [selectedCharIndex, setSelectedCharIndex] = useState(0);
  const [focusMode, setFocusMode] = useState<'song' | 'character'>('song');
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const currentSongRef = useRef<string>('');
  const [joinCode, setJoinCode] = useState('');

  const playPreview = useCallback((songItem: Song) => {
    if (previewAudio && currentSongRef.current !== songItem.id) {
      previewAudio.pause();
      console.log('MusicPreviewStop', { songId: currentSongRef.current });
    }
    if (currentSongRef.current === songItem.id && previewAudio && !previewAudio.paused) return;

    const audio = new Audio(`/songs/${songItem.id}/song.ogg`);
    audio.volume = 0;
    audio.loop = true;

    const w = window as AppWindow;
    const audioContext = w.gameAudioContext;
    const gainNode = w.gameGainNode;
    if (audioContext && gainNode) {
      const source = audioContext.createMediaElementSource(audio);
      source.connect(gainNode);
    }

    audio.play()
      .then(() => {
        setPreviewAudio(audio);
        currentSongRef.current = songItem.id;
        console.log('MusicPreviewStart', { songId: songItem.id });
      })
      .catch((err) => console.warn('Preview playback failed:', err));
  }, [previewAudio]);

  useEffect(() => {
    const loadSongs = async () => {
      try {
        const res = await fetch('/songs/index.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Song[] = await res.json();
        setSongs(data);
        if (data.length > 0 && !song) {
          setSelectedSongIndex(0);
          selectSong(data[0]);
          playPreview(data[0]);
        }
      } catch (e) {
        console.warn('Failed to load songs manifest', e);
        setSongs([]);
      }
    };
    loadSongs();
  }, [playPreview, selectSong, song]);

  useEffect(() => {
    const w = window as AppWindow;
    if (!w.gameAudioContext) {
      w.gameAudioContext = new AudioContext();
      w.gameGainNode = w.gameAudioContext.createGain();
      w.gameGainNode.connect(w.gameAudioContext.destination);
      const savedVolume = localStorage.getItem('beatboxing-volume');
      if (savedVolume && w.gameGainNode) {
        w.gameGainNode.gain.value = parseFloat(savedVolume);
      }
    }
    if (songs.length > 0 && !song) {
      selectSong(songs[0]);
      playPreview(songs[0]);
    }
    if (!players.p1.characterId) {
      selectCharacter(1, CHARACTERS[0].id);
    }
    return () => {
      if (previewAudio) {
        previewAudio.pause();
        previewAudio.src = '';
      }
    };
  }, [song, players.p1.characterId, selectSong, selectCharacter, songs, playPreview, previewAudio]);

  const canStart = useCallback(() => {
    if (lobby.mode === 'solo') {
      return Boolean(song && players.p1.characterId);
    } else {
      return Boolean(
        song && players.p1.characterId && lobby.connectedP2 &&
        players.p2.characterId && lobby.p1Ready && lobby.p2Ready
      );
    }
  }, [lobby.connectedP2, lobby.mode, lobby.p1Ready, lobby.p2Ready, players.p1.characterId, players.p2.characterId, song]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp': {
          event.preventDefault();
          if (focusMode === 'song' && songs.length > 0) {
            const newIndex = (selectedSongIndex - 1 + songs.length) % songs.length;
            setSelectedSongIndex(newIndex);
            selectSong(songs[newIndex]);
            playPreview(songs[newIndex]);
            playNavSfx();
          } else {
            const newIndex = (selectedCharIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
            setSelectedCharIndex(newIndex);
            selectCharacter(1, CHARACTERS[newIndex].id);
            playNavSfx();
          }
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          if (focusMode === 'song' && songs.length > 0) {
            const newIndex = (selectedSongIndex + 1) % songs.length;
            setSelectedSongIndex(newIndex);
            selectSong(songs[newIndex]);
            playPreview(songs[newIndex]);
            playNavSfx();
          } else {
            const newIndex = (selectedCharIndex + 1) % CHARACTERS.length;
            setSelectedCharIndex(newIndex);
            selectCharacter(1, CHARACTERS[newIndex].id);
            playNavSfx();
          }
          break;
        }
        case 'Tab': {
          event.preventDefault();
          setFocusMode(focusMode === 'song' ? 'character' : 'song');
          playNavSfx();
          break;
        }
        case 'Enter': {
          event.preventDefault();
          if (focusMode === 'song' || focusMode === 'character') {
            if (lobby.mode !== 'solo') {
              playSelectSfx();
              // Ready up the local player (red -> P1, blue -> P2)
              toggleReady(lobby.side !== 'blue' ? 1 : 2);
            } else if (canStart()) {
              playSelectSfx();
              startMatch();
            }
          } else if (canStart()) {
            playSelectSfx();
            startMatch();
          }
          break;
        }
        case ' ': {
          event.preventDefault();
          if (lobby.mode !== 'solo') {
            playSelectSfx();
            // Ready up the local player (red -> P1, blue -> P2)
            toggleReady(lobby.side !== 'blue' ? 1 : 2);
          }
          break;
        }
        case 'Escape': {
          event.preventDefault();
          playSelectSfx();
          setScreen('HOME');
          break;
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedSongIndex, selectedCharIndex, focusMode, selectSong, selectCharacter, startMatch, setScreen, songs, lobby.mode, lobby.side, toggleReady, canStart, playPreview]);

  const getDifficultyColor = (difficulty: Song['difficulty']) => {
    switch (difficulty) {
      case 'Easy': return 'text-green-400 bg-green-400/20';
      case 'Medium': return 'text-yellow-400 bg-yellow-400/20';
      case 'Hard': return 'text-red-400 bg-red-400/20';
    }
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center p-8 relative"
      style={{ backgroundImage: "url('/images/HomeBackground.jpeg')" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Main Content */}
        <div className="flex gap-8 mb-8 relative z-10 justify-center items-start">
          {/* Multiplayer Lobby Controls */}
          {lobby.mode !== 'solo' && (
            <div className="mb-6 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Host */}
                <GraffitiPanel variant={lobby.code ? 'outlined' : 'default'}>
                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-white mb-2">MULTIPLAYER LOBBY</h3>
                    <div className={`text-xs mb-2 ${netConnected ? 'text-green-400' : netError ? 'text-red-400' : 'text-yellow-300'}`}>
                      {netConnected ? 'Connected to server' : netError ? `Connection error: ${netError}` : 'Connecting to server…'}
                    </div>
                    {lobby.code ? (
                      <>
                        <div className="text-gray-300 text-sm">ROOM CODE</div>
                        <div className="text-cyan-400 font-mono text-3xl font-black tracking-widest mb-2">{lobby.code}</div>
                        <div className={`text-sm ${lobby.connectedP2 ? 'text-green-400' : 'text-yellow-400'}`}>
                          {lobby.connectedP2 ? 'Both players connected' : 'Waiting for opponent…'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          P1: {lobby.redPresent ? 'present' : '—'} • P2: {lobby.bluePresent ? 'present' : '—'}
                        </div>
                        <div className="mt-3">
                          <NeonButton
                            variant="secondary"
                            onClick={async () => { try { await navigator.clipboard.writeText(lobby.code!); } catch (e) { console.warn('Copy failed', e); } }}
                          >COPY CODE</NeonButton>
                        </div>
                      </>
                    ) : (
                      <NeonButton variant="primary" onClick={hostLobby} disabled={!netConnected}>CREATE ROOM</NeonButton>
                    )}
                  </div>
                </GraffitiPanel>
                {/* Join */}
                <GraffitiPanel>
                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-white mb-2">JOIN LOBBY</h3>
                    <p className="text-gray-300 mb-3">Enter a 6-character code</p>
                    <div className="flex gap-2 justify-center">
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        maxLength={6}
                        placeholder="ENTER CODE"
                        className="w-48 px-3 py-2 bg-gray-800 border-2 border-cyan-400/50 rounded text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                      />
                      <NeonButton
                        variant="secondary"
                        disabled={joinCode.length !== 6 || !netConnected}
                        onClick={() => joinLobby(joinCode)}
                      >JOIN</NeonButton>
                    </div>
                    {!netConnected && (
                      <div className="text-xs text-yellow-300 mt-2">Waiting for server connection…</div>
                    )}
                  </div>
                </GraffitiPanel>
              </div>
            </div>
          )}

          {/* Character Selection - Hidden for now */}
          <div className="hidden">{/* reserved */}</div>

          {/* Song Selection - Center (no panel chrome) */}
          <div className="flex-1 max-w-2xl">
            <div className="bg-transparent border-none shadow-none">
              {/* Title image */}
              <div className="-mt-6 mb-4 transform -translate-x-32">
                <img
                  src="/images/SongSelection.png"
                  alt="Song Selection"
                  className="max-w-[900px]"
                />
              </div>

              {/* Song list */}
              <div className="space-y-4 max-h-[700px] overflow-y-auto">
                {songs.map((songItem, index) => (
                  <button
                    key={songItem.id}
                    onClick={() => {
                      setSelectedSongIndex(index);
                      selectSong(songItem);
                      playPreview(songItem);
                      playNavSfx();
                    }}
                    className="block w-full focus:outline-none"
                  >
                    <div
                      className={`relative w-full max-w-[900px] mx-auto transition-transform duration-150 ${
                        selectedSongIndex === index && focusMode === 'song' ? 'scale-105' : 'scale-100'
                      }`}
                    >
                      {/* Box art */}
                      <img
                        src="/images/Box.png"
                        alt="Song Box"
                        className="w-full h-[200px] object-fill select-none pointer-events-none"
                        draggable={false}
                      />

                      {/* Text overlay kept inside the box */}
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full px-10 md:px-14 lg:px-16">
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="text-white font-extrabold text-2xl leading-tight truncate drop-shadow">
                                {songItem.title}
                              </h3>
                              <div className="text-cyan-300 font-mono text-sm mt-1 drop-shadow">
                                {songItem.bpm} BPM
                              </div>
                            </div>

                            <span
                              className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold ${
                                songItem.difficulty === 'Easy'
                                  ? 'text-green-400 bg-green-400/20'
                                  : songItem.difficulty === 'Medium'
                                  ? 'text-yellow-400 bg-yellow-400/20'
                                  : 'text-red-400 bg-red-400/20'
                              }`}
                            >
                              {songItem.difficulty}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}

                {songs.length === 0 && (
                  <div className="p-4 rounded-lg border-2 border-gray-600 bg-gray-800/50 text-gray-300">
                    No songs found. Add folders under /public/songs and update /public/songs/index.json
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ready Status Panel - Right Side (Multiplayer Only) */}
          {lobby.mode !== 'solo' && (
            <div className="flex-shrink-0 w-80">
              <GraffitiPanel variant="outlined">
                <h3 className="text-2xl font-bold text-white mb-4">READY STATUS</h3>
                <div className="space-y-6">
                  <div className="text-center">
                    <h4 className={`text-lg font-bold mb-2 ${lobby.side !== 'blue' ? 'text-pink-400' : 'text-cyan-400'}`}>PLAYER {lobby.side !== 'blue' ? 1 : 2}</h4>
                    <div className={`text-2xl font-bold ${(lobby.side !== 'blue' ? lobby.p1Ready : lobby.p2Ready) ? 'text-green-400' : 'text-yellow-400'}`}>
                      {(lobby.side !== 'blue' ? lobby.p1Ready : lobby.p2Ready) ? '✓ READY' : '⏳ NOT READY'}
                    </div>
                    <button
                      onClick={() => toggleReady(lobby.side !== 'blue' ? 1 : 2)}
                      className={`mt-2 px-4 py-2 rounded-lg font-bold transition-all ${
                        (lobby.side !== 'blue' ? lobby.p1Ready : lobby.p2Ready) 
                          ? 'bg-red-500 hover:bg-red-600 text-white' 
                          : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                    >
                      {(lobby.side !== 'blue' ? lobby.p1Ready : lobby.p2Ready) ? 'UNREADY' : 'READY UP'}
                    </button>
                  </div>
                  <div className="text-center">
                    <h4 className={`text-lg font-bold mb-2 ${lobby.side !== 'blue' ? 'text-cyan-400' : 'text-pink-400'}`}>PLAYER {lobby.side !== 'blue' ? 2 : 1}</h4>
                    <div className={`text-2xl font-bold ${(lobby.side !== 'blue' ? lobby.p2Ready : lobby.p1Ready) ? 'text-green-400' : 'text-yellow-400'}`}>
                      {(lobby.side !== 'blue' ? lobby.p2Ready : lobby.p1Ready) ? '✓ READY' : '⏳ NOT READY'}
                    </div>
                    <button
                      disabled
                      className="mt-2 px-4 py-2 rounded-lg font-bold transition-all bg-gray-600 text-white cursor-not-allowed"
                      title="Only Player 2 can change their own ready"
                    >
                      OPPONENT CONTROLS THEIR READY
                    </button>
                  </div>
                </div>
                {lobby.p1Ready && lobby.p2Ready && (
                  <div className="mt-4 text-green-400 font-bold text-lg animate-pulse text-center">
                    🎮 BOTH PLAYERS READY! 🎮
                  </div>
                )}
              </GraffitiPanel>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex justify-between items-center text-gray-800 text-sm arcade-text">
          <div>
            <div>[↑↓ TO NAVIGATE]</div>
            <div>[TAB TO SWITCH FOCUS]</div>
            {lobby.mode !== 'solo' && <div>[SPACE/ENTER TO READY UP]</div>}
          </div>
          <div>
            <div>{lobby.mode === 'solo' ? '[ENTER TO START]' : '[READY UP TO START]'}</div>
            <div>[ESC TO GO BACK]</div>
          </div>
        </div>
      </div>
    </div>
  );
};
