// Sound for the landing demo, made in the browser with the Web Audio API: no audio files, nothing to
// license or download. A soft, upbeat product-demo loop (warm pad, plucked arpeggio, round bass, a
// light shaker) plus small UI sounds (keys, send, tap, pops, an end chime).
//
// Starts only from a click (browsers require a gesture), pauses with the demo (the AudioContext is
// suspended, so the music stops exactly where it was), and can be muted (remembered per browser).

const BPM = 98;
const EIGHTH = 60 / BPM / 2;
// Cmaj9 – Am9 – Fmaj7 – G6sus: bright, calm, "product launch".
const CHORDS = [
  [48, 55, 59, 62, 64],
  [45, 52, 55, 59, 60],
  [41, 48, 52, 55, 57],
  [43, 50, 55, 57, 62],
];
const ARP = [1, 2, 3, 4, 3, 2, 4, 3]; // index into the chord, an octave up
const MUTE_KEY = "ays-demo-muted";
const MUSIC_LEVEL = 0.2;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function savedMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export class DemoAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus: GainNode | null = null;
  private noise!: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private step = 0;
  muted = savedMuted();

  /** Create/resume the audio context. Call from inside a click handler. */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.32;
      this.sfxBus.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  /** Start the music from the top (fades in). */
  start() {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    this.stopMusic();
    const bus = ctx.createGain();
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 2600;
    bus.connect(warm).connect(this.master);
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + 1.6);
    this.musicBus = bus;
    this.next = ctx.currentTime + 0.06;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  pause() {
    void this.ctx?.suspend();
  }

  resume() {
    this.unlock();
  }

  /** The demo ended: a chime, and the music fades away. */
  finish() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.chime();
    const bus = this.musicBus;
    if (bus) {
      // Fade from the music level itself: gain.value isn't reliable in every browser (Safari, offline).
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setValueAtTime(MUSIC_LEVEL, ctx.currentTime);
      bus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.2);
      setTimeout(() => this.musicBus === bus && this.stopMusic(), 2400);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  close() {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
  }

  // ── sound effects ──────────────────────────────────────────

  key() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600 + Math.random() * 1600;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22 + Math.random() * 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(bp).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5, 0.05);
  }

  tap() {
    this.blip(880, 520, 0.07, 0.5);
  }

  send() {
    this.blip(420, 980, 0.16, 0.35, "triangle");
  }

  pop() {
    this.blip(660, 660, 0.09, 0.35);
    this.blip(990, 990, 0.12, 0.3, "sine", 0.07);
  }

  private chime() {
    [1046.5, 1318.5, 1568].forEach((f, i) => this.bell(f, i * 0.11));
  }

  private blip(from: number, to: number, dur: number, vol: number, type: OscillatorType = "sine", delay = 0) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private bell(f: number, delay: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    for (const [mult, vol] of [[1, 0.28], [2.76, 0.06]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(this.sfxBus);
      o.start(t);
      o.stop(t + 1.5);
    }
  }

  // ── music ──────────────────────────────────────────────────

  private stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.musicBus?.disconnect();
    this.musicBus = null;
  }

  /** Look-ahead scheduler: queues the next ~0.25 s of eighth notes. While the context is suspended
   *  its clock stands still, so nothing piles up. */
  private schedule() {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    while (this.next < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.next, bus);
      this.next += EIGHTH;
      this.step++;
    }
  }

  private playStep(step: number, t: number, bus: GainNode) {
    const ctx = this.ctx!;
    const bar = Math.floor(step / 8) % CHORDS.length;
    const chord = CHORDS[bar];
    const beat = step % 8;

    // Pad: the chord, held for the bar, soft attack.
    if (beat === 0) {
      const len = EIGHTH * 8;
      for (const n of chord.slice(1)) {
        for (const [type, detune] of [["sine", -6], ["triangle", 6]] as const) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = hz(n + 12);
          o.detune.value = detune;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.05, t + 0.35);
          g.gain.setValueAtTime(0.05, t + len - 0.3);
          g.gain.linearRampToValueAtTime(0.0001, t + len + 0.2);
          o.connect(g).connect(bus);
          o.start(t);
          o.stop(t + len + 0.25);
        }
      }
    }

    // Bass: root on beats 1 and 3, a passing fifth before the next bar.
    if (beat === 0 || beat === 4 || beat === 7) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hz(beat === 7 ? chord[0] + 7 : chord[0]);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + EIGHTH * (beat === 7 ? 0.9 : 3));
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + EIGHTH * 3 + 0.05);
    }

    // Pluck arpeggio (from bar 2, so the intro breathes).
    if (step >= 8) {
      const n = chord[ARP[beat]] + 24;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz(n);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.4);
    }

    // Shaker on the off-beats (from bar 3).
    if (step >= 16 && beat % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      src.connect(hp).connect(g).connect(bus);
      src.start(t, Math.random() * 0.5, 0.08);
    }

    // Soft kick on beats 1 and 3 (from bar 3).
    if (step >= 16 && (beat === 0 || beat === 4)) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.45, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.2);
    }
  }
}
