import React, { useEffect } from 'react';
import { playSelectSfx } from '../lib/sfx';
import { useGameStore } from '../store/gameStore';

export const TitleScreen: React.FC = () => {
  const { setScreen } = useGameStore();
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        playSelectSfx();
        setScreen('HOME');
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setScreen]);
  
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      
      <div className="text-center z-10">
        <div className="mb-12">
          <img
            src="/images/BeatBoxing.PNG"
            alt="BeatBoxing Title"
            className="mx-auto mb-6 max-w-[600px]" // you can adjust sizing
          />
        </div>
        <div className="animate-pulse">
          <p className="text-xl text-cyan-400 arcade-text font-bold mb-4">
            PRESS ENTER TO CONTINUE
          </p>
          <div className="flex justify-center">
            <div className="px-6 py-3 border-2 border-cyan-400/50 rounded-lg bg-cyan-400/10 backdrop-blur-sm">
              <span className="text-cyan-400 font-mono text-lg">⏎ ENTER</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
