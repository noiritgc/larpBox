import { AVATAR_IDS, type AvatarId } from '@larpbox/shared';

/**
 * Fictional profile headlines, drawn at random for each player (no two alike in a room) and drawn
 * again when the host starts a new game. They appear in the lobby and on revealed posts only:
 * showing them on anonymous posts would identify the author.
 */
export const HEADLINES = [
  'Thought Leader \u00b7 Between Opportunities',
  'Founder \u00b7 Details Coming Soon',
  'Strategic Coffee Professional',
  'Open to Being Impressed',
  'Head of Personal Branding',
  'Synergy Consultant \u00b7 Self-Appointed',
  'Building in Public \u00b7 Mostly Posting',
  'Chief Meeting Attendee',
  'VP of Reply All',
  'Aspiring Early Riser',
  'Visionary \u00b7 Vision Pending',
  'Growth Hacker \u00b7 Houseplants',
  'Certified Group Chat Moderator',
  'Keynote Speaker at Family Dinners',
  'Snack Logistics Lead',
  'Professional Overthinker',
  'Stealth Mode \u00b7 Very Stealthy',
  'Former Intern \u00b7 Current Legend',
  'Passionate About Passion',
  'Chief Vibes Officer',
  'Hustling (Gently)',
  'Inbox Zero Survivor',
  'Freelance Opinion Haver',
  'Doing Big Things \u00b7 Soon',
  'Humbled and Honored \u00b7 Often',
  'Top 1% of Something',
  'Ninja \u00b7 Rockstar \u00b7 Guru',
  'Lifelong Learner \u00b7 Short Attention Span',
  'Laundry Operations Specialist',
  'Calendar Tetris Champion',
  'Networking Event Survivor',
  'Serial Napper \u00b7 Rest Advocate',
] as const;

/** A headline no one in `taken` has, chosen with `randomInt(n)` (0 <= result < n). */
export function pickHeadline(taken: ReadonlySet<string>, randomInt: (maxExclusive: number) => number): string {
  const free = HEADLINES.filter((headline) => !taken.has(headline));
  const pool = free.length > 0 ? free : HEADLINES;
  return pool[randomInt(pool.length)] ?? HEADLINES[0];
}

/** The avatar a seat suggests by default; players may still pick any avatar. */
export function defaultAvatarForSeat(seat: number): AvatarId {
  return AVATAR_IDS[seat % AVATAR_IDS.length] ?? 'briefcase';
}
