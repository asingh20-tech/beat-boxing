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
  image?: string; // optional image path
}

const CHARACTERS: Character[] = [
  { id: 'boxer', name: 'BOXER', power: 80, speed: 70, style: 65, color: 'from-red-500 to-orange-500', image: '/images/characters/boxer.png' },
  { id: 'mmafighter', name: 'MMA FIGHTER', power: 80, speed: 75, style: 70, color: 'from-pink-500 to-red-500', image: '/images/characters/mmafighter.png' },
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
  const listRef = useRef<HTMLDivElement | null>(null);
  const [joinCode, setJoinCode] = useState('');
  // Removed unused containerRef and itemRefs

  const isSolo = lobby.mode === 'solo';

  // Compute current character indices for each player from store
  const p1CharIndex = React.useMemo(() => {
    const idx = CHARACTERS.findIndex((c) => c.id === players.p1.characterId);
    return idx >= 0 ? idx : 0;
  }, [players.p1.characterId]);
  const p2CharIndex = React.useMemo(() => {
    const idx = CHARACTERS.findIndex((c) => c.id === players.p2.characterId);
    return idx >= 0 ? idx : 0;
  }, [players.p2.characterId]);

  // Keep the local selection index in sync with the local player's character
  useEffect(() => {
    const localPlayer = lobby.side !== 'blue' ? 1 : 2;
    const currentId = localPlayer === 1 ? players.p1.characterId : players.p2.characterId;
    const idx = CHARACTERS.findIndex((c) => c.id === currentId);
    if (idx >= 0) setSelectedCharIndex(idx);
  }, [players.p1.characterId, players.p2.characterId, lobby.side]);

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

  // Keep selected song visible when navigating
  useEffect(() => {
    if (focusMode !== 'song') return;
    const el = document.getElementById(`song-item-${selectedSongIndex}`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedSongIndex, focusMode]);

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
            // Up/Down no-op for character; use Left/Right per UX
          }
          break;
        }
        case 'ArrowLeft': {
          if (focusMode === 'character') {
            event.preventDefault();
            const newIndex = (selectedCharIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
            setSelectedCharIndex(newIndex);
            const lp = lobby.side !== 'blue' ? 1 : 2;
            selectCharacter(lp as 1 | 2, CHARACTERS[newIndex].id);
            playNavSfx();
          }
          break;
        }
        case 'ArrowRight': {
          if (focusMode === 'character') {
            event.preventDefault();
            const newIndex = (selectedCharIndex + 1) % CHARACTERS.length;
            setSelectedCharIndex(newIndex);
            const lp = lobby.side !== 'blue' ? 1 : 2;
            selectCharacter(lp as 1 | 2, CHARACTERS[newIndex].id);
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
            // Up/Down no-op for character; use Left/Right per UX
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


  return (
    <div
      className="min-h-screen bg-cover bg-center p-8 relative"
  style={{ backgroundImage: "url('/images/SongBackground.png')" }}
    >
  {/* Background overlay */}
  <div className="absolute inset-0 bg-black/40" />
  <div className="max-w-7xl mx-auto relative z-10 font-minecraftia">
        {/* Main Content */}
        <div className="flex gap-8 mb-8 relative z-10 justify-center items-start">
          {/* Player 1 Character - Left (always visible) */}
          <div className="flex-shrink-0 mt-6">
            <div className="flex flex-col items-center">
              <div className="text-sm font-bold text-pink-400 mb-1">PLAYER 1</div>
              {CHARACTERS[p1CharIndex]?.image ? (
                <img
                  src={CHARACTERS[p1CharIndex].image!}
                  alt={CHARACTERS[p1CharIndex].name}
                  className={`${isSolo ? 'w-[32rem] h-[32rem]' : 'w-[26rem] h-[26rem]'} object-contain select-none`}
                  draggable={false}
                />
              ) : (
                <div className={`${isSolo ? 'w-[32rem] h-[32rem]' : 'w-[26rem] h-[26rem]'} flex items-center justify-center text-gray-300`}>
                  No Image
                </div>
              )}
              <div className="mt-3 text-center">
                <div className="text-base text-gray-200 tracking-wide">CHARACTER</div>
                <div className={`${isSolo ? 'text-4xl' : 'text-3xl'} font-bold text-white`}>{CHARACTERS[p1CharIndex]?.name}</div>
              </div>
              <div className={`text-cyan-300 ${isSolo ? 'text-base' : 'text-sm'} mt-1`}>POWER {CHARACTERS[p1CharIndex]?.power} • SPEED {CHARACTERS[p1CharIndex]?.speed} • STYLE {CHARACTERS[p1CharIndex]?.style}</div>
              {lobby.mode !== 'solo' && (
                <div className={`mt-2 text-sm font-bold ${lobby.p1Ready ? 'text-green-400' : 'text-yellow-400'}`}>
                  {lobby.p1Ready ? 'READY' : 'NOT READY'}
                </div>
              )}
            </div>
          </div>

      {/* Song Selection - Center (bigger in solo) */}
      <div className={`flex-1 ${isSolo ? 'max-w-2xl' : 'max-w-xl'} mx-auto`}>
            <div className="bg-transparent border-none shadow-none">
        {/* Title image (centered) */}
        <div className="-mt-6 mb-3 flex justify-center">
                <img
                  src="/images/SongSelection.png"
                  alt="Song Selection"
          className={`${isSolo ? 'max-w-[680px]' : 'max-w-[520px]'} mx-auto`}
                />
              </div>

        {/* Song list (compact) */}
  <div ref={listRef} className={`space-y-1 ${isSolo ? 'max-h-[640px] w-[680px]' : 'max-h-[520px] w-[560px]'} overflow-y-auto mx-auto`}>
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
                      id={`song-item-${index}`}
                      className={`relative w-full max-w-[560px] mx-auto transition-transform duration-150 ${
                        selectedSongIndex === index && focusMode === 'song' ? 'scale-[1.02]' : 'scale-100'
                      }`}
                    >
                      {/* Box art */}
                      <img
                        src={
                          selectedSongIndex === index && focusMode === 'song'
                            ? '/images/BoxSelected.png'
                            : '/images/Box.png'
                        }
                        alt="Song Box"
                        className={`w-full ${isSolo ? 'h-[150px]' : 'h-[120px]'} object-fill select-none pointer-events-none`}
                        draggable={false}
                      />

                      {/* Text overlay kept inside the box (compact typography) */}
                      <div className="absolute inset-0 flex items-center translate-y-1">
                        <div className="w-full px-6 md:px-6 lg:px-8">
                          <div className=" items-center justify-between">
                            <div className="min-w-0">
                              <h3 className={`font-minecraftia text-white ${isSolo ? 'text-2xl' : 'text-xl'} leading-tight drop-shadow`}>
                                {songItem.title}
                              </h3>
                              <div className={`font-minecraftia text-cyan-300 ${isSolo ? 'text-sm' : 'text-xs'} mt-1 drop-shadow`}>
                                {songItem.bpm} BPM
                              </div>
                            </div>

                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                songItem.difficulty === 'Easy'
                                  ? 'text-green-400'
                                  : songItem.difficulty === 'Medium'
                                  ? 'text-yellow-200'
                                  : 'text-red-500'
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

          {/* Player 2 Character - Right (only visible in multiplayer; placeholder in solo to keep center) */}
          {lobby.mode !== 'solo' && (
            <div className="flex-shrink-0 mt-6">
              <div className="flex flex-col items-center">
                <div className="text-sm font-bold text-cyan-400 mb-1">PLAYER 2</div>
                {!lobby.connectedP2 ? (
                  <img
                    src="/images/characters/noplayer.png"
                    alt="No Player Connected"
                    className="w-[26rem] h-[26rem] object-contain select-none"
                    draggable={false}
                  />
                ) : CHARACTERS[p2CharIndex]?.image ? (
                  <img
                    src={CHARACTERS[p2CharIndex].image!}
                    alt={CHARACTERS[p2CharIndex].name}
                    className="w-[26rem] h-[26rem] object-contain select-none"
                    draggable={false}
                  />
                ) : (
                  <div className="w-[26rem] h-[26rem] flex items-center justify-center text-gray-300">
                    No Image
                  </div>
                )}
                {lobby.connectedP2 ? (
                  <>
                    <div className="mt-3 text-center">
                      <div className="text-base text-gray-200 tracking-wide">CHARACTER</div>
                      <div className="text-3xl font-bold text-white">{CHARACTERS[p2CharIndex]?.name}</div>
                    </div>
                    <div className="text-cyan-300 text-sm mt-1">POWER {CHARACTERS[p2CharIndex]?.power} • SPEED {CHARACTERS[p2CharIndex]?.speed} • STYLE {CHARACTERS[p2CharIndex]?.style}</div>
                  </>
                ) : (
                  <div className="mt-3 text-center text-white/80 text-sm">Waiting for Player 2…</div>
                )}
                <div className={`mt-2 text-sm font-bold ${lobby.p2Ready ? 'text-green-400' : 'text-yellow-400'}`}>
                  {lobby.p2Ready ? 'READY' : 'NOT READY'}
                </div>
              </div>
            </div>
          )}
          {lobby.mode === 'solo' && (
            <div className="flex-shrink-0 mt-6 w-[26rem]" />
          )}
        </div>

    {/* Bottom Multiplayer Bar */}
        {lobby.mode !== 'solo' && (
          <div className="mt-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {/* Host/Room */}
              <GraffitiPanel className="bg-red-900 text-white" variant="flat">
                <div className="text-left">
                  <h3 className="text-xl font-bold text-white mb-2">MULTIPLAYER LOBBY</h3>
                  {!lobby.code && (
                    <div className={`text-xs mb-2 ${netConnected ? 'text-green-400' : netError ? 'text-red-400' : 'text-yellow-300'}`}>
                      {netConnected ? 'Connected to server' : netError ? `Connection error: ${netError}` : 'Connecting to server…'}
                    </div>
                  )}
                  {lobby.code ? (
                    <div className="text-center">
                      <div className="text-white/90 text-sm">ROOM CODE</div>
                      <div className="text-white font-minecraftia text-3xl font-black tracking-widest">{lobby.code}</div>
                    </div>
                  ) : (
                    <NeonButton variant="flat-yellow" className="text-white" onClick={hostLobby} disabled={!netConnected}>CREATE ROOM</NeonButton>
                  )}
                </div>
              </GraffitiPanel>

              {/* Join */}
              <GraffitiPanel className="bg-red-900 text-white" variant="flat">
                <div className="text-left">
                  <h3 className="text-xl font-bold text-white mb-2">JOIN LOBBY</h3>
          <p className="text-white/90 mb-3 text-sm">Enter a 6-character code</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      placeholder="ENTER CODE"
                      className="w-44 px-3 py-2 bg-gray-800 border-2 border-cyan-400/50 rounded text-white font-minecraftia text-sm focus:outline-none focus:border-cyan-400"
                    />
                    <NeonButton
                      variant="flat-yellow"
                      className="text-white"
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
        {/* Controls */}
  <div className="flex justify-between items-center text-gray-800 text-sm font-minecraftia">
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
