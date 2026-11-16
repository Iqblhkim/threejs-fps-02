// Synthesised sound effects — WebAudio only, no audio files, no network.
// Every method is a no-op until the first user gesture resumes the context,
// so headless captures and the title screen stay silent and error-free.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      noiseBuffer = context.createBuffer(1, context.sampleRate * 1, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      context = null;
    }
    return context;
  }

  function noise(duration, filterFreq, gainValue, when = 0) {
    if (!ensure() || context.state === 'suspended') return;
    const t = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, Math.random() * 0.5, duration + 0.05);
    source.stop(t + duration + 0.1);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = 0, when = 0) {
    if (!ensure() || context.state === 'suspended') return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  const SHOT = {
    p2000: { noise: 0.09, freq: 2400, gain: 0.5, thump: 140 },
    viper: { noise: 0.07, freq: 3000, gain: 0.42, thump: 160 },
    vk47: { noise: 0.11, freq: 1800, gain: 0.6, thump: 110 },
    longshot: { noise: 0.22, freq: 1200, gain: 0.75, thump: 70 },
    breacher: { noise: 0.16, freq: 900, gain: 0.7, thump: 90 },
  };

  return {
    resume() { if (ensure() && context.state === 'suspended') context.resume().catch(() => {}); },
    get enabled() { return !!context && context.state === 'running'; },
    shot(id) {
      const s = SHOT[id] || SHOT.vk47;
      noise(s.noise, s.freq, s.gain);
      tone(s.thump, 0.09, 0.5, 'sine', 55);
    },
    distantShot() { noise(0.08, 900, 0.16); tone(120, 0.07, 0.14, 'sine', 60); },
    dry() { tone(1800, 0.03, 0.2, 'square'); },
    reload() { tone(900, 0.04, 0.25, 'square'); tone(650, 0.04, 0.25, 'square', 0, 0.18); },
    hit(kill) {
      tone(kill ? 1400 : 1100, 0.05, 0.3, 'square');
      if (kill) tone(1800, 0.09, 0.3, 'square', 0, 0.06);
    },
    step() { noise(0.05, 500, 0.1); },
    plantBeep(final) { tone(final ? 1600 : 1000, final ? 0.18 : 0.07, 0.3, 'square'); },
    explosion() {
      noise(0.9, 500, 0.9);
      tone(60, 0.8, 0.8, 'sine', 28);
    },
    win() { tone(523, 0.16, 0.3); tone(659, 0.16, 0.3, 'sine', 0, 0.14); tone(784, 0.3, 0.3, 'sine', 0, 0.28); },
    lose() { tone(392, 0.2, 0.3); tone(311, 0.3, 0.3, 'sine', 0, 0.18); },
    buy() { tone(1200, 0.05, 0.25, 'square'); tone(1600, 0.07, 0.25, 'square', 0, 0.05); },
    click() { tone(800, 0.03, 0.2, 'square'); },
    bounce() { tone(300, 0.05, 0.2, 'sine', 180); },
    scope() { tone(500, 0.06, 0.15, 'sine', 900); },
    defuseBeep() { tone(880, 0.06, 0.25, 'square'); },
  };
}
