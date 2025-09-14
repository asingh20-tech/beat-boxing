export type InputAction = 'BLOCK' | 'LEFT_UPPERCUT' | 'LEFT_HOOK' | 'RIGHT_UPPERCUT' | 'RIGHT_HOOK';

export interface InputEvent {
  player: 1;
  action: InputAction;
  timestamp: number;
  lane: 'L' | 'R';
  type: 'block' | 'uppercut' | 'hook';
}

export class InputHandler {
  private callbacks = new Map<string, (event: InputEvent) => void>();
  private keyStates = new Map<string, boolean>();
  
  constructor() {
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
  }
  
  private handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key;
    
    // Prevent repeat events
    if (this.keyStates.get(key)) return;
    this.keyStates.set(key, true);
    
    const inputEvent = this.mapKeyToInput(key);
    if (inputEvent) {
      console.log('Input', { player: inputEvent.player, action: inputEvent.action });
      this.callbacks.forEach(callback => callback(inputEvent));
    }
  };
  
  private handleKeyUp = (event: KeyboardEvent) => {
    this.keyStates.set(event.key, false);
  };
  
  private mapKeyToInput(key: string): InputEvent | null {
    const timestamp = performance.now();
    
    switch (key.toLowerCase()) {
      case 'f':
        return { player: 1, action: 'BLOCK', timestamp, lane: 'L', type: 'block' };
      case 'k':
        return { player: 1, action: 'LEFT_UPPERCUT', timestamp, lane: 'L', type: 'uppercut' };
      case 's':
        return { player: 1, action: 'LEFT_HOOK', timestamp, lane: 'L', type: 'hook' };
      case 'd':
        return { player: 1, action: 'RIGHT_UPPERCUT', timestamp, lane: 'R', type: 'uppercut' };
      case 'l':
        return { player: 1, action: 'RIGHT_HOOK', timestamp, lane: 'R', type: 'hook' };
      default:
        return null;
    }
  }
  
  onInput(callback: (event: InputEvent) => void): () => void {
    const id = Math.random().toString(36);
    this.callbacks.set(id, callback);
    
    // Return cleanup function
    return () => {
      this.callbacks.delete(id);
    };
  }
  
  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    this.callbacks.clear();
  }
}
