/* BeatTrack — tiny WebAudio score for the edit: a soft kick on every cut and a
 * warm pad chord per bar, so the hard cuts land on the beat. Off by default. */
(function (global) {
  'use strict';
  const CHORDS = [[57, 61, 64, 68], [54, 57, 61, 64], [50, 54, 57, 61], [52, 56, 59, 64]]; // A maj7, F#m7, D maj7, E
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  class BeatTrack {
    constructor(bpm) { this.beat = 60 / bpm; this.enabled = false; this.last = -1; }
    _ctx() {
      if (!this.ac) {
        this.ac = new (global.AudioContext || global.webkitAudioContext)();
        this.out = this.ac.createGain(); this.out.gain.value = 0.5; this.out.connect(this.ac.destination);
      }
      if (this.ac.state === 'suspended') this.ac.resume();
      return this.ac;
    }
    kick(at) {
      const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.18);
      g.gain.setValueAtTime(0.9, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
      o.connect(g).connect(this.out); o.start(at); o.stop(at + 0.4);
    }
    pad(at, notes, len) {
      const ac = this.ac, g = ac.createGain(), f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.08, at + 0.3); g.gain.linearRampToValueAtTime(0.0001, at + len);
      notes.forEach(m => { [-6, 6].forEach(d => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = d; o.connect(f); o.start(at); o.stop(at + len + 0.05); }); });
      f.connect(g).connect(this.out);
    }
    sync(t) {
      if (!this.enabled) return;
      const ac = this._ctx(), i = Math.floor(t / this.beat);
      if (i === this.last) return;
      this.last = i;
      const now = ac.currentTime + 0.02;
      this.kick(now);
      if (i % 4 === 0) this.pad(now, CHORDS[(i / 4) % CHORDS.length], this.beat * 4);
    }
    stop() { this.last = -1; if (this.ac) this.ac.suspend(); }
  }
  global.BeatTrack = BeatTrack;
})(typeof window !== 'undefined' ? window : globalThis);
