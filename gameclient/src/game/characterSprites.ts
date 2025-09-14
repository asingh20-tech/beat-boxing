export type CharacterPose = 'idle' | 'jab' | 'punch' | 'hook';

export interface CharacterState {
  characterId: string;
  currentPose: CharacterPose;
  poseTimer: number;
}

export class CharacterSpriteManager {
  private player1State: CharacterState = { characterId: '', currentPose: 'idle', poseTimer: 0 };
  private player2State: CharacterState = { characterId: '', currentPose: 'idle', poseTimer: 0 };
  
  private readonly POSE_DURATION = 200; // ms
  
  setCharacter(player: 1 | 2, characterId: string) {
    if (player === 1) {
      this.player1State.characterId = characterId;
    } else {
      this.player2State.characterId = characterId;
    }
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
    
    // Auto-return to idle after duration
    setTimeout(() => {
      if (state.poseTimer <= 0) {
        state.currentPose = 'idle';
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
  
  getCharacterImage(player: 1 | 2): string {
    const state = player === 1 ? this.player1State : this.player2State;
    const { characterId, currentPose } = state;
    
    if (!characterId) return '';
    
    // Return placeholder path - in real implementation, these would be actual image files
    return `/assets/chars/${characterId}-${currentPose}.png`;
  }
  
  getCurrentPose(player: 1 | 2): CharacterPose {
    const state = player === 1 ? this.player1State : this.player2State;
    return state.currentPose;
  }
}
