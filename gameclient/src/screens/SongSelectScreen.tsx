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
  const { song, players, lobby, selectSong, selectCharacter, toggleReady, startMatch, setScreen } = useGameStore();
  const { hostLobby, joinLobby } = useGameStore();
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSongIndex, setSelectedSongIndex] = useState(0);
  const [selectedCharIndex, setSelectedCharIndex] = useState(0);
  const [focusMode, setFocusMode] = useState<'song' | 'character'>('song');
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const currentSongRef = useRef<string>('');
  const [joinCode, setJoinCode] = useState('');

  const playPreview = useCallback((songItem: Song) => {
    // Stop current preview if playing
    if (previewAudio && currentSongRef.current !== songItem.id) {
      previewAudio.pause();
      console.log('MusicPreviewStop', { songId: currentSongRef.current });
    }

    // Don't restart if same song
    if (currentSongRef.current === songItem.id && previewAudio && !previewAudio.paused) {
      return;
    }

    const audio = new Audio(`/songs/${songItem.id}/song.ogg`);
    audio.volume = 0; // Controlled by Web Audio API
    audio.loop = true; // Loop the preview

    const w = window as AppWindow;
    const audioContext = w.gameAudioContext;
    const gainNode = w.gameGainNode;

    if (audioContext && gainNode) {
      const source = audioContext.createMediaElementSource(audio);
      source.connect(gainNode);
    }

    audio
      .play()
      .then(() => {
        setPreviewAudio(audio);
        currentSongRef.current = songItem.id;
        console.log('MusicPreviewStart', { songId: songItem.id });
      })
      .catch((err) => {
        console.warn('Preview playback failed:', err);
      });
  }, [previewAudio]);

  useEffect(() => {
    // Load song manifest from public folder
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
    // Initialize audio context and gain node if not exists
    const w = window as AppWindow;
    if (!w.gameAudioContext) {
      w.gameAudioContext = new AudioContext();
      w.gameGainNode = w.gameAudioContext.createGain();
      w.gameGainNode.connect(w.gameAudioContext.destination);

      // Apply saved volume
      const savedVolume = localStorage.getItem('beatboxing-volume');
      if (savedVolume && w.gameGainNode) {
        w.gameGainNode.gain.value = parseFloat(savedVolume);
      }
    }

    // Auto-select first song and start preview if none selected
    if (songs.length > 0 && !song) {
      selectSong(songs[0]);
      playPreview(songs[0]);
    }

    // Auto-select first character for P1
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
        song &&
          players.p1.characterId &&
          lobby.connectedP2 &&
          players.p2.characterId &&
          lobby.p1Ready &&
          lobby.p2Ready
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
              toggleReady(1);
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
            toggleReady(1);
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
  }, [selectedSongIndex, selectedCharIndex, focusMode, selectSong, selectCharacter, startMatch, setScreen, songs, lobby.mode, toggleReady, canStart, playPreview]);

  const getDifficultyColor = (difficulty: Song['difficulty']) => {
    switch (difficulty) {
      case 'Easy': return 'text-green-400 bg-green-400/20';
      case 'Medium': return 'text-yellow-400 bg-yellow-400/20';
      case 'Hard': return 'text-red-400 bg-red-400/20';
    }
  };
  
  return (
    <div className="min-h-screen brick-wall p-8 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-purple-900/50 to-black/70"></div>
      <div className="max-w-7xl mx-auto">
        {/* Main Content */}
        <div className="flex gap-8 mb-8 relative z-10 justify-center items-start">
        {/* Multiplayer Lobby Controls (create/join on Song Select) */}
        {lobby.mode !== 'solo' && (
          <div className="mb-6 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Host */}
              <GraffitiPanel variant={lobby.code ? 'outlined' : 'default'}>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-white mb-2">MULTIPLAYER LOBBY</h3>
                  {lobby.code ? (
                    <>
                      <div className="text-gray-300 text-sm">ROOM CODE</div>
                      <div className="text-cyan-400 font-mono text-3xl font-black tracking-widest mb-2">{lobby.code}</div>
                      <div className={`text-sm ${lobby.connectedP2 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {lobby.connectedP2 ? 'Both players connected' : 'Waiting for opponent…'}
                      </div>
                      <div className="mt-3">
                        <NeonButton
                          variant="secondary"
                          onClick={async () => { try { await navigator.clipboard.writeText(lobby.code!); } catch (e) { console.warn('Copy failed', e); } }}
                        >COPY CODE</NeonButton>
                      </div>
                    </>
                  ) : (
                    <NeonButton variant="primary" onClick={hostLobby}>CREATE ROOM</NeonButton>
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
                      disabled={joinCode.length !== 6}
                      onClick={() => joinLobby(joinCode)}
                    >JOIN</NeonButton>
                  </div>
                </div>
              </GraffitiPanel>
            </div>
          </div>
        )}
          {/* Character Selection - Left Side */}
          <div className="flex-shrink-0 w-80">
            <GraffitiPanel variant={focusMode === 'character' ? 'outlined' : 'default'}>
              <h2 className="text-2xl font-bold text-white mb-6 arcade-text">
                FIGHTER {focusMode === 'character' && <span className="text-cyan-400">[FOCUSED]</span>}
              </h2>
              
              {/* Player 1 Character */}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-pink-400 mb-4">PLAYER 1</h3>
                <div className="space-y-3">
                  {CHARACTERS.map((char, index) => (
                    <div
                      key={char.id}
                      className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        selectedCharIndex === index && focusMode === 'character'
                          ? 'border-pink-500 bg-pink-500/20 scale-105'
                          : players.p1.characterId === char.id
                          ? 'border-cyan-400 bg-cyan-400/10'
                          : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
                      }`}
                      onClick={() => {
                        setSelectedCharIndex(index);
                        selectCharacter(1, char.id);
                        playNavSfx();
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 bg-gradient-to-br ${char.color} rounded-lg flex items-center justify-center`}>
                          <span className="text-xl">👤</span>
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-white text-sm">{char.name}</div>
                          <div className="text-xs text-gray-400">PWR:{char.power} SPD:{char.speed} STY:{char.style}</div>
                        </div>
                      </div>
                      
                      {/* Selection indicator */}
                      {selectedCharIndex === index && focusMode === 'character' && (
                        <div className="flex items-center justify-center mt-2">
                          <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-pink-500 animate-bounce mr-2"></div>
                          <span className="text-pink-500 text-xs font-bold">SELECTED</span>
                          <div className="w-0 h-0 border-t-4 border-b-4 border-r-6 border-transparent border-r-pink-500 animate-bounce ml-2"></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Player 2 Character (if multiplayer) */}
              {lobby.connectedP2 && (
                <div>
                  <h3 className="text-lg font-bold text-cyan-400 mb-4">PLAYER 2</h3>
                  <div className="p-3 rounded-lg border-2 border-cyan-400 bg-cyan-400/10">
                    {players.p2.characterId ? (
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
                          <span className="text-xl">👤</span>
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm">
                            {CHARACTERS.find(c => c.id === players.p2.characterId)?.name || 'UNKNOWN'}
                          </div>
                          <div className={`text-xs font-bold ${lobby.p2Ready ? 'text-green-400' : 'text-yellow-400'}`}>
                            {lobby.p2Ready ? 'READY' : 'NOT READY'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-400">
                        <div className="animate-pulse">Waiting for P2...</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </GraffitiPanel>
          </div>
          
          {/* Song Selection - Center */}
          <div className="flex-1 max-w-2xl">
            <GraffitiPanel variant={focusMode === 'song' ? 'outlined' : 'default'}>
              <h2 className="text-2xl font-bold text-white mb-6 arcade-text">
                SONGS {focusMode === 'song' && <span className="text-cyan-400">[FOCUSED]</span>}
              </h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {songs.map((songItem, index) => (
                  <div
                    key={songItem.id}
                    className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedSongIndex === index && focusMode === 'song'
                        ? 'border-pink-500 bg-pink-500/20 scale-105'
                        : song?.id === songItem.id
                        ? 'border-cyan-400 bg-cyan-400/10'
                        : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
                    }`}
                    onClick={() => {
                      setSelectedSongIndex(index);
                      selectSong(songItem);
                      playPreview(songItem);
                      playNavSfx();
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-bold text-white">{songItem.title}</h3>
                        <div className="text-cyan-400 font-mono text-sm">{songItem.bpm} BPM</div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold ${getDifficultyColor(songItem.difficulty)}`}>
                        {songItem.difficulty}
                      </div>
                    </div>
                    
                    {/* Selection indicator */}
                    {selectedSongIndex === index && focusMode === 'song' && (
                      <div className="flex items-center justify-center mt-2">
                        <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-pink-500 animate-bounce mr-2"></div>
                        <span className="text-pink-500 text-xs font-bold">SELECTED</span>
                        <div className="w-0 h-0 border-t-4 border-b-4 border-r-6 border-transparent border-r-pink-500 animate-bounce ml-2"></div>
                      </div>
                    )}
                  </div>
                ))}
                {songs.length === 0 && (
                  <div className="p-4 rounded-lg border-2 border-gray-600 bg-gray-800/50 text-gray-300">
                    No songs found. Add folders under /public/songs and update /public/songs/index.json
                  </div>
                )}
              </div>
            </GraffitiPanel>
          </div>
          
          {/* Ready Status Panel - Right Side (Multiplayer Only) */}
          {lobby.mode !== 'solo' && (
            <div className="flex-shrink-0 w-80">
              <GraffitiPanel variant="outlined">
                <h3 className="text-2xl font-bold text-white mb-4">READY STATUS</h3>
                <div className="space-y-6">
                  <div className="text-center">
                    <h4 className="text-lg font-bold text-pink-400 mb-2">PLAYER 1</h4>
                    <div className={`text-2xl font-bold ${lobby.p1Ready ? 'text-green-400' : 'text-yellow-400'}`}>
                      {lobby.p1Ready ? '✓ READY' : '⏳ NOT READY'}
                    </div>
                    <button
                      onClick={() => toggleReady(1)}
                      className={`mt-2 px-4 py-2 rounded-lg font-bold transition-all ${
                        lobby.p1Ready 
                          ? 'bg-red-500 hover:bg-red-600 text-white' 
                          : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                    >
                      {lobby.p1Ready ? 'UNREADY' : 'READY UP'}
                    </button>
                  </div>
                  <div className="text-center">
                    <h4 className="text-lg font-bold text-cyan-400 mb-2">PLAYER 2</h4>
                    <div className={`text-2xl font-bold ${lobby.p2Ready ? 'text-green-400' : 'text-yellow-400'}`}>
                      {lobby.p2Ready ? '✓ READY' : '⏳ NOT READY'}
                    </div>
                    <button
                      onClick={() => toggleReady(2)}
                      className={`mt-2 px-4 py-2 rounded-lg font-bold transition-all ${
                        lobby.p2Ready 
                          ? 'bg-red-500 hover:bg-red-600 text-white' 
                          : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                    >
                      {lobby.p2Ready ? 'UNREADY' : 'READY UP'}
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
        
        {/* Start Button */}
        <div className="text-center mb-8">
          <NeonButton
            variant="accent"
            size="large"
            disabled={!canStart()}
            onClick={() => { if (canStart()) { playSelectSfx(); startMatch(); } }}
          >
            {lobby.mode === 'solo' 
              ? (canStart() ? 'START MATCH' : 'SELECT SONG & CHARACTER')
              : (canStart() ? 'START MATCH' : 'BOTH PLAYERS MUST BE READY')
            }
          </NeonButton>
        </div>
        
        {/* Controls */}
        <div className="flex justify-between items-center text-gray-400 text-sm arcade-text">
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
        
        {/* Back Button */}
        <div className="absolute top-8 left-8">
          
          <NeonButton
            variant="secondary"
            onClick={() => { playSelectSfx(); setScreen('MODE_SELECT'); }}
          >
            ← BACK
          </NeonButton>
        </div>
      </div>
    </div>
  );
};
