import { Check } from 'lucide-react';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface Choice<V extends string | number> {
  value: V;
  label: ReactNode;
  /** Plain-text name for assistive tech when `label` is decorative. */
  ariaLabel?: string;
  disabled?: boolean;
  description?: ReactNode;
  index?: string;
}

/**
 * Accessible radio group made of large buttons: arrow keys move between options, selection is
 * shown by an outline, a tint, a check icon and aria-checked (never color alone).
 */
export function ChoiceGroup<V extends string | number>({
  label,
  choices,
  value,
  onChange,
  disabled = false,
  layout = 'stack',
}: {
  /** Accessible name of the group (a visible heading usually repeats it). */
  label: string;
  choices: Choice<V>[];
  value: V | null;
  onChange: (value: V) => void;
  disabled?: boolean;
  layout?: 'stack' | 'segmented';
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = choices.map((choice, index) => ({ choice, index })).filter(({ choice }) => !choice.disabled && !disabled);

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
    if (!keys.includes(event.key) || enabled.length === 0) return;
    event.preventDefault();
    const position = enabled.findIndex(({ index }) => index === from);
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const next = enabled[(position + delta + enabled.length) % enabled.length];
    if (!next) return;
    refs.current[next.index]?.focus();
    onChange(next.choice.value);
  };

  const focusable = value !== null && choices.some((c) => c.value === value) ? value : enabled[0]?.choice.value;

  return (
    <div role="radiogroup" aria-label={label} className={layout === 'segmented' ? 'segmented' : 'grid gap-3'}>
      {choices.map((choice, index) => {
        const checked = choice.value === value;
        const isDisabled = disabled || choice.disabled === true;
        return (
          <button
            key={String(choice.value)}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={choice.ariaLabel}
            aria-disabled={isDisabled || undefined}
            disabled={isDisabled}
            tabIndex={choice.value === focusable ? 0 : -1}
            className="choice"
            onClick={() => {
              if (!isDisabled) onChange(choice.value);
            }}
            onKeyDown={(event) => move(event, index)}
          >
            {choice.index ? (
              <span className="choice-index" aria-hidden="true">
                {choice.index}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block">{choice.label}</span>
              {choice.description ? <span className="block text-[14px] font-medium muted">{choice.description}</span> : null}
            </span>
            {checked ? <Check className="choice-check" size={22} strokeWidth={3} aria-hidden="true" /> : null}
            {checked && layout === 'stack' ? <span className="sr-only">Selected</span> : null}
          </button>
        );
      })}
    </div>
  );
}
