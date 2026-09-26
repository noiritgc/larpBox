import { useEffect, useState } from 'react';
import { HealthResponseSchema, type HealthResponse } from '@larpbox/shared';

/** Milestone 1 placeholder: proves the web build, the /api proxy and the shared package work. */
export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.json())
      .then((body: unknown) => setHealth(HealthResponseSchema.parse(body)))
      .catch(() => setError('Server unreachable'));
  }, []);

  return (
    <main className="mx-auto max-w-xl p-6 font-body">
      <h1 className="font-display text-4xl font-bold">larpbox TV</h1>
      <p className="mt-4 font-mono text-muted">
        {health ? `Server ok · protocol ${health.protocolVersion} · boot ${health.bootId.slice(0, 8)}` : (error ?? 'Checking server…')}
      </p>
    </main>
  );
}
