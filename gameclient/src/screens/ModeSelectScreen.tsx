import React, { useState, useEffect, useMemo } from 'react';
import { playNavSfx, playSelectSfx } from '../lib/sfx';
import { GraffitiPanel } from '../components/ui/GraffitiPanel';
import { NeonButton } from '../components/ui/NeonButton';
import { useGameStore } from '../store/gameStore';

export const ModeSelectScreen: React.FC = () => {
  const { setScreen, setMode, lobby, hostLobby, joinLobby } = useGameStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [joinCode, setJoinCode] = useState('');
  
  const modes = useMemo(() => [
    { 
      id: 'solo', 
      label: 'SINGLE PLAYER', 
      description: 'Practice your rhythm skills solo',
      action: () => {
        setMode('solo');
        setScreen('SONG_SELECT');
      }
    },
    { 
      id: 'multiplayer', 
      label: 'MULTIPLAYER', 
      description: 'Battle against another player',
      action: () => {
        setMode('multiplayer');
        hostLobby();
        setScreen('SONG_SELECT');
      }
    },
  ], [setMode, setScreen, hostLobby]);
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex((prev) => {
            const next = (prev - 1 + modes.length) % modes.length;
            playNavSfx();
            return next;
          });
          break;
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex((prev) => {
            const next = (prev + 1) % modes.length;
            playNavSfx();
            return next;
          });
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          playSelectSfx();
          modes[selectedIndex].action();
          break;
        case 'Escape':
          event.preventDefault();
          setScreen('HOME');
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, modes, setScreen]);
  
  return (
    <div className="min-h-screen brick-wall p-8 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-purple-900/50 to-black/70"></div>
      <div className="max-w-4xl mx-auto">
        {/* Mode Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 relative z-10">
          {modes.map((mode, index) => (
            <div
              key={mode.id}
              className={`transition-all duration-200 ${
                selectedIndex === index ? 'scale-105 transform' : 'scale-100'
              }`}
            >
              <GraffitiPanel
                variant={selectedIndex === index ? 'outlined' : 'default'}
                className={`cursor-pointer h-full ${
                  selectedIndex === index ? 'ring-2 ring-pink-500/50' : ''
                }`}
              >
                <div onClick={() => { playSelectSfx(); mode.action(); }} className="text-center space-y-4">
                  {/* Mode Icon */}
                  <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-4xl">
                      {mode.id === 'solo' ? '👤' : '👥'}
                    </span>
                  </div>
                  
                  {/* Mode Title */}
                  <h3 className="text-3xl font-bold text-white arcade-text">
                    {mode.label}
                  </h3>
                  
                  {/* Description */}
                  <p className="text-gray-300 text-lg">
                    {mode.description}
                  </p>
                  
                  {/* Selection indicator */}
                  {selectedIndex === index && (
                    <div className="flex justify-center space-x-4 mt-6">
                      <div className="w-0 h-0 border-t-8 border-b-8 border-l-12 border-transparent border-l-cyan-400 animate-bounce"></div>
                      <span className="text-cyan-400 font-bold arcade-text">SELECTED</span>
                      <div className="w-0 h-0 border-t-8 border-b-8 border-r-12 border-transparent border-r-cyan-400 animate-bounce"></div>
                    </div>
                  )}
                </div>
              </GraffitiPanel>
            </div>
          ))}
        </div>
        
        {/* Host result or Join by Code */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 relative z-10">
          {/* If hosting, show code */}
          {lobby.code && (
            <GraffitiPanel variant="outlined">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-4">ROOM CODE</h3>
                <div className="text-5xl font-black font-mono text-cyan-400 tracking-wider mb-3">
                  {lobby.code}
                </div>
                <p className="text-gray-300">Share this code with your opponent</p>
              </div>
            </GraffitiPanel>
          )}

          {/* Always show join box */}
          <GraffitiPanel>
            <div className="text-center">
              <h3 className="text-2xl font-bold text-white mb-4">JOIN LOBBY</h3>
              <p className="text-gray-300 mb-4">Enter a 6-character room code</p>
              <div className="flex flex-col items-center gap-4">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="ENTER CODE"
                  className="w-full md:w-64 px-4 py-3 bg-gray-800 border-2 border-cyan-400/50 rounded-lg text-white text-center font-mono text-lg focus:outline-none focus:border-cyan-400"
                />
                <NeonButton
                  variant="secondary"
                  disabled={joinCode.length !== 6}
                  onClick={() => { playSelectSfx(); joinLobby(joinCode); setScreen('SONG_SELECT'); }}
                >
                  JOIN ROOM
                </NeonButton>
              </div>
            </div>
          </GraffitiPanel>
        </div>
        
        {/* Controls */}
        <div className="flex justify-between items-center text-gray-400 text-sm arcade-text">
          <div>
            <div>[↑↓ TO NAVIGATE]</div>
            <div>[ENTER TO SELECT]</div>
          </div>
          <div>
            <div>[ESC TO GO BACK]</div>
          </div>
        </div>
      </div>
    </div>
  );
};
