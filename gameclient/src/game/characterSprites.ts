export type CharacterPose = 'idle' | 'jab' | 'punch' | 'hook';
// did you know that the character sprites are actually vibe codable too?
export interface CharacterState {
  characterId: string;
  currentPose: CharacterPose;
  poseTimer: number;
}

export class CharacterSpriteManager {
  private player1State: CharacterState = { characterId: '', currentPose: 'idle', poseTimer: 0 };
  private player2State: CharacterState = { characterId: '', currentPose: 'idle', poseTimer: 0 };
  private onPoseChange?: () => void;
  // Simple in-memory image cache to guarantee instant swaps
  private imageStatus: Record<string, 'pending' | 'loaded' | 'error'> = {};
  
  private readonly POSE_DURATION = 200; // ms

  constructor() {
    // Preload common character assets up-front to avoid first-swap delays
    this.ensurePreloadedFor('boxer');
    this.ensurePreloadedFor('mmafighter');
  }
  
  setCharacter(player: 1 | 2, characterId: string) {
  // Start preloading as soon as a character is set
  const base = characterId === 'mmafighter' ? 'mmafighter' : 'boxer';
  this.ensurePreloadedFor(base);
    if (player === 1) {
      this.player1State.characterId = characterId;
    } else {
      this.player2State.characterId = characterId;
    }
  }

  setOnPoseChange(cb: () => void) {
    this.onPoseChange = cb;
  }
  
  triggerAction(player: 1 | 2, action: 'LEFT_BLOCK' | 'LEFT_UPPERCUT' | 'LEFT_HOOK' | 'RIGHT_BLOCK' | 'RIGHT_UPPERCUT' | 'RIGHT_HOOK') {
    const state = player === 1 ? this.player1State : this.player2State;
    
    // Map BLOCK to jab pose (reuse visuals), UPPERCUT to punch pose, HOOK stays hook
    if (action.includes('BLOCK')) {
      state.currentPose = 'jab';
    } else if (action.includes('UPPERCUT')) {
      state.currentPose = 'punch';
    } else if (action.includes('HOOK')) {
      state.currentPose = 'hook';
    } else if (action.includes('JAB')) {
      state.currentPose = 'jab';
    } else if (action.includes('PUNCH')) {
      state.currentPose = 'punch';
    }
    
    state.poseTimer = this.POSE_DURATION;
  this.onPoseChange?.();
    
    // Auto-return to idle after duration
    setTimeout(() => {
      if (state.poseTimer <= 0) {
        state.currentPose = 'idle';
    this.onPoseChange?.();
      }
    }, this.POSE_DURATION);
  }
  
  update(deltaTime: number) {
    this.updatePlayerState(this.player1State, deltaTime);
    this.updatePlayerState(this.player2State, deltaTime);
  }
  
  private updatePlayerState(state: CharacterState, deltaTime: number) {
    if (state.poseTimer > 0) {
      state.poseTimer -= deltaTime;
      if (state.poseTimer <= 0) {
        state.currentPose = 'idle';
      }
    }
  }

  private ensurePreloadedFor(base: 'boxer' | 'mmafighter') {
    const idle = `/images/characters/${base}.png`;
    const punch = `/images/characters/${base}-punch.png`;
    this.preloadImage(idle);
    this.preloadImage(punch);
  }

  private preloadImage(src: string) {
    if (!src) return;
    const status = this.imageStatus[src];
    if (status === 'loaded' || status === 'pending') return; // already handled
    this.imageStatus[src] = 'pending';
    // Guard for non-browser contexts
    if (typeof Image === 'undefined') {
      // Assume loaded in non-DOM environments so we still return paths
      this.imageStatus[src] = 'loaded';
      return;
    }
    const img = new Image();
    img.onload = () => {
      this.imageStatus[src] = 'loaded';
    };
    img.onerror = () => {
      this.imageStatus[src] = 'error';
    };
    img.src = src;
  }
  
  getCharacterImage(player: 1 | 2): string {
    const state = player === 1 ? this.player1State : this.player2State;
    const { characterId, currentPose } = state;
    
    if (!characterId) return '';
    // Map to public images: idle uses base, any move uses -punch variant
    const base = characterId === 'mmafighter' ? 'mmafighter' : 'boxer';
    // Ensure assets are preloaded before we decide which to return
    this.ensurePreloadedFor(base);
    if (currentPose === 'idle') {
      return `/images/characters/${base}.png`;
    }
    // For jab/punch/hook use the punch image, but fall back instantly to idle if punch failed to load
    const punchPath = `/images/characters/${base}-punch.png`;
    const status = this.imageStatus[punchPath];
    if (status === 'loaded' || status === 'pending') {
      // pending is okay because browser will serve from memory/cache as soon as available; avoids layout thrash
      return punchPath;
    }
    // If error or unknown, prefer idle to avoid 404 flashes
    return `/images/characters/${base}.png`;
  }
  
  getCurrentPose(player: 1 | 2): CharacterPose {
    const state = player === 1 ? this.player1State : this.player2State;
    return state.currentPose;
  }
}
