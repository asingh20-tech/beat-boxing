import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { GameEngine, Note, Judgment } from '../game/gameEngine';
import { InputHandler, InputEvent } from '../game/inputHandler';
import { CharacterSpriteManager } from '../game/characterSprites';
import { NeonButton } from '../components/ui/NeonButton';
import { getConn, LobbyApi } from '../lib/spacetime';

declare global {
  interface Window {
    gameAudioContext?: AudioContext;
    gameGainNode?: GainNode;
  }
}

export const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);
  const inputHandlerRef = useRef<InputHandler | null>(null);
  const characterManagerRef = useRef<CharacterSpriteManager | null>(null);
  
  const { 
    song,
    players, 
    lobby, 
    gameplay, 
    updateGameplay, 
    settings,
    setScreen,
    setResults
  } = useGameStore();
  
  const [isPaused, setIsPaused] = useState(false);
  // Keep latest health values to avoid stale closures in callbacks
  const healthP1Ref = useRef(gameplay.healthP1);
  const healthP2Ref = useRef(gameplay.healthP2);
  // Keep latest scoring values
  const scoreP1Ref = useRef(gameplay.scoreP1);
  const scoreP2Ref = useRef(gameplay.scoreP2);
  const comboP1Ref = useRef(gameplay.comboP1);
  const comboP2Ref = useRef(gameplay.comboP2);

  type ScorePopup = { id: number; amount: number };
  const popupIdRef = useRef(0);
  const [scorePopups, setScorePopups] = useState<{ 1: ScorePopup[]; 2: ScorePopup[] }>({ 1: [], 2: [] });

  useEffect(() => { healthP1Ref.current = gameplay.healthP1; }, [gameplay.healthP1]);
  useEffect(() => { healthP2Ref.current = gameplay.healthP2; }, [gameplay.healthP2]);
  useEffect(() => { scoreP1Ref.current = gameplay.scoreP1; }, [gameplay.scoreP1]);
  useEffect(() => { scoreP2Ref.current = gameplay.scoreP2; }, [gameplay.scoreP2]);
  useEffect(() => { comboP1Ref.current = gameplay.comboP1; }, [gameplay.comboP1]);
  useEffect(() => { comboP2Ref.current = gameplay.comboP2; }, [gameplay.comboP2]);

  // Stable callbacks
  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      if (next) {
        console.log('MatchPaused');
        gameEngineRef.current?.pause();
      } else {
        console.log('MatchResumed');
        gameEngineRef.current?.resume();
      }
      return next;
    });
  }, []);

  const handleNoteResult = useCallback((result: { judgment: Judgment; note: Note; player: number; accuracy: number }) => {
    const player = result.player;
    const currentScore = player === 1 ? scoreP1Ref.current : scoreP2Ref.current;
    const currentCombo = player === 1 ? comboP1Ref.current : comboP2Ref.current;

    const newScore = currentScore + result.judgment.score;
    const newCombo = result.judgment.type !== 'Miss' ? currentCombo + 1 : 0;

    updateGameplay({
      [`scoreP${player}`]: newScore,
      [`comboP${player}`]: newCombo,
      [`accuracyP${player}`]: result.accuracy,
    });
    // Push my score to server so opponent sees it live
    const conn = getConn();
    const code = lobby.code;
    const localPlayer = lobby.side === 'blue' ? 2 : 1;
    if (conn && code && player === localPlayer) {
      try { LobbyApi.setScore(conn, code, newScore); } catch (e) { console.warn('setScore failed', e); }
    }

    // Show a floating +score popup above the player's head for positive scores
    const inc = result.judgment.score;
    if (inc > 0) {
      const id = ++popupIdRef.current;
      setScorePopups((prev) => ({
        ...prev,
        [player]: [...prev[player as 1 | 2], { id, amount: inc }],
      }));
      // Remove after animation ends
      setTimeout(() => {
        setScorePopups((prev) => ({
          ...prev,
          [player]: prev[player as 1 | 2].filter((p) => p.id !== id),
        }));
      }, 650);
    }
  }, [updateGameplay, lobby.code, lobby.side]);

  const handleHealthUpdate = useCallback((player: number, healthChange: number, gameOver: boolean) => {
    // Read latest health from refs to ensure multiple rapid updates apply correctly
    const currentHealth = player === 1 ? healthP1Ref.current : healthP2Ref.current;
    const newHealth = Math.max(0, Math.min(100, currentHealth + healthChange));

    updateGameplay({
      [`healthP${player}`]: newHealth,
      gameOver: newHealth <= 0 || gameOver,
    });

    // If game over, stop engine and audio immediately to avoid replay
    if (newHealth <= 0 || gameOver) {
      gameEngineRef.current?.stop?.();
    }
  }, [updateGameplay]);

  const [, forceRerender] = useState(0);

  const handleInput = useCallback((inputEvent: InputEvent) => {
    if (isPaused || !gameEngineRef.current || !characterManagerRef.current) return;

  // Use engine input types directly
  const engineType: 'block' | 'uppercut' | 'hook' = inputEvent.type;

    // Local player id based on side
    const localPlayer = lobby.side === 'blue' ? 2 : 1;

  const result = gameEngineRef.current.handleInput(inputEvent.lane, engineType, localPlayer);

    if (result.judgment) {
      console.log('NoteHit', {
        player: inputEvent.player,
        lane: inputEvent.lane,
        type: inputEvent.type,
        noteType: result.note?.type || 'none',
        judgment: result.judgment.type,
        score: result.judgment.score,
      });
    }

    // Trigger character animation
    // Map BLOCK action to LEFT/RIGHT_BLOCK
    const action: 'LEFT_BLOCK' | 'LEFT_UPPERCUT' | 'LEFT_HOOK' | 'RIGHT_BLOCK' | 'RIGHT_UPPERCUT' | 'RIGHT_HOOK' =
      inputEvent.action === 'BLOCK'
        ? (inputEvent.lane === 'L' ? 'LEFT_BLOCK' : 'RIGHT_BLOCK')
        : (inputEvent.action as 'LEFT_UPPERCUT' | 'LEFT_HOOK' | 'RIGHT_UPPERCUT' | 'RIGHT_HOOK');
    characterManagerRef.current.triggerAction(localPlayer, action);
  // Force a re-render so character image swaps immediately
  forceRerender((n) => n + 1);
  }, [isPaused, lobby.side]);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Get or create audio context and gain node
    const audioContext = window.gameAudioContext || new AudioContext();
    const gainNode = window.gameGainNode || audioContext.createGain();
    
    if (!window.gameAudioContext) {
      window.gameAudioContext = audioContext;
      window.gameGainNode = gainNode;
      gainNode.connect(audioContext.destination);
    }
  // Apply initial volume from settings
  const initialVolume = Math.max(0, Math.min(1, settings.volume ?? 1));
  gainNode.gain.value = initialVolume;
    
    // Initialize game systems
    gameEngineRef.current = new GameEngine(canvasRef.current, audioContext, gainNode);
    inputHandlerRef.current = new InputHandler();
    characterManagerRef.current = new CharacterSpriteManager();
    // Re-render on pose changes (e.g., auto reset to idle)
    characterManagerRef.current.setOnPoseChange(() => {
      forceRerender((n) => n + 1);
    });
    
    // Set up note result callback
    gameEngineRef.current.setNoteResultCallback(handleNoteResult);
    
    // Set up health update callback
    gameEngineRef.current.setHealthUpdateCallback(handleHealthUpdate);
    
    // Set up song end callback -> show results screen
    gameEngineRef.current.setSongEndCallback((stats) => {
      console.log('SongFinished', stats);
      // Persist results to store and navigate to results screen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setResults?.(stats as any);
      setScreen('RESULTS');
    });

    // Setup character sprites
    if (players.p1.characterId) {
      characterManagerRef.current.setCharacter(1, players.p1.characterId);
    }
    if (players.p2.characterId && lobby.connectedP2) {
      characterManagerRef.current.setCharacter(2, players.p2.characterId);
    }
    
  // Setup input handling
  const cleanup = inputHandlerRef.current.onInput(handleInput);
    
    // Setup pause handling
    const handlePause = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        togglePause();
      }
    };
    
  document.addEventListener('keydown', handlePause);
    
    // Start game only when song exists; engine can start immediately since navigation is synchronized by store
  gameEngineRef.current.start(song?.id);
    
    return () => {
  // Stop engine/audio on unmount
  gameEngineRef.current?.stop?.();
      cleanup();
      document.removeEventListener('keydown', handlePause);
      inputHandlerRef.current?.destroy();
    };
  }, [
    players.p1.characterId,
    players.p2.characterId,
    lobby.connectedP2,
    song?.id,
  settings.volume,
    handleInput,
    handleNoteResult,
    handleHealthUpdate,
    togglePause,
    setResults,
    setScreen,
  ]);

  // React to volume changes in settings
  useEffect(() => {
    const vol = Math.max(0, Math.min(1, settings.volume ?? 1));
    // Update engine gain
    gameEngineRef.current?.setVolume(vol);
    // Also set the shared gain node in case engine is not yet created or for menu sounds
    if (window.gameGainNode) {
      window.gameGainNode.gain.value = vol;
    }
  }, [settings.volume]);
  
  const restartSong = () => {
  // Ensure previous run is fully stopped
  gameEngineRef.current?.stop?.();
    // Reset gameplay state
    updateGameplay({
      started: true,
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
    });
    
    // Restart the game engine
    if (gameEngineRef.current && song) {
      gameEngineRef.current = new GameEngine(canvasRef.current!, window.gameAudioContext!, window.gameGainNode!);
      gameEngineRef.current.setNoteResultCallback(handleNoteResult);
      gameEngineRef.current.setHealthUpdateCallback(handleHealthUpdate);
      gameEngineRef.current.start(song.id);
    }
  };

  
  
  const CharacterPanel: React.FC<{ player: 1 | 2 }> = ({ player }) => {
    const character = player === 1 ? players.p1 : players.p2;
    const score = player === 1 ? gameplay.scoreP1 : gameplay.scoreP2;
  // (combo, accuracy, health not displayed in the simplified panel)
    
    const isP2 = player === 2;
    const showPlaceholder = (isP2 && !lobby.connectedP2) || !character.characterId;
    const base = character.characterId === 'mmafighter' ? 'mmafighter' : 'boxer';
    const idle = showPlaceholder ? '/images/characters/noplayer.png' : `/images/characters/${base}.png`;
    const punch = showPlaceholder ? '/images/characters/noplayer.png' : `/images/characters/${base}-punch.png`;
    const isPunching = !showPlaceholder && characterManagerRef.current?.getCurrentPose(player) !== 'idle';

    const labelColor = player === 1 ? 'text-pink-300' : 'text-cyan-300';
    const myPopups = scorePopups[player];

    return (
      <div className="max-w-sm text-center">
        {/* Score label above character - more prominent */}
        <div className={`inline-block arcade-text ${labelColor} text-4xl md:text-5xl bg-black/70 rounded px-4 py-1 mb-2`}>{score.toLocaleString()}</div>
        {/* Layer both images and toggle visibility for instant swap */}
        <div className="relative w-96 h-96 md:w-[28rem] md:h-[28rem] lg:w-[32rem] lg:h-[32rem] mx-auto select-none">
          <img
            src={idle}
            alt={`${base}-idle`}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-0 ${isPunching ? 'opacity-0' : 'opacity-100'}`}
            draggable={false}
            loading="eager"
            decoding="sync"
          />
          <img
            src={punch}
            alt={`${base}-punch`}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-0 ${isPunching ? 'opacity-100' : 'opacity-0'}`}
            draggable={false}
            loading="eager"
            decoding="sync"
          />
          {/* Floating +score popups */}
          {myPopups.map((p) => (
            <div key={p.id} className="score-popup top-0 text-lime-300 font-black text-2xl md:text-3xl">
              +{p.amount}
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  return (
    <div
      className="min-h-screen bg-cover bg-center relative"
      style={{ backgroundImage: "url('/images/HomeBackground.jpeg')" }}
    >
      <div className="absolute inset-0 bg-black/10 pointer-events-none" />
      
  {/* Multiplayer lobby controls live on the Song Select screen */}

      {/* HUD */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex items-center space-x-6 bg-gray-900/90 rounded-full px-6 py-3 border-2 border-cyan-400/50">
          <div className="text-center">
            <div className="text-pink-400 text-xs">P1</div>
            <div className="text-white font-bold text-lg">{gameplay.scoreP1.toLocaleString()}</div>
          </div>
          <div className="w-px h-8 bg-white/20"></div>
          <div className="text-center">
            <div className="text-yellow-400 text-sm">MAX COMBO</div>
            <div className="text-white font-bold text-lg">
              {Math.max(gameplay.comboP1, gameplay.comboP2)}x
            </div>
          </div>
          <div className="w-px h-8 bg-white/20"></div>
          <div className="text-center">
            <div className="text-cyan-400 text-xs">P2</div>
            <div className="text-white font-bold text-lg">{gameplay.scoreP2.toLocaleString()}</div>
          </div>
        </div>
      </div>
      
      {/* Game Layout */}
      <div className="flex items-center justify-center min-h-screen px-8">
        {/* Player 1 Character Area */}
        <div className="flex-1 flex justify-center">
          <CharacterPanel player={1} />
        </div>
        
        {/* Game Canvas - Condensed */}
        <div className="flex-shrink-0">
          <canvas
            ref={canvasRef}
            width={400}
            height={500}
            className="border-2 border-cyan-400/50 rounded-lg shadow-2xl shadow-cyan-400/20 bg-black/20"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
        
        {/* Player 2 Character Area (always visible; placeholder until connected) */}
        <div className="flex-1 flex justify-center">
          <CharacterPanel player={2} />
        </div>
      </div>
      
      {/* Pause Menu */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 border-2 border-cyan-400 rounded-lg p-8 text-center">
            <h2 className="text-4xl font-black text-white mb-6">PAUSED</h2>
            <div className="space-y-4">
              <NeonButton variant="primary" onClick={togglePause}>
                RESUME
              </NeonButton>
              <NeonButton variant="secondary" onClick={() => setScreen('HOME')}>
                QUIT TO HOME
              </NeonButton>
              <NeonButton variant="secondary" onClick={() => setScreen('TITLE')}>
                QUIT TO MENU
              </NeonButton>
            </div>
          </div>
        </div>
      )}
      
      {gameplay.gameOver && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-gray-900 border-2 border-red-500 rounded-lg p-8 text-center">
            <h2 className="text-6xl font-black text-red-500 mb-4">GAME OVER</h2>
            <p className="text-white text-xl mb-6">Your health reached zero!</p>
            <div className="space-y-4">
              <NeonButton variant="primary" onClick={restartSong}>
                RETRY
              </NeonButton>
              <NeonButton variant="secondary" onClick={() => setScreen('SONG_SELECT')}>
                SONG SELECT
              </NeonButton>
              <NeonButton variant="secondary" onClick={() => setScreen('HOME')}>
                MAIN MENU
              </NeonButton>
            </div>
          </div>
        </div>
      )}
      
      {/* Instructions */}
      <div className="absolute top-4 right-4 text-right text-gray-400 text-sm">
        <div>ESC = Pause</div>
  <div>Match note types: Circle=Block, Square=Uppercut, Diamond=Hook</div>
        <div>P1: F/D/S (Left), J/K/L (Right)</div>
        {lobby.connectedP2 && <div>P2: Arrows + End/PgDn</div>}
      </div>
    </div>
  );
};
