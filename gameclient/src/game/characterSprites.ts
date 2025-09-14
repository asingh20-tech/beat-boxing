export type CharacterPose = 'idle' | 'block' | 'uppercut' | 'hook';

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
    
    // Map incoming actions to pose names. We keep 'hook' the same.
    if (action.includes('BLOCK')) {
      state.currentPose = 'block';
    } else if (action.includes('UPPERCUT')) {
      state.currentPose = 'uppercut';
    } else if (action.includes('HOOK')) {
      state.currentPose = 'hook';
    } else if (action.includes('JAB')) {
      // Legacy action string
      state.currentPose = 'block';
    } else if (action.includes('PUNCH')) {
      // Legacy action string
      state.currentPose = 'uppercut';
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
