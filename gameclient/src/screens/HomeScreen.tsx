import React, { useState, useEffect, useMemo, useRef } from 'react';
import { playNavSfx, playSelectSfx } from '../lib/sfx';
import { useGameStore } from '../store/gameStore';

export const HomeScreen: React.FC = () => {
  const { setScreen, setMode } = useGameStore();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const menuItems = useMemo(() => [
    { label: 'SINGLE PLAYER',
      imgDefault: '/images/FreeplayB.PNG',
      imgFocused: '/images/FreeplayW.PNG',
  action: () => { setMode('solo'); setScreen('SONG_SELECT'); }
    },
    { label: 'MULTIPLAYER',
      imgDefault: '/images/VersusB.PNG',
      imgFocused: '/images/VersusW.PNG',
  action: () => { setMode('multiplayer'); setScreen('SONG_SELECT'); }
    },
    { label: 'HOW TO PLAY',
      imgDefault: '/images/HowToPlayB.PNG',
      imgFocused: '/images/HowToPlayW.PNG',
      action: () => setScreen('HOW_TO_PLAY')
    },
    { label: 'SETTINGS',
      imgDefault: '/images/OptionB.PNG',
      imgFocused: '/images/OptionW.PNG',
      action: () => setScreen('SETTINGS')
    },
  ], [setMode, setScreen]);

  // Arrow key navigation + select
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex((prev) => {
            const next = (prev - 1 + menuItems.length) % menuItems.length;
            playNavSfx();
            return next;
          });
          break;
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex((prev) => {
            const next = (prev + 1) % menuItems.length;
            playNavSfx();
            return next;
          });
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          playSelectSfx();
          menuItems[selectedIndex].action();
          break;
      }
    };
//comment
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, menuItems]);

  // Keep selected item centered
  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedIndex]);

  // Center initial selection on mount
  useEffect(() => {
    const el = itemRefs.current[0];
    if (el) el.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div className="min-h-screen bg-[#FCB900] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="text-center z-10 w-full">
        {/* Scrollable, snap-to-center list with padding/spacers to avoid cropping */}
        <div
          ref={containerRef}
          className="space-y-8 h-screen overflow-y-auto scroll-smooth snap-y snap-mandatory px-4 py-[25vh]"
        >
          <div className="h-[20vh] shrink-0" />
          {menuItems.map((item, index) => (
            <div
              key={item.label}
              ref={(el) => (itemRefs.current[index] = el)}
              className={`snap-center transition-transform duration-200 ${
                selectedIndex === index ? 'scale-110' : 'scale-100'
              }`}
            >
              <button
                onClick={() => { playSelectSfx(); item.action(); }}
                onFocus={() => setSelectedIndex(index)}
                onMouseEnter={() => setSelectedIndex(index)}
                className="block w-full focus:outline-none focus-visible:outline-none"
              >
                <img
                  src={selectedIndex === index ? item.imgFocused : item.imgDefault}
                  alt={item.label}
                  className="mx-auto max-w-[400px]"
                />
              </button>
            </div>
          ))}
          <div className="h-[20vh] shrink-0" />
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute bottom-10 left-10 text-cyan-400/80 arcade-text text-sm font-bold space-y-1">
        <div>[↑↓ TO NAVIGATE]</div>
        <div>[ENTER TO SELECT]</div>
      </div>

      <div className="absolute bottom-10 right-10 text-pink-400/80 arcade-text text-sm font-bold">
        v1.0.0
      </div>
    </div>
  );
};
