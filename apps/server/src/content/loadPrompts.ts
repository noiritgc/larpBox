import { countGraphemes, type PackId } from '@larpbox/shared';
import { z } from 'zod';
import rawPack from './larpbox-prompts.json' with { type: 'json' };

/** Server-only content. Never import this module from web or shared code. */

export const PROMPT_CATEGORIES = ['everyday', 'campus-work'] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

const PromptDefinitionSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'IDs are lowercase kebab-case.').max(80),
  category: z.enum(PROMPT_CATEGORIES),
  truth: z.string().min(1),
  facts: z.array(z.string().min(1)).min(2).max(3),
  boundaries: z.array(z.string().min(1)).min(1).max(2),
  distractors: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
});
export type PromptDefinition = z.infer<typeof PromptDefinitionSchema>;

const PromptPackSchema = z.strictObject({
  schemaVersion: z.literal(1),
  packId: z.string().min(1),
  prompts: z.array(PromptDefinitionSchema).min(1),
});

export interface PromptPack {
  schemaVersion: 1;
  packId: string;
  prompts: readonly PromptDefinition[];
}

export class PromptPackError extends Error {
  override name = 'PromptPackError';
  constructor(readonly problems: string[]) {
    super(`Prompt pack is invalid:\n- ${problems.join('\n- ')}`);
  }
}

const TRUTH_MAX_GRAPHEMES = 100;
const FACT_MAX_GRAPHEMES = 140;

function comparable(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Validates the wrapper object and every entry; throws PromptPackError listing all problems. */
export function validatePromptPack(raw: unknown): PromptPack {
  const parsed = PromptPackSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PromptPackError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`),
    );
  }
  const pack = parsed.data;
  const problems: string[] = [];
  const ids = new Set<string>();
  const truths = new Map<string, string>();

  for (const prompt of pack.prompts) {
    const where = `prompt "${prompt.id}"`;
    if (ids.has(prompt.id)) problems.push(`${where}: duplicate id`);
    ids.add(prompt.id);

    const truthKey = comparable(prompt.truth);
    const other = truths.get(truthKey);
    if (other) problems.push(`${where}: truth duplicates prompt "${other}"`);
    truths.set(truthKey, prompt.id);

    const distractorKeys = prompt.distractors.map(comparable);
    if (new Set(distractorKeys).size !== distractorKeys.length) {
      problems.push(`${where}: distractors must be unique`);
    }
    if (distractorKeys.includes(truthKey)) problems.push(`${where}: a distractor repeats the truth`);

    for (const text of [prompt.truth, ...prompt.distractors]) {
      if (countGraphemes(text) > TRUTH_MAX_GRAPHEMES) {
        problems.push(`${where}: "${text}" exceeds ${TRUTH_MAX_GRAPHEMES} characters`);
      }
    }
    for (const text of [...prompt.facts, ...prompt.boundaries]) {
      if (countGraphemes(text) > FACT_MAX_GRAPHEMES) {
        problems.push(`${where}: "${text}" exceeds ${FACT_MAX_GRAPHEMES} characters`);
      }
    }
  }
  if (problems.length > 0) throw new PromptPackError(problems);
  return { schemaVersion: 1, packId: pack.packId, prompts: pack.prompts };
}

/** Loads and validates the bundled pack. Called once at boot, before the server listens. */
export function loadPromptPack(): PromptPack {
  return validatePromptPack(rawPack);
}

export function promptsForPack(pack: PromptPack, packId: PackId): PromptDefinition[] {
  if (packId === 'mixed') return [...pack.prompts];
  return pack.prompts.filter((prompt) => prompt.category === packId);
}
