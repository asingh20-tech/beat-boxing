import { useEffect, useRef } from 'react';
import { useGameStore } from './store/gameStore';
import { TitleScreen } from './screens/TitleScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SongSelectScreen } from './screens/SongSelectScreen';
import { GameScreen } from './screens/GameScreen';
import { HowToPlayScreen } from './screens/HowToPlayScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { connectSpacetime } from './lib/spacetime';

function App() {
  const { currentScreen, settings } = useGameStore();
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
  // Initialize SpaceTimeDB connection as soon as the app mounts
  const saved = localStorage.getItem('auth_token') || undefined;
  connectSpacetime(saved);

    const audio = bgmRef.current;
    if (!audio) return;

    const volume = Math.max(0, Math.min(1, settings?.volume ?? 0.4));
    audio.volume = volume;

    const blockedScreens = new Set(['GAME', 'SONG_SELECT']);
    const shouldPlay = !blockedScreens.has(currentScreen);

    const tryPlay = () => audio.play().catch(() => { /* wait for user gesture */ });

    if (shouldPlay) {
      // If we just opened the TITLE screen, restart from the beginning
      if (currentScreen === 'TITLE') {
        audio.currentTime = 0;
      }
      tryPlay();
    } else {
      audio.pause();
      audio.currentTime = 0; // reset when entering blocked screens
    }

    // Help with autoplay policies by retrying after first interaction
    const resume = () => { if (shouldPlay) tryPlay(); cleanup(); };
    const cleanup = () => {
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
    };
    document.addEventListener('click', resume);
    document.addEventListener('keydown', resume);

    return cleanup;
  }, [currentScreen, settings?.volume]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'TITLE': return <TitleScreen />;
      case 'HOME': return <HomeScreen />;
  // MODE_SELECT removed; Multiplayer flows start in Song Select
      case 'SONG_SELECT': return <SongSelectScreen />;
      case 'GAME': return <GameScreen />;
      case 'HOW_TO_PLAY': return <HowToPlayScreen />;
  case 'SETTINGS': return <SettingsScreen />;
  case 'RESULTS': return <ResultsScreen />;
      default: return <TitleScreen />;
    }
  };

  return (
    <div>
      {/* Global menu music */}
      <audio
        ref={bgmRef}
        src="/songs/menubackground/DaftPunkVoyager.ogg"
        loop
        preload="auto"
      />
      {renderScreen()}
    </div>
  );
}

export default App;
