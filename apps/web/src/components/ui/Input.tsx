import { CircleAlert } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: ReactNode;
  error?: string | null;
  hint?: ReactNode;
}

/** Labelled text input. Errors keep their space reserved so controls do not jump. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, className = '', ...rest }, ref) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className={`input ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="mt-2 text-[15px] muted">
          {hint}
        </p>
      ) : null}
      <div className="min-h-[28px]">
        {error ? (
          <p id={errorId} className="field-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" className="mt-[2px] flex-none" />
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
});
