export function TruthBanner({ truth, size = 'phone' }: { truth: string; size?: 'host' | 'phone' }) {
  return (
    <div className="truth-banner truth-in" style={{ fontSize: size === 'host' ? 'var(--host-facts)' : '20px' }}>
      <span className="truth-banner-label">What actually happened:</span>
      <span>{truth}</span>
    </div>
  );
}

export function FactsList({ facts, boundaries, className = '' }: { facts: string[]; boundaries: string[]; className?: string }) {
  return (
    <div className={`grid gap-3 ${className}`}>
      <div>
        <p className="eyebrow mb-1">Must stay true</p>
        <ul className="facts-list">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="eyebrow mb-1">Off limits</p>
        <ul className="facts-list">
          {boundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
