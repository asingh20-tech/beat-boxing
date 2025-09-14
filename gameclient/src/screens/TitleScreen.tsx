import React, { useEffect, useRef, useState } from 'react';
import { playSelectSfx } from '../lib/sfx';
import { useGameStore } from '../store/gameStore';

const BPM = 60;
const BEAT_MS = 60000 / BPM;      
const PUNCH_MS = 500;             

export const TitleScreen: React.FC = () => {
  const { setScreen } = useGameStore();

  const [leftPunching, setLeftPunching] = useState(false);
  const [rightPunching, setRightPunching] = useState(false);

  // Which side punches on the next beat
  const nextSideRef = useRef<'left' | 'right'>('left');
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Enter/Space advances
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        playSelectSfx();
        setScreen('HOME');
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Beat-timed alternating punches
    intervalRef.current = window.setInterval(() => {
      const side = nextSideRef.current;

      if (side === 'left') {
        setLeftPunching(true);
        // Hide punch after 0.3s
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => setLeftPunching(false), PUNCH_MS);
        nextSideRef.current = 'right';
      } else {
        setRightPunching(true);
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => setRightPunching(false), PUNCH_MS);
        nextSideRef.current = 'left';
      }
    }, BEAT_MS);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [setScreen]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        backgroundImage: "url('/images/gradient-boxing-ring-background_23-2150742156.avif')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "rgba(0,0,0,0.3)",   // darkness overlay
        backgroundBlendMode: "darken",        // or "multiply" for stronger effect
      }}
    >
      {/* Left Character (Boxer) */}
      <img
        src={leftPunching ? '/images/characters/boxer-punch.png' : '/images/characters/boxer.png'}
        alt="Boxer"
        className={`absolute bottom-0 left-0 max-h-[80%] object-contain transition-transform duration-100
          ${leftPunching ? 'translate-x-4 -translate-y-2' : ''}`}
        draggable={false}
      />

      {/* Right Character (MMA Fighter) */}
      <img
        src={rightPunching ? '/images/characters/mmafighter-punch.png' : '/images/characters/mmafighter.png'}
        alt="MMA Fighter"
        className={`absolute bottom-0 right-0 max-h-[80%] object-contain transition-transform duration-100
          ${rightPunching ? '-translate-x-4 -translate-y-2' : ''}`}
        draggable={false}
      />

      <div className="text-center z-100">
        <div className="mb-12">
          <img
            src="/images/BeatBoxing.PNG"
            alt="BeatBoxing Title"
            className="mx-auto mb-6 max-w-[600px]"
            draggable={false}
          />
        </div>
        <div className="animate-pulse">
          {/* Changed enter prompt text color to white */}
          <p className="text-xl text-white arcade-text font-bold mb-4">
            PRESS ENTER TO CONTINUE
          </p>
          <div className="flex justify-center">
            <div className="px-6 py-3 border-2 border-cyan-400/50 rounded-lg bg-cyan-400/10 backdrop-blur-sm">
              {/* Changed ENTER label text color to white */}
              <span className="text-white font-mono text-lg">⏎ ENTER</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
