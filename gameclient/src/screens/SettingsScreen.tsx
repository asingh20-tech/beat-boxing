import React from 'react';
import { useGameStore } from '../store/gameStore';

export const SettingsScreen: React.FC = () => {
  const { settings, updateSettings, setScreen } = useGameStore();

  const handleVolumeChange = (volume: number) => {
    updateSettings({ volume });
    // Apply volume immediately to shared gain node
    type W = Window & { gameAudioContext?: AudioContext, gameGainNode?: { gain: { value: number } } };
    const w = window as W;
    const gainNode = w.gameGainNode;
    if (gainNode) gainNode.gain.value = volume;
  };

  // ESC -> back to menu
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setScreen('HOME');
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setScreen]);

  return (
    <div
      className="min-h-screen bg-center bg-no-repeat bg-[length:100%_100%] p-8 relative"
      style={{ backgroundImage: "url('/images/silly.png')" }}
    >
      {/* Centered Box container */}
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="relative w-full max-w-[900px]">
          {/* Your custom box image */}
          <img
            src="/images/Box.png"
            alt="Settings Panel"
            className="w-full h-[400px] object-fill select-none pointer-events-none"
            draggable={false}
          />

          {/* Overlayed content */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full max-w-[700px] px-8">
              <h3 className="text-3xl font-black text-white text-center mb-6 arcade-text">
                MASTER VOLUME
              </h3>

              <div className="space-y-5">
                <div className="flex items-center space-x-4">
                  <span className="text-gray-200 w-12 text-sm text-right">0%</span>
                  <div className="flex-1 relative">
                    <input
                      aria-label="Master Volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="slider w-full h-3 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #22d3ee ${settings.volume * 100}%, #374151 ${settings.volume * 100}%)`,
                      }}
                    />
                  </div>
                  <span className="text-gray-200 w-12 text-sm">100%</span>
                </div>

                <div className="text-center">
                  <span className="text-cyan-300 font-bold text-2xl arcade-text">
                    {Math.round(settings.volume * 100)}%
                  </span>
                </div>

                <div className="text-center text-xs text-black-300 opacity-80">
                  Press <span className="font-bold">ESC</span> to return to Menu
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slider styling */}
      <style>{`
        /* Reset default look */
        .slider { -webkit-appearance: none; appearance: none; outline: none; }
        /* Track */
        .slider::-webkit-slider-runnable-track { height: 12px; border-radius: 9999px; background: transparent; }
        .slider::-moz-range-track { height: 12px; border-radius: 9999px; background: transparent; }
        /* Thumb */
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #22d3ee;
          border: 2px solid #0ea5e9;
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.8);
          margin-top: -4px; /* center on 12px track */
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #22d3ee;
          border: 2px solid #0ea5e9;
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.8);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};
