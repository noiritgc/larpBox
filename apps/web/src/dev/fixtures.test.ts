import { countGraphemes, checkPost } from '@larpbox/shared';
import { describe, expect, it } from 'vitest';
import { hostView, LONG_POST, LONG_POST_B, playerView, posts, result, reveal, UNBROKEN_POST } from './fixtures';

describe('dev fixtures', () => {
  it('use worst-case posts that are still valid (280 graphemes, at most four lines)', () => {
    for (const post of [LONG_POST, LONG_POST_B]) {
      expect(countGraphemes(post)).toBe(280);
      expect(checkPost(post).okForLock).toBe(true);
    }
    expect(checkPost(UNBROKEN_POST).okForLock).toBe(true);
  });

  it('build views that satisfy the strict protocol schemas', () => {
    expect(() => hostView({ kind: 'DUEL_READ', duelId: '00000000-0000-4000-8000-000000000300', posts: posts.long })).not.toThrow();
    expect(() =>
      hostView({ kind: 'DUEL_RESULT', duelId: '00000000-0000-4000-8000-000000000300', result: result({ stamp: 'UNFILLED', votesA: 0, votesB: 0, neither: 0, pointsA: 0, pointsB: 0, correct: [] }) }),
    ).not.toThrow();
    expect(() => playerView({ kind: 'LOBBY', readyCount: 0, settingsChanged: false })).not.toThrow();
    // A stray secret field is rejected, exactly as for real projections.
    expect(() => hostView({ kind: 'DUEL_READ', duelId: '00000000-0000-4000-8000-000000000300', posts: posts.long, truth: reveal.truth } as never)).toThrow();
  });
});
