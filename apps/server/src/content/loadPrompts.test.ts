import { describe, expect, it } from 'vitest';
import rawPack from './larpbox-prompts.json' with { type: 'json' };
import { loadPromptPack, promptsForPack, PromptPackError, validatePromptPack } from './loadPrompts.js';

function clonePack(): { schemaVersion: number; packId: string; prompts: Record<string, unknown>[] } {
  return structuredClone(rawPack) as never;
}

describe('prompt pack', () => {
  it('loads the supplied pack from its wrapper object', () => {
    const pack = loadPromptPack();
    expect(pack.packId).toBe('larpbox-core-v1');
    expect(pack.prompts).toHaveLength(32);
  });

  it('has at least 16 prompts per category, enough for an 8-player two-round game', () => {
    const pack = loadPromptPack();
    expect(promptsForPack(pack, 'everyday').length).toBeGreaterThanOrEqual(16);
    expect(promptsForPack(pack, 'campus-work').length).toBeGreaterThanOrEqual(16);
    expect(promptsForPack(pack, 'mixed')).toHaveLength(32);
  });

  it('rejects a bare array instead of the wrapper', () => {
    expect(() => validatePromptPack(rawPack.prompts)).toThrow(PromptPackError);
  });

  it('rejects a wrong schema version', () => {
    const pack = clonePack();
    pack.schemaVersion = 2;
    expect(() => validatePromptPack(pack)).toThrow(PromptPackError);
  });

  it('rejects duplicate ids and duplicate normalized truths', () => {
    const dupId = clonePack();
    (dupId.prompts[1] as { id: string }).id = (dupId.prompts[0] as { id: string }).id;
    expect(() => validatePromptPack(dupId)).toThrow(/duplicate id/);

    const dupTruth = clonePack();
    const first = dupTruth.prompts[0] as { truth: string };
    (dupTruth.prompts[1] as { truth: string }).truth = `  ${first.truth.toUpperCase()} `;
    expect(() => validatePromptPack(dupTruth)).toThrow(/truth duplicates/);
  });

  it('rejects distractors that repeat each other or the truth', () => {
    const repeated = clonePack();
    const prompt = repeated.prompts[0] as { distractors: string[]; truth: string };
    prompt.distractors[1] = prompt.distractors[0] as string;
    expect(() => validatePromptPack(repeated)).toThrow(/distractors must be unique/);

    const truthy = clonePack();
    const other = truthy.prompts[0] as { distractors: string[]; truth: string };
    other.distractors[2] = other.truth;
    expect(() => validatePromptPack(truthy)).toThrow(/repeats the truth/);
  });

  it('enforces fact/boundary counts and text lengths', () => {
    const fewFacts = clonePack();
    (fewFacts.prompts[0] as { facts: string[] }).facts = ['Only one fact.'];
    expect(() => validatePromptPack(fewFacts)).toThrow(PromptPackError);

    const longTruth = clonePack();
    (longTruth.prompts[0] as { truth: string }).truth = 'x'.repeat(101);
    expect(() => validatePromptPack(longTruth)).toThrow(/exceeds 100/);

    const longFact = clonePack();
    (longFact.prompts[0] as { facts: string[] }).facts[0] = 'y'.repeat(141);
    expect(() => validatePromptPack(longFact)).toThrow(/exceeds 140/);
  });

  it('rejects unknown fields and categories', () => {
    const extra = clonePack();
    (extra.prompts[0] as Record<string, unknown>).answer = 'leak';
    expect(() => validatePromptPack(extra)).toThrow(PromptPackError);

    const category = clonePack();
    (category.prompts[0] as { category: string }).category = 'office';
    expect(() => validatePromptPack(category)).toThrow(PromptPackError);
  });
});
