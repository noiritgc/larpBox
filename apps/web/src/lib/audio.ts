import { STORAGE_KEYS } from '@larpbox/shared';
import { readPrefs, writePrefs } from './prefs';
import { readItem, writeItem } from './storage';

/**
 * Host-only Web Audio synthesis: no recordings, no speech. The AudioContext is created or resumed
 * from a host click. Blocked audio never blocks gameplay. Phones stay silent.
 */
export type Cue = 'join' | 'phase' | 'truth' | 'results' | 'final';

const MASTER_GAIN = 0.12;

interface Note {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

const CUES: Record<Cue, Note[]> = {
  // Two ascending notes.
  join: [
    { freq: 659.25, start: 0, duration: 0.14, type: 'triangle' },
    { freq: 880, start: 0.12, duration: 0.2, type: 'triangle' },
  ],
  // A short pluck.
  phase: [{ freq: 523.25, start: 0, duration: 0.28, type: 'triangle' }],
  // A short resolve: dominant to tonic.
  truth: [
    { freq: 587.33, start: 0, duration: 0.16, type: 'sine' },
    { freq: 783.99, start: 0.14, duration: 0.34, type: 'sine' },
  ],
  // A bright major chord.
  results: [
    { freq: 523.25, start: 0, duration: 0.9, type: 'triangle', gain: 0.7 },
    { freq: 659.25, start: 0.02, duration: 0.88, type: 'triangle', gain: 0.6 },
    { freq: 783.99, start: 0.04, duration: 0.86, type: 'triangle', gain: 0.55 },
  ],
  // An original short fanfare, under three seconds.
  final: [
    { freq: 523.25, start: 0, duration: 0.18, type: 'square', gain: 0.35 },
    { freq: 659.25, start: 0.18, duration: 0.18, type: 'square', gain: 0.35 },
    { freq: 783.99, start: 0.36, duration: 0.18, type: 'square', gain: 0.35 },
    { freq: 1046.5, start: 0.54, duration: 0.5, type: 'square', gain: 0.35 },
    { freq: 783.99, start: 1.1, duration: 0.14, type: 'triangle', gain: 0.6 },
    { freq: 1046.5, start: 1.26, duration: 1.1, type: 'triangle', gain: 0.6 },
    { freq: 1318.5, start: 1.26, duration: 1.1, type: 'triangle', gain: 0.45 },
    { freq: 1568, start: 1.26, duration: 1.1, type: 'triangle', gain: 0.35 },
  ],
};

class HostAudio {
  private context: AudioContext | null = null;
  enabled = readPrefs().sound;

  /** Call from a click handler (the audio-unlock gesture). */
  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.context = new Ctor();
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch {
      this.context = null;
    }
  }

  get unlocked(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    writePrefs({ sound: enabled });
    if (enabled) this.unlock();
  }

  play(cue: Cue): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    try {
      const ctx = this.context;
      const master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
      const now = ctx.currentTime + 0.02;
      for (const note of CUES[cue]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = note.type ?? 'sine';
        osc.frequency.value = note.freq;
        const start = now + note.start;
        const end = start + note.duration;
        const peak = note.gain ?? 1;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(end + 0.05);
      }
    } catch {
      // Audio is decoration only.
    }
  }

  /** Plays once per phase entry: a reconnect or refresh never replays the cue. */
  playForPhase(phaseId: string, cue: Cue): void {
    if (readItem('session', STORAGE_KEYS.lastPlayedPhaseId) === phaseId) return;
    writeItem('session', STORAGE_KEYS.lastPlayedPhaseId, phaseId);
    this.play(cue);
  }
}

export const hostAudio = new HostAudio();
