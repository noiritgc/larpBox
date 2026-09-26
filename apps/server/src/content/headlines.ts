import { AVATAR_IDS, type AvatarId } from '@larpbox/shared';

/**
 * Fictional headlines assigned by seat index (0–7). They appear in the lobby and on revealed
 * posts only: showing them on anonymous posts would identify the author.
 */
export const SEAT_HEADLINES = [
  'Thought Leader · Between Opportunities',
  'Founder · Details Coming Soon',
  'Strategic Coffee Professional',
  'Open to Being Impressed',
  'Head of Personal Branding',
  'Synergy Consultant · Self-Appointed',
  'Building in Public · Mostly Posting',
  'Chief Meeting Attendee',
] as const;

export function headlineForSeat(seat: number): string {
  const headline = SEAT_HEADLINES[seat];
  if (headline === undefined) throw new RangeError(`No headline for seat ${seat}`);
  return headline;
}

/** The avatar a seat suggests by default; players may still pick any avatar. */
export function defaultAvatarForSeat(seat: number): AvatarId {
  return AVATAR_IDS[seat % AVATAR_IDS.length] ?? 'briefcase';
}
