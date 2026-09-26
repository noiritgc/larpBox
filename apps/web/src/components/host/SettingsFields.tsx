import { PACK_LABELS, PACKS, POSTS_PER_PLAYER_LABELS, ROUND_COUNT_LABELS, writingSecondsFor, type RoomSettings } from '@larpbox/shared';
import { ChoiceGroup } from '../ui/ChoiceGroup';

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <div>
        <p className="font-bold">{title}</p>
        {hint ? <p className="text-[15px] muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** The server-side room settings (section 1.7). Local sound/motion preferences live elsewhere. */
export function SettingsFields({
  value,
  onChange,
  disabled = false,
}: {
  value: RoomSettings;
  onChange: (next: RoomSettings) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-5">
      <Group title="Game length">
        <ChoiceGroup
          label="Game length"
          layout="segmented"
          disabled={disabled}
          value={value.roundCount}
          onChange={(roundCount) => onChange({ ...value, roundCount })}
          choices={([2, 1] as const).map((count) => ({ value: count, label: ROUND_COUNT_LABELS[count] }))}
        />
      </Group>
      <div className="grid gap-5 sm:grid-cols-2">
        <Group
          title="Posts per player"
          hint={value.postsPerPlayer === 1 ? 'Players pair up. With an odd number, one person judges instead.' : 'More post-offs per round.'}
        >
          <ChoiceGroup
            label="Posts per player"
            layout="segmented"
            disabled={disabled}
            value={value.postsPerPlayer}
            onChange={(postsPerPlayer) => onChange({ ...value, postsPerPlayer })}
            choices={([1, 2] as const).map((count) => ({ value: count, label: POSTS_PER_PLAYER_LABELS[count] }))}
          />
        </Group>
        <Group title="Writing time per post" hint={`Writing lasts ${writingSecondsFor(value)} seconds each round.`}>
          <ChoiceGroup
            label="Writing time per post"
            layout="segmented"
            disabled={disabled}
            value={value.secondsPerPost}
            onChange={(secondsPerPost) => onChange({ ...value, secondsPerPost })}
            choices={([45, 60, 90] as const).map((seconds) => ({ value: seconds, label: `${seconds}s` }))}
          />
        </Group>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Group title="Fact-guess time">
          <ChoiceGroup
            label="Fact-guess time"
            layout="segmented"
            disabled={disabled}
            value={value.guessSeconds}
            onChange={(guessSeconds) => onChange({ ...value, guessSeconds })}
            choices={([20, 30] as const).map((seconds) => ({ value: seconds, label: `${seconds}s` }))}
          />
        </Group>
        <Group title="Endorse time">
          <ChoiceGroup
            label="Endorse time"
            layout="segmented"
            disabled={disabled}
            value={value.endorseSeconds}
            onChange={(endorseSeconds) => onChange({ ...value, endorseSeconds })}
            choices={([20, 30] as const).map((seconds) => ({ value: seconds, label: `${seconds}s` }))}
          />
        </Group>
      </div>
      <Group title="Prompt pack">
        <ChoiceGroup
          label="Prompt pack"
          layout="segmented"
          disabled={disabled}
          value={value.pack}
          onChange={(pack) => onChange({ ...value, pack })}
          choices={PACKS.map((pack) => ({ value: pack, label: PACK_LABELS[pack] }))}
        />
      </Group>
    </div>
  );
}
