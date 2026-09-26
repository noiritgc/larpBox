import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@larpbox/shared';
import type { Clock } from './clock.js';
import type { RoomEntry } from './types.js';

export const TOMBSTONE_MS = 10 * 60 * 1000;
const CODE_ATTEMPTS = 200;

export function randomRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Process-local registry of live rooms. Closed rooms leave only their code behind as a ten-minute
 * tombstone so the code is not immediately reused for a different room.
 */
export class RoomStore {
  private readonly rooms = new Map<string, RoomEntry>();
  private readonly roomIdByCode = new Map<string, string>();
  private readonly tombstones = new Map<string, number>();

  constructor(
    private readonly clock: Clock,
    private readonly randomCode: () => string = randomRoomCode,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  get(roomId: string): RoomEntry | undefined {
    return this.rooms.get(roomId);
  }

  getByCode(code: string): RoomEntry | undefined {
    const roomId = this.roomIdByCode.get(code);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  isTombstoned(code: string): boolean {
    const expiresAt = this.tombstones.get(code);
    return expiresAt !== undefined && expiresAt > this.clock.nowMonotonicMs();
  }

  entries(): RoomEntry[] {
    return [...this.rooms.values()];
  }

  /** Cryptographically random code, retried against live rooms and tombstones; null if exhausted. */
  generateCode(): string | null {
    this.purgeTombstones();
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = this.randomCode();
      if (!this.roomIdByCode.has(code) && !this.tombstones.has(code)) return code;
    }
    return null;
  }

  add(entry: RoomEntry): void {
    if (this.roomIdByCode.has(entry.room.code)) throw new Error(`Room code ${entry.room.code} is in use`);
    this.rooms.set(entry.room.id, entry);
    this.roomIdByCode.set(entry.room.code, entry.room.id);
  }

  remove(roomId: string): RoomEntry | undefined {
    const entry = this.rooms.get(roomId);
    if (!entry) return undefined;
    this.rooms.delete(roomId);
    this.roomIdByCode.delete(entry.room.code);
    this.tombstones.set(entry.room.code, this.clock.nowMonotonicMs() + TOMBSTONE_MS);
    return entry;
  }

  purgeTombstones(): void {
    const now = this.clock.nowMonotonicMs();
    for (const [code, expiresAt] of this.tombstones) {
      if (expiresAt <= now) this.tombstones.delete(code);
    }
  }
}
