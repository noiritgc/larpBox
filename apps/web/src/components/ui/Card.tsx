import type { HTMLAttributes } from 'react';

export function Card({ className = '', ruled = false, ...rest }: HTMLAttributes<HTMLDivElement> & { ruled?: boolean }) {
  return <div className={`card ${ruled ? 'card-ruled' : ''} ${className}`} {...rest} />;
}
