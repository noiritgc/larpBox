import {
  NAME_MAX_GRAPHEMES,
  NAME_MIN_GRAPHEMES,
  POST_MAX_GRAPHEMES,
  POST_MAX_LINES,
  POST_MAX_NEWLINES,
  POST_MIN_GRAPHEMES,
  ROOM_CODE_PATTERN,
  TEXT_MAX_BYTES,
} from './constants.js';

/**
 * Text rules shared by phones and the server. The same input must pass or fail identically on
 * both sides, so every limit here counts extended grapheme clusters via Intl.Segmenter, never
 * UTF-16 `.length`. Browsers without Intl.Segmenter load a polyfill before the app starts.
 */

/** Directional embedding/override/isolate controls: always rejected, never silently stripped. */
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/u;

/**
 * Invisible format characters that are removed silently: soft hyphen, Arabic letter mark,
 * Hangul fillers, Mongolian vowel separator, zero-width space, LRM/RLM marks, word joiner and
 * invisible operators, deprecated format controls, and the BOM. ZWNJ (U+200C) and ZWJ (U+200D)
 * are kept because emoji sequences and several scripts depend on them.
 */
const STRIPPED_INVISIBLES =
  /[\u00AD\u061C\u115F\u1160\u180E\u200B\u200E\u200F\u2060-\u2064\u206A-\u206F\u3164\uFEFF\uFFA0]/gu;

/** C0/C1 controls other than tab, line feed and carriage return. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const STRIPPED_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;

/** Any control character, line break or line/paragraph separator (invalid anywhere in a name). */
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const NAME_FORBIDDEN_CONTROLS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u;

let segmenter: Intl.Segmenter | null = null;

function getSegmenter(): Intl.Segmenter {
  if (segmenter) return segmenter;
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    throw new Error('Intl.Segmenter is unavailable. Load the segmenter polyfill before counting text.');
  }
  segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  return segmenter;
}

export function countGraphemes(text: string): number {
  let count = 0;
  for (const _segment of getSegmenter().segment(text)) count += 1;
  return count;
}

/** Returns at most `max` leading grapheme clusters of `text`. */
export function takeGraphemes(text: string, max: number): string {
  let out = '';
  let count = 0;
  for (const { segment } of getSegmenter().segment(text)) {
    if (count >= max) break;
    out += segment;
    count += 1;
  }
  return out;
}

/** UTF-8 byte length without TextEncoder, so the helper works on every platform identically. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < text.length &&
      (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00
    ) {
      bytes += 4;
      i += 1;
    } else bytes += 3; // BMP character, or a lone surrogate encoded as U+FFFD.
  }
  return bytes;
}

export function hasBidiControls(text: string): boolean {
  return BIDI_CONTROLS.test(text);
}

/**
 * Canonical post text: NFC, LF line endings, tabs as spaces, invisible/control characters removed,
 * trailing spaces trimmed from each line, runs of 3+ newlines collapsed to a blank line, and both
 * ends trimmed. Ordinary spaces inside prose are preserved.
 */
export function normalizePostText(raw: string): string {
  let text = raw.normalize('NFC');
  text = text.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n');
  text = text.replace(/\t/g, ' ');
  text = text.replace(STRIPPED_CONTROLS, '').replace(STRIPPED_INVISIBLES, '');
  text = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim().normalize('NFC');
}

export type PostIssue = 'TOO_MANY_BYTES' | 'BIDI_CONTROL' | 'TOO_LONG' | 'TOO_MANY_LINES' | 'TOO_SHORT';

export interface PostCheck {
  /** Normalized text; this is what the server stores. */
  text: string;
  graphemes: number;
  newlines: number;
  nonEmptyLines: number;
  issues: PostIssue[];
  /** Acceptable as an autosaved draft: every limit except the minimum length. */
  okForDraft: boolean;
  /** Acceptable as a locked post, including auto-submission at the deadline. */
  okForLock: boolean;
}

export function checkPost(raw: string): PostCheck {
  const issues: PostIssue[] = [];
  if (utf8ByteLength(raw) > TEXT_MAX_BYTES) {
    issues.push('TOO_MANY_BYTES');
    return { text: '', graphemes: 0, newlines: 0, nonEmptyLines: 0, issues, okForDraft: false, okForLock: false };
  }
  if (hasBidiControls(raw)) issues.push('BIDI_CONTROL');
  const text = normalizePostText(raw);
  const graphemes = countGraphemes(text);
  const newlines = text.length === 0 ? 0 : (text.match(/\n/g) ?? []).length;
  const nonEmptyLines = text.split('\n').filter((line) => line.trim().length > 0).length;
  if (graphemes > POST_MAX_GRAPHEMES) issues.push('TOO_LONG');
  if (newlines > POST_MAX_NEWLINES || nonEmptyLines > POST_MAX_LINES) issues.push('TOO_MANY_LINES');
  const okForDraft = issues.length === 0;
  if (graphemes < POST_MIN_GRAPHEMES) issues.push('TOO_SHORT');
  return { text, graphemes, newlines, nonEmptyLines, issues, okForDraft, okForLock: issues.length === 0 };
}

export const POST_ISSUE_MESSAGES: Record<PostIssue, string> = {
  TOO_MANY_BYTES: 'That post is too large to send.',
  BIDI_CONTROL: 'Remove the hidden text-direction characters from this post.',
  TOO_LONG: `Keep it to ${POST_MAX_GRAPHEMES} characters.`,
  TOO_MANY_LINES: `Use at most ${POST_MAX_LINES} lines.`,
  TOO_SHORT: `${POST_MIN_GRAPHEMES} characters minimum.`,
};

/** Display form of a name: NFC, invisible characters removed, whitespace runs collapsed, trimmed. */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(STRIPPED_INVISIBLES, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .normalize('NFC');
}

/** Case-insensitive uniqueness key for display names. */
export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

export type NameIssue = 'TOO_MANY_BYTES' | 'INVALID_CHARACTERS' | 'TOO_SHORT' | 'TOO_LONG';

export interface NameCheck {
  name: string;
  key: string;
  graphemes: number;
  issues: NameIssue[];
  ok: boolean;
}

export function checkName(raw: string): NameCheck {
  const issues: NameIssue[] = [];
  if (utf8ByteLength(raw) > TEXT_MAX_BYTES) {
    return { name: '', key: '', graphemes: 0, issues: ['TOO_MANY_BYTES'], ok: false };
  }
  const nfc = raw.normalize('NFC');
  if (NAME_FORBIDDEN_CONTROLS.test(nfc) || hasBidiControls(nfc)) issues.push('INVALID_CHARACTERS');
  const name = normalizeName(nfc);
  const graphemes = countGraphemes(name);
  if (graphemes < NAME_MIN_GRAPHEMES) issues.push('TOO_SHORT');
  if (graphemes > NAME_MAX_GRAPHEMES) issues.push('TOO_LONG');
  return { name, key: name.toLowerCase(), graphemes, issues, ok: issues.length === 0 };
}

export const NAME_ISSUE_MESSAGES: Record<NameIssue, string> = {
  TOO_MANY_BYTES: 'That name is too long.',
  INVALID_CHARACTERS: 'Use letters, numbers, spaces or emoji. No line breaks or hidden characters.',
  TOO_SHORT: `Use at least ${NAME_MIN_GRAPHEMES} characters.`,
  TOO_LONG: `Use at most ${NAME_MAX_GRAPHEMES} characters.`,
};

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isRoomCode(input: string): boolean {
  return ROOM_CODE_PATTERN.test(input);
}
