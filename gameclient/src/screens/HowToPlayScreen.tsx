import React, { useState } from 'react';
import { NeonButton } from '../components/ui/NeonButton';
import { GraffitiPanel } from '../components/ui/GraffitiPanel';
import { useGameStore } from '../store/gameStore';

export const HowToPlayScreen: React.FC = () => {
  const { setScreen } = useGameStore();
  const [showInputTest, setShowInputTest] = useState(false);
  const [lastInput, setLastInput] = useState<string>('');
  
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!showInputTest) return;
      
      const key = event.key.toLowerCase();
      let inputName = '';
      
      switch (key) {
        case 'f': inputName = 'P1 Left Block'; break;
        case 'd': inputName = 'P1 Left Uppercut'; break;
        case 's': inputName = 'P1 Left Hook'; break;
        case 'j': inputName = 'P1 Right Block'; break;
        case 'k': inputName = 'P1 Right Uppercut'; break;
        case 'l': inputName = 'P1 Right Hook'; break;
        case 'arrowleft': inputName = 'P2 Left Block'; break;
        case 'arrowdown': inputName = 'P2 Left Uppercut'; break;
        case 'arrowup': inputName = 'P2 Left Hook'; break;
        case 'arrowright': inputName = 'P2 Right Block'; break;
        case 'end': inputName = 'P2 Right Uppercut'; break;
        case 'pagedown': inputName = 'P2 Right Hook'; break;
      }
      
      if (inputName) {
        setLastInput(inputName);
        setTimeout(() => setLastInput(''), 1000);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showInputTest]);
  
  return (
    <div className="min-h-screen brick-wall p-8 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-purple-900/50 to-black/70"></div>
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 relative z-10">
          {/* Goal */}
          <GraffitiPanel>
            <h3 className="text-2xl font-bold text-cyan-400 mb-4 arcade-text">GOAL</h3>
            <p className="text-gray-200 mb-4">
              Hit notes EXACTLY on the line. Early/late beyond 60ms is a Miss.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-green-400">Perfect</span>
                <span className="text-gray-300">≤ 20ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-400">Great</span>
                <span className="text-gray-300">≤ 40ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-yellow-400">Good</span>
                <span className="text-gray-300">≤ 60ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-400">Miss</span>
                <span className="text-gray-300"> 60ms</span>
              </div>
            </div>
          </GraffitiPanel>
          
          {/* Controls */}
          <GraffitiPanel>
            <h3 className="text-2xl font-bold text-pink-400 mb-4 arcade-text">CONTROLS</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-white font-bold mb-2">PLAYER 1</h4>
                <div className="text-sm space-y-1">
                  <div>F/D/S = Left Block/Uppercut/Hook</div>
                  <div>J/K/L = Right Block/Uppercut/Hook</div>
                </div>
              </div>
              <div>
                <h4 className="text-white font-bold mb-2">PLAYER 2</h4>
                <div className="text-sm space-y-1">
                  <div>←/↓/↑ = Left Block/Uppercut/Hook</div>
                  <div>→/End/PgDn = Right Block/Uppercut/Hook</div>
                </div>
              </div>
            </div>
          </GraffitiPanel>
          
          {/* Note Types */}
          <GraffitiPanel>
            <h3 className="text-2xl font-bold text-purple-400 mb-4 arcade-text">NOTE TYPES</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-xs font-bold">B</div>
                <span className="text-gray-200">Block (Circle, Pink)</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-green-500 flex items-center justify-center text-xs font-bold">U</div>
                <span className="text-gray-200">Uppercut (Square, Green)</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-yellow-500 transform rotate-45 flex items-center justify-center text-xs font-bold text-black">H</div>
                <span className="text-gray-200">Hook (Diamond, Yellow)</span>
              </div>
            </div>
          </GraffitiPanel>
          
          {/* Tips */}
          <GraffitiPanel>
            <h3 className="text-2xl font-bold text-orange-400 mb-4 arcade-text">TIPS</h3>
            <ul className="text-gray-200 space-y-2 text-sm">
              <li>• Tighter timing windows reward higher accuracy and score</li>
              <li>• Match note types for bonus points</li>
              <li>• Missing notes breaks your combo</li>
              <li>• Practice makes perfect!</li>
            </ul>
          </GraffitiPanel>
        </div>
        
        {/* Navigation */}
        <div className="flex justify-between items-center">
          <NeonButton
            variant="secondary"
            onClick={() => setScreen('TITLE')}
          >
            ← BACK
          </NeonButton>
          
          <NeonButton
            variant="accent"
            onClick={() => setShowInputTest(!showInputTest)}
          >
            {showInputTest ? 'CLOSE INPUT TEST' : 'TRY INPUT TEST'}
          </NeonButton>
        </div>
        
        {/* Input Test Overlay */}
        {showInputTest && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <GraffitiPanel className="max-w-md">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-4">INPUT TEST</h3>
                <p className="text-gray-300 mb-6">Press any game key to test</p>
                
                <div className="h-16 flex items-center justify-center">
                  {lastInput ? (
                    <div className="text-2xl font-bold text-cyan-400 animate-pulse">
                      {lastInput}
                    </div>
                  ) : (
                    <div className="text-gray-500">Waiting for input...</div>
                  )}
                </div>
                
                <NeonButton
                  variant="secondary"
                  onClick={() => setShowInputTest(false)}
                >
                  CLOSE
                </NeonButton>
              </div>
            </GraffitiPanel>
          </div>
        )}
      </div>
    </div>
  );
};
