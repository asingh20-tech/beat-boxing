import React from 'react';
import { useGameStore } from '../store/gameStore';
import { NeonButton } from '../components/ui/NeonButton';

export const ResultsScreen: React.FC = () => {
  const { lastResults, song, setScreen, setResults } = useGameStore();

  if (!lastResults) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white">No results available.</div>
      </div>
    );
  }

  const handleBackHome = () => {
    // clear results after navigating away
    setResults?.(null as any);
    setScreen('HOME');
  };

  const handleSongSelect = () => {
    setResults?.(null as any);
    setScreen('SONG_SELECT');
  };

  const handleRetry = () => {
    // Keep the song selected, clear results and navigate to game to restart
    setResults?.(null as any);
    setScreen('GAME');
  };

  return (
    <div className="min-h-screen brick-wall relative">
      <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
        <div className="bg-gray-900 border-2 border-cyan-400 rounded-lg p-8 text-center w-96">
          <h2 className="text-4xl font-black text-white mb-4">RESULTS</h2>
          <div className="text-white/90 mb-6">
            <div className="text-lg font-bold">{song?.title ?? 'Unknown Song'}</div>
            <div className="text-sm text-gray-300">Accuracy: <span className="text-cyan-300">{lastResults.accuracy.toFixed(1)}%</span></div>
          </div>

          <div className="text-left text-sm text-gray-200 mb-6">
            <div className="flex justify-between"><span>Notes</span><span>{lastResults.totalNotes}</span></div>
            <div className="flex justify-between"><span>Perfect</span><span>{lastResults.perfectHits}</span></div>
            <div className="flex justify-between"><span>Great</span><span>{lastResults.greatHits}</span></div>
            <div className="flex justify-between"><span>Good</span><span>{lastResults.goodHits}</span></div>
            <div className="flex justify-between"><span>Miss</span><span>{lastResults.missedHits}</span></div>
          </div>

          <div className="space-y-3">
            <NeonButton variant="primary" onClick={handleRetry}>RETRY</NeonButton>
            <NeonButton variant="secondary" onClick={handleSongSelect}>SONG SELECT</NeonButton>
            <NeonButton variant="secondary" onClick={handleBackHome}>MAIN MENU</NeonButton>
          </div>
        </div>
      </div>
    </div>
  );
};
