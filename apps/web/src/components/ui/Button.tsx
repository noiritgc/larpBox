import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'yellow' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
  small?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  icon?: ReactNode;
}

/** Semantic button. Loading disables it so a pending request is never sent twice. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', block = false, small = false, loading = false, loadingLabel, icon, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const classes = [
    'btn',
    variant === 'primary' ? 'btn-primary' : '',
    variant === 'yellow' ? 'btn-yellow' : '',
    variant === 'danger' ? 'btn-danger' : '',
    variant === 'ghost' ? 'btn-ghost' : '',
    block ? 'btn-block' : '',
    small ? 'btn-small' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon}
      <span className="inline-flex items-center gap-2">{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
});
