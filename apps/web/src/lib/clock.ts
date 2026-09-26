/**
 * Server clock offset estimated from ping midpoints. The lowest-RTT sample among recent ones
 * wins. Before any ping, a snapshot's serverNow gives a rough estimate. Client time never decides
 * anything authoritative; it only drives the countdown display.
 */
interface Sample {
  offsetMs: number;
  rttMs: number;
  at: number;
}

const MAX_SAMPLES = 6;

export class ServerClock {
  private samples: Sample[] = [];
  private roughOffsetMs: number | null = null;

  /** Rough estimate from a snapshot (ignores one-way latency). */
  observeSnapshot(serverNow: number, receivedAt = Date.now()): void {
    if (this.samples.length === 0) this.roughOffsetMs = serverNow - receivedAt;
  }

  observePing(sentAt: number, serverNow: number, receivedAt = Date.now()): void {
    const rttMs = Math.max(0, receivedAt - sentAt);
    this.samples.push({ offsetMs: serverNow - (sentAt + receivedAt) / 2, rttMs, at: receivedAt });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  get offsetMs(): number {
    if (this.samples.length === 0) return this.roughOffsetMs ?? 0;
    let best = this.samples[0] as Sample;
    for (const sample of this.samples) if (sample.rttMs < best.rttMs) best = sample;
    return best.offsetMs;
  }

  now(): number {
    return Date.now() + this.offsetMs;
  }

  reset(): void {
    this.samples = [];
    this.roughOffsetMs = null;
  }
}

export const serverClock = new ServerClock();
