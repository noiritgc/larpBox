/**
 * Baked-in tutorial content. The charger example is deliberately not a playable prompt, so no
 * example answer is ever visible for a real assignment.
 */
export const TUTORIAL_STEPS = [
  {
    title: 'Inflate it.',
    body: 'You privately get two ordinary things you did. Write each one up as a career milestone: exaggerate the language, not the facts.',
  },
  {
    title: 'Decode it.',
    body: 'Everyone else reads two anonymous posts about the same event and guesses what actually happened.',
  },
  {
    title: 'Endorse it.',
    body: 'Then the truth comes out. Endorse the funniest post that stayed technically true.',
  },
] as const;

export const TUTORIAL_EXAMPLE = {
  fact: 'You plugged in your phone charger.',
  post: "Proud to announce I've successfully restored power to a mission-critical device. Stay charged, team.",
} as const;

export const TUTORIAL_RULE = 'Impressive wording. No invented achievements.';

export const SCORING_SUMMARY = [
  'Writers split up to 1,000 Clout per post-off by their share of endorsements. "Neither" counts as a ballot.',
  'Readers earn 250 Clout for picking what actually happened.',
  'Round 2 doubles everything.',
] as const;
