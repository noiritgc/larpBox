import { describe, expect, it } from 'vitest';
import {
  checkName,
  checkPost,
  countGraphemes,
  nameKey,
  normalizePostText,
  normalizeRoomCode,
  isRoomCode,
  takeGraphemes,
  utf8ByteLength,
} from './text.js';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const FAMILY = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466); // one grapheme
const FLAG = cp(0x1f1fa, 0x1f1f8); // regional indicator pair, one grapheme
const E_ACUTE_COMBINING = `e${cp(0x0301)}`; // NFC composes to U+00E9

describe('countGraphemes', () => {
  it('counts extended grapheme clusters, not UTF-16 units', () => {
    expect(countGraphemes('abc')).toBe(3);
    expect(FAMILY.length).toBe(11);
    expect(countGraphemes(FAMILY)).toBe(1);
    expect(countGraphemes(FLAG)).toBe(1);
    expect(countGraphemes(E_ACUTE_COMBINING)).toBe(1);
    expect(countGraphemes('\r\n')).toBe(1);
  });

  it('takes a grapheme-safe prefix', () => {
    expect(takeGraphemes(`${FAMILY}${FAMILY}x`, 2)).toBe(`${FAMILY}${FAMILY}`);
  });
});

describe('utf8ByteLength', () => {
  it('matches TextEncoder, including astral characters and lone surrogates', () => {
    const encoder = new TextEncoder();
    for (const sample of ['', 'abc', 'caf\u00e9', FAMILY, FLAG, '\u20ac', '\ud800', 'a\udc00b']) {
      expect(utf8ByteLength(sample)).toBe(encoder.encode(sample).length);
    }
  });
});

describe('normalizePostText', () => {
  it('normalizes to NFC and LF, trims ends, keeps interior spaces', () => {
    expect(normalizePostText(`  Proud  to\r\nannounce ${E_ACUTE_COMBINING}  `)).toBe('Proud  to\nannounce \u00e9');
  });

  it('collapses runs of three or more newlines into one blank line', () => {
    expect(normalizePostText('a\n\n\n\nb')).toBe('a\n\nb');
    expect(normalizePostText('a\r\n\r\n\r\nb')).toBe('a\n\nb');
    expect(normalizePostText('a\n   \n  \n\nb')).toBe('a\n\nb');
  });

  it('removes zero-width and control characters but keeps emoji joiners', () => {
    expect(normalizePostText('hi\u200bthere\u0007!')).toBe('hithere!');
    expect(normalizePostText(FAMILY)).toBe(FAMILY);
    expect(normalizePostText('a\tb')).toBe('a b');
  });
});

describe('checkPost', () => {
  const twenty = 'x'.repeat(20);

  it('accepts the 20 and 280 grapheme boundaries', () => {
    expect(checkPost(twenty).okForLock).toBe(true);
    expect(checkPost('x'.repeat(19)).okForLock).toBe(false);
    expect(checkPost('x'.repeat(19)).okForDraft).toBe(true);
    expect(checkPost('x'.repeat(280)).okForLock).toBe(true);
    expect(checkPost('x'.repeat(281)).issues).toContain('TOO_LONG');
  });

  it('counts emoji as single characters toward the limits', () => {
    const grin = cp(0x1f600);
    const post = grin.repeat(280);
    expect(post.length).toBe(560);
    const result = checkPost(post);
    expect(result.graphemes).toBe(280);
    expect(result.okForLock).toBe(true);
    expect(checkPost(grin.repeat(281)).okForLock).toBe(false);
    // A ZWJ family is 11 UTF-16 units and 25 UTF-8 bytes but one character.
    expect(checkPost(FAMILY.repeat(100)).graphemes).toBe(100);
  });

  it('counts combining accents after NFC composition', () => {
    expect(checkPost(E_ACUTE_COMBINING.repeat(20)).graphemes).toBe(20);
  });

  it('measures length after trimming', () => {
    expect(checkPost(`   ${'x'.repeat(19)}   `).okForLock).toBe(false);
  });

  it('allows up to four newlines and four non-empty lines', () => {
    expect(checkPost('line one\nline two\nline three\nline four').okForLock).toBe(true);
    expect(checkPost('line one\nline two\nline three\nline four\nfive').issues).toContain('TOO_MANY_LINES');
    // Blank lines count toward the newline cap: 3 blank-separated lines use 4 newlines.
    expect(checkPost('line one here\n\nline two here\n\nline three').okForLock).toBe(true);
    expect(checkPost('one\n\ntwo\n\nthree\n\nfour plus text').issues).toContain('TOO_MANY_LINES');
  });

  it('accepts a long unbroken string within the limit', () => {
    expect(checkPost('a'.repeat(280)).okForLock).toBe(true);
  });

  it('rejects directional override controls explicitly', () => {
    const result = checkPost(`Proud to announce ${cp(0x202e)}reversed text here`);
    expect(result.issues).toContain('BIDI_CONTROL');
    expect(result.okForDraft).toBe(false);
    expect(checkPost(`Isolate ${cp(0x2067)}sneaky${cp(0x2069)} text for tests`).okForDraft).toBe(false);
  });

  it('rejects raw payloads over 4096 UTF-8 bytes before counting', () => {
    const result = checkPost(FAMILY.repeat(200));
    expect(utf8ByteLength(FAMILY.repeat(200))).toBeGreaterThan(4096);
    expect(result.issues).toEqual(['TOO_MANY_BYTES']);
  });

  it('keeps HTML-looking text as plain text', () => {
    const html = '<img src=x onerror=alert(1)> proud to announce';
    expect(checkPost(html).text).toBe(html);
  });
});

describe('checkName', () => {
  it('enforces 2 to 16 graphemes after trimming and collapsing whitespace', () => {
    expect(checkName('A').ok).toBe(false);
    expect(checkName('Al').ok).toBe(true);
    expect(checkName('  Jo   Bob  ').name).toBe('Jo Bob');
    expect(checkName('x'.repeat(16)).ok).toBe(true);
    expect(checkName('x'.repeat(17)).ok).toBe(false);
    expect(checkName(`${FAMILY}${FAMILY}`).ok).toBe(true);
  });

  it('rejects line breaks, control characters and bidi controls', () => {
    expect(checkName('Al\nex').issues).toContain('INVALID_CHARACTERS');
    expect(checkName('Al\tex').issues).toContain('INVALID_CHARACTERS');
    expect(checkName(`Al${cp(0x202e)}ex`).issues).toContain('INVALID_CHARACTERS');
  });

  it('builds a case-insensitive, NFC key', () => {
    expect(nameKey('ALEX')).toBe(nameKey('alex'));
    expect(nameKey(`Ren${E_ACUTE_COMBINING}e`)).toBe(nameKey('REN\u00c9E'));
    expect(nameKey(' Jo  Bob ')).toBe('jo bob');
  });

  it('strips invisible filler characters', () => {
    expect(checkName('\u200b\u200b').ok).toBe(false);
    expect(checkName('Al\u200bex').name).toBe('Alex');
  });
});

describe('room codes', () => {
  it('normalizes case and whitespace and excludes I and O', () => {
    expect(normalizeRoomCode(' kprt ')).toBe('KPRT');
    expect(isRoomCode('KPRT')).toBe(true);
    expect(isRoomCode('KPRI')).toBe(false);
    expect(isRoomCode('KPRO')).toBe(false);
    expect(isRoomCode('KPR')).toBe(false);
  });
});
