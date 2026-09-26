import { Sticker } from './Sticker';

/** The revealed truth as a freestanding sticker, only where the phase has revealed it. */
export function TruthBanner({ truth, size = 'phone' }: { truth: string; size?: 'host' | 'phone' }) {
  return (
    <div className={`grid justify-items-start gap-2 truth-in ${size === 'host' ? 'truth-host' : ''}`}>
      <p className="eyebrow muted">What actually happened</p>
      <Sticker placement="line">{truth}</Sticker>
    </div>
  );
}

export function FactsList({ facts, boundaries, className = '' }: { facts: string[]; boundaries: string[]; className?: string }) {
  return (
    <div className={`grid gap-3 ${className}`}>
      <div>
        <p className="eyebrow muted mb-1">Must stay true</p>
        <ul className="facts-list">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="eyebrow muted mb-1">Off limits</p>
        <ul className="facts-list">
          {boundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
