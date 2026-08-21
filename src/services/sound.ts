/**
 * Web Audio API Synthesizer for Spider-Noir Atmospheric Audio
 */

let audioCtx: AudioContext | null = null;
let rainNode: AudioNode | null = null;
let rainGain: GainNode | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1. Timer Completion Chime (Deep Noir Resonant Bell)
export function playTimerCompleteSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const frequencies = [587.33, 880, 1174.66]; // D5, A5, D6 harmonic chord

  frequencies.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = idx === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now + idx * 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.25 / (idx + 1), now + idx * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.08);
    osc.stop(now + 2.5);
  });
}

// 2. Task Completion Click / Vintage Typewriter Key Striker
export function playTaskCompleteSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Key click transient
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(320, now + 0.06);

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.09);

  // Subtle metallic ring
  const bellOsc = ctx.createOscillator();
  const bellGain = ctx.createGain();
  bellOsc.type = 'sine';
  bellOsc.frequency.setValueAtTime(987.77, now + 0.02); // B5 note

  bellGain.gain.setValueAtTime(0.08, now + 0.02);
  bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  bellOsc.connect(bellGain);
  bellGain.connect(ctx.destination);

  bellOsc.start(now + 0.02);
  bellOsc.stop(now + 0.5);
}

// 3. Subtle Tick
export function playTickSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1800, now);

  gain.gain.setValueAtTime(0.02, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.03);
}

// 3b. Spidey Companion Reply Chime (Crisp, gentle 2-tone noir synth blip)
export function playSpideyReplySound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // First high tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, now); // A5
  osc1.frequency.exponentialRampToValueAtTime(1174.66, now + 0.08); // D6

  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.linearRampToValueAtTime(0.12, now + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.25);

  // Second soft resonant tone
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(1318.51, now + 0.06); // E6

  gain2.gain.setValueAtTime(0.001, now + 0.06);
  gain2.gain.linearRampToValueAtTime(0.08, now + 0.09);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.06);
  osc2.stop(now + 0.4);
}

// 4. Ambient Rain Generator
export function toggleAmbientRain(enable: boolean) {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (!enable) {
    if (rainGain) {
      rainGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      setTimeout(() => {
        if (rainNode) {
          rainNode.disconnect();
          rainNode = null;
        }
      }, 600);
    }
    return;
  }

  if (rainNode) return; // already active

  // Create pink/brown filtered noise buffer
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    output[i] *= 0.035; // gentle level
    b6 = white * 0.115926;
  }

  const whiteNoise = ctx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;
  whiteNoise.loop = true;

  // Filter to soften rain
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, ctx.currentTime);

  rainGain = ctx.createGain();
  rainGain.gain.setValueAtTime(0.001, ctx.currentTime);
  rainGain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 1.2);

  whiteNoise.connect(filter);
  filter.connect(rainGain);
  rainGain.connect(ctx.destination);

  whiteNoise.start(0);
  rainNode = whiteNoise;
}

