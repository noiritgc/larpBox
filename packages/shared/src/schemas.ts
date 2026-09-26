import { z } from 'zod';
import {
  AVATAR_IDS,
  ENDORSEMENTS,
  PACKS,
  PROTOCOL_VERSION,
  ROOM_CODE_PATTERN,
  TEXT_MAX_BYTES,
} from './constants.js';
import { utf8ByteLength } from './text.js';

/** Runtime validation for everything that crosses the network into the server. */

export const UuidSchema = z.uuid();

export const RoomCodeSchema = z.string().regex(ROOM_CODE_PATTERN, 'Room codes are four letters.');

export const AvatarIdSchema = z.enum(AVATAR_IDS);

export const RoomSettingsSchema = z.strictObject({
  roundCount: z.union([z.literal(1), z.literal(2)]),
  writingSeconds: z.union([z.literal(90), z.literal(120), z.literal(180)]),
  guessSeconds: z.union([z.literal(20), z.literal(30)]),
  endorseSeconds: z.union([z.literal(20), z.literal(30)]),
  pack: z.enum(PACKS),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  roundCount: 2,
  writingSeconds: 90,
  guessSeconds: 20,
  endorseSeconds: 20,
  pack: 'mixed',
};

/** Any user-authored text: bounded in raw UTF-8 bytes before normalization. */
const BoundedTextSchema = z
  .string()
  .refine((value) => utf8ByteLength(value) <= TEXT_MAX_BYTES, 'Text is too large.');

export const CreateRoomRequestSchema = z.strictObject({
  createRequestId: UuidSchema,
  settings: RoomSettingsSchema,
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const JoinRoomRequestSchema = z.strictObject({
  joinRequestId: UuidSchema,
  name: BoundedTextSchema,
  avatarId: AvatarIdSchema,
});
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;

export const SocketAuthSchema = z.strictObject({
  protocolVersion: z.number(),
  roomCode: RoomCodeSchema,
  role: z.enum(['host', 'player']),
  token: z.string().min(16).max(128),
  clientInstanceId: UuidSchema,
  takeover: z.boolean(),
});
export type SocketAuth = z.infer<typeof SocketAuthSchema>;
export type ClientRole = SocketAuth['role'];

export const SUPPORTED_PROTOCOL_VERSION = PROTOCOL_VERSION;

const EmptyPayload = z.strictObject({});

const DraftPayload = z.strictObject({
  assignmentId: UuidSchema,
  text: BoundedTextSchema,
  expectedDraftRevision: z.int().nonnegative(),
});

function command<const T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.strictObject({
    requestId: UuidSchema,
    phaseId: UuidSchema,
    gameId: UuidSchema.nullable(),
    type: z.literal(type),
    payload,
  });
}

export const CommandEnvelopeSchema = z.discriminatedUnion('type', [
  command('player.setReady', z.strictObject({ ready: z.boolean() })),
  command('player.leave', EmptyPayload),
  command('host.updateSettings', z.strictObject({ settings: RoomSettingsSchema })),
  command('host.removePlayer', z.strictObject({ playerId: UuidSchema })),
  command('host.startGame', EmptyPayload),
  command('host.skipRules', EmptyPayload),
  command('writing.saveDraft', DraftPayload),
  command('writing.lockPost', DraftPayload),
  command('duel.lockGuess', z.strictObject({ duelId: UuidSchema, optionId: UuidSchema })),
  command(
    'duel.lockEndorsement',
    z.strictObject({ duelId: UuidSchema, choice: z.enum(ENDORSEMENTS) }),
  ),
  command('host.pause', EmptyPayload),
  command('host.resume', EmptyPayload),
  command('host.extendWriting', z.strictObject({ seconds: z.literal(30) })),
  command('host.returnToLobby', EmptyPayload),
  command('host.closeRoom', EmptyPayload),
]);
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type CommandType = CommandEnvelope['type'];
export type CommandOf<T extends CommandType> = Extract<CommandEnvelope, { type: T }>;
export type CommandPayload<T extends CommandType> = CommandOf<T>['payload'];

export const HOST_COMMANDS = [
  'host.updateSettings',
  'host.removePlayer',
  'host.startGame',
  'host.skipRules',
  'host.pause',
  'host.resume',
  'host.extendWriting',
  'host.returnToLobby',
  'host.closeRoom',
] as const satisfies readonly CommandType[];

export const PLAYER_COMMANDS = [
  'player.setReady',
  'player.leave',
  'writing.saveDraft',
  'writing.lockPost',
  'duel.lockGuess',
  'duel.lockEndorsement',
] as const satisfies readonly CommandType[];

export const ClockPingSchema = z.strictObject({ clientSentAt: z.number() });

/** Flattens a Zod error into `{ path: message }` for form-level display. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
