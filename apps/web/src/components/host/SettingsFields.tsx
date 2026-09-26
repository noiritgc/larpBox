import { PACK_LABELS, PACKS, ROUND_COUNT_LABELS, type RoomSettings } from '@larpbox/shared';
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
      <Group title="Writing time per round" hint="Everyone writes two posts in this time.">
        <ChoiceGroup
          label="Writing time per round"
          layout="segmented"
          disabled={disabled}
          value={value.writingSeconds}
          onChange={(writingSeconds) => onChange({ ...value, writingSeconds })}
          choices={([90, 120, 180] as const).map((seconds) => ({ value: seconds, label: `${seconds}s` }))}
        />
      </Group>
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
