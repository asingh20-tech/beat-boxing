import React, { useState } from 'react';
import { NeonButton } from '../components/ui/NeonButton';
import { GraffitiPanel } from '../components/ui/GraffitiPanel';
import { useGameStore } from '../store/gameStore';

export const LobbyScreen: React.FC = () => {
  const { lobby, players, hostLobby, joinLobby, startMatch, setScreen } = useGameStore();
  const [joinCode, setJoinCode] = useState('');
  
  const canStartMatch = players.p1.ready && players.p1.characterId;
  
  return (
    <div className="min-h-screen brick-wall p-8 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-purple-900/50 to-black/70"></div>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 relative z-10">
          <h1 className="text-6xl font-black graffiti-text bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-4">
            LOBBY
          </h1>
          <p className="text-gray-200 arcade-text font-bold">Setup your battle arena</p>
        </div>
        
        {/* Lobby Options */}
        {!lobby.code && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 relative z-10">
            {/* Host Lobby */}
            <GraffitiPanel>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-4">HOST LOBBY</h3>
                <p className="text-gray-300 mb-6">Create a room for others to join</p>
                <NeonButton variant="primary" onClick={hostLobby}>
                  CREATE ROOM
                </NeonButton>
              </div>
            </GraffitiPanel>
            
            {/* Join Lobby */}
            <GraffitiPanel>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-4">JOIN LOBBY</h3>
                <p className="text-gray-300 mb-6">Enter a room code to join</p>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="ENTER CODE"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 bg-gray-800 border-2 border-cyan-400/50 rounded-lg text-white text-center font-mono text-lg focus:outline-none focus:border-cyan-400"
                    maxLength={6}
                  />
                  <NeonButton 
                    variant="secondary" 
                    disabled={joinCode.length !== 6}
                    onClick={() => joinLobby(joinCode)}
                  >
                    JOIN ROOM
                  </NeonButton>
                </div>
              </div>
            </GraffitiPanel>
          </div>
        )}
        
        {/* Active Lobby */}
        {lobby.code && (
          <div className="space-y-8">
            {/* Room Code Display */}
            <GraffitiPanel variant="outlined" className="text-center">
              <h3 className="text-2xl font-bold text-white mb-4">ROOM CODE</h3>
              <div className="text-6xl font-black font-mono text-cyan-400 tracking-wider mb-4">
                {lobby.code}
              </div>
              <p className="text-gray-300">Share this code with your opponent</p>
            </GraffitiPanel>
            
            {/* Player Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Player 1 */}
              <GraffitiPanel>
                <div className="text-center">
                  <h4 className="text-xl font-bold text-white mb-4">PLAYER 1</h4>
                  <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span className="text-2xl">👤</span>
                  </div>
                  <div className="text-green-400 font-bold">READY</div>
                  <p className="text-gray-300 text-sm mt-2">
                    {players.p1.characterId?.toUpperCase() || 'No character'}
                  </p>
                </div>
              </GraffitiPanel>
              
              {/* Player 2 */}
              <GraffitiPanel>
                <div className="text-center">
                  <h4 className="text-xl font-bold text-white mb-4">PLAYER 2</h4>
                  <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span className="text-2xl">
                      {lobby.connectedP2 ? '👤' : '⏳'}
                    </span>
                  </div>
                  <div className={`font-bold ${lobby.connectedP2 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {lobby.connectedP2 ? 'READY' : 'WAITING...'}
                  </div>
                  <p className="text-gray-300 text-sm mt-2">
                    {players.p2.characterId?.toUpperCase() || 'Waiting for player'}
                  </p>
                </div>
              </GraffitiPanel>
            </div>
            
            {/* Start Match Button */}
            <div className="text-center">
              <NeonButton
                variant="accent"
                size="large"
                disabled={!canStartMatch}
                onClick={startMatch}
              >
                {lobby.connectedP2 ? 'START VERSUS MATCH' : 'START SOLO MATCH'}
              </NeonButton>
            </div>
          </div>
        )}
        
        {/* Navigation */}
        <div className="flex justify-between items-center mt-8">
          <NeonButton
            variant="secondary"
            onClick={() => setScreen('CHAR_SELECT')}
          >
            ← BACK
          </NeonButton>
          
          {!lobby.code && (
            <NeonButton
              variant="accent"
              onClick={startMatch}
            >
              SKIP TO SOLO
            </NeonButton>
          )}
        </div>
      </div>
    </div>
  );
};