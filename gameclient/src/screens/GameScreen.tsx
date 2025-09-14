import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { GameEngine, Note, Judgment } from '../game/gameEngine';
import { InputHandler, InputEvent } from '../game/inputHandler';
import { CharacterSpriteManager } from '../game/characterSprites';
import { NeonButton } from '../components/ui/NeonButton';

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
    setScreen
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
  }, [updateGameplay]);

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

  const handleInput = useCallback((inputEvent: InputEvent) => {
    if (isPaused || !gameEngineRef.current || !characterManagerRef.current) return;

    const result = gameEngineRef.current.handleInput(inputEvent.lane, inputEvent.type, inputEvent.player);

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
    characterManagerRef.current.triggerAction(inputEvent.player, inputEvent.action);
  }, [isPaused]);
  
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
    
    // Set up note result callback
    gameEngineRef.current.setNoteResultCallback(handleNoteResult);
    
    // Set up health update callback
    gameEngineRef.current.setHealthUpdateCallback(handleHealthUpdate);

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
    
    // Start game
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
    const combo = player === 1 ? gameplay.comboP1 : gameplay.comboP2;
    const accuracy = player === 1 ? gameplay.accuracyP1 : gameplay.accuracyP2;
    const health = player === 1 ? gameplay.healthP1 : gameplay.healthP2;
    
    if (!character.characterId) return null;
    
    const pose = characterManagerRef.current?.getCurrentPose(player) || 'idle';
    const colorClass = player === 1 ? 'from-pink-500 to-purple-600' : 'from-cyan-400 to-blue-500';
    
    return (
      <div className="bg-gray-900/90 rounded-lg p-6 border-2 border-white/30 shadow-2xl backdrop-blur-sm max-w-xs">
        <div className="text-center mb-4">
          <h3 className="text-white font-bold text-xl arcade-text">PLAYER {player}</h3>
          <div className="text-gray-300 text-sm arcade-text">{character.characterId?.toUpperCase()}</div>
        </div>
        
        {/* Character Display */}
        <div className={`w-32 h-40 mx-auto mb-6 bg-gradient-to-br ${colorClass} rounded-lg flex items-center justify-center relative overflow-hidden shadow-lg`}>
          <div className="text-6xl">👤</div>
          {pose !== 'idle' && (
            <div className="absolute inset-0 bg-white/30 animate-pulse rounded-lg"></div>
          )}
          {/* Graffiti tag */}
             <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-black text-xs font-bold px-2 py-1 rounded transform rotate-12">
               {pose === 'block' ? 'BLOCK' : pose === 'uppercut' ? 'UPPERCUT' : pose.toUpperCase()}
          </div>
        </div>
        
        {/* Stats */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Health</span>
            <span className={`font-bold arcade-text ${health > 50 ? 'text-green-400' : health > 25 ? 'text-yellow-400' : 'text-red-400'}`}>
              {health}%
            </span>
          </div>
          {/* Health Bar */}
          <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                health > 50 ? 'bg-green-400' : health > 25 ? 'bg-yellow-400' : 'bg-red-400'
              }`}
              style={{ width: `${health}%` }}
            ></div>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Score</span>
            <span className="text-white font-bold arcade-text">{score.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Combo</span>
            <span className="text-yellow-400 font-bold arcade-text">{combo}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Accuracy</span>
            <span className="text-cyan-400 font-bold arcade-text">{accuracy.toFixed(1)}%</span>
          </div>
        </div>
        
        {/* Control hints */}
        <div className="mt-6 text-xs text-gray-400 text-center arcade-text">
          {player === 1 ? 'F/D/S = L Block/Uppercut/Hook, J/K/L = R Block/Uppercut/Hook' : '←/↓/↑ = L Block/Uppercut/Hook, →/End/PgDn = R Block/Uppercut/Hook'}
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen brick-wall relative">
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-purple-900/40 to-black/60"></div>
      
  {/* Multiplayer lobby controls live on the Song Select screen */}

      {/* HUD */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex items-center space-x-6 bg-gray-900/90 rounded-full px-6 py-3 border-2 border-cyan-400/50">
          <div className="text-center">
            <div className="text-cyan-400 text-sm">SCORE</div>
            <div className="text-white font-bold text-lg">
              {(gameplay.scoreP1 + gameplay.scoreP2).toLocaleString()}
            </div>
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
            <div className="text-pink-400 text-sm">ACCURACY</div>
            <div className="text-white font-bold text-lg">
              {((gameplay.accuracyP1 + gameplay.accuracyP2) / 2).toFixed(1)}%
            </div>
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
        
        {/* Player 2 Character Area */}
        <div className="flex-1 flex justify-center">
          {lobby.connectedP2 && <CharacterPanel player={2} />}
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
