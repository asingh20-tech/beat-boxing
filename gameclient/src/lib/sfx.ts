// Simple SFX helper using shared AudioContext and master GainNode
let navBuffer: AudioBuffer | null = null;
let selectBuffer: AudioBuffer | null = null;

declare global {
  interface Window {
    gameAudioContext?: AudioContext;
    gameGainNode?: GainNode;
  }
}

const getAudioContext = (): { ctx: AudioContext; gain: GainNode } => {
  const ctx = window.gameAudioContext || new AudioContext();
  const gain = window.gameGainNode || ctx.createGain();
  if (!window.gameAudioContext) {
    window.gameAudioContext = ctx;
  }
  if (!window.gameGainNode) {
    window.gameGainNode = gain;
    gain.connect(ctx.destination);
  }
  return { ctx, gain };
};

const loadNavBuffer = async (ctx: AudioContext): Promise<AudioBuffer> => {
  if (navBuffer) return navBuffer;
  const res = await fetch('/sounds/navigation.wav', { cache: 'force-cache' });
  const arrayBuf = await res.arrayBuffer();
  navBuffer = await ctx.decodeAudioData(arrayBuf);
  return navBuffer;
};

export const playNavSfx = async () => {
  const { ctx, gain } = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const buffer = await loadNavBuffer(ctx);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(gain);
  src.start(0);
};

const loadSelectBuffer = async (ctx: AudioContext): Promise<AudioBuffer> => {
  if (selectBuffer) return selectBuffer;
  const res = await fetch('/sounds/selection.mp3', { cache: 'force-cache' });
  const arrayBuf = await res.arrayBuffer();
  selectBuffer = await ctx.decodeAudioData(arrayBuf);
  return selectBuffer;
};

export const playSelectSfx = async () => {
  const { ctx, gain } = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const buffer = await loadSelectBuffer(ctx);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(gain);
  src.start(0);
};
