import type { HostView } from '@larpbox/shared';
import { Power, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useConnection } from '../../hooks/useRoomConnection';
import { formatClout } from '../../lib/format';
import { Avatar } from '../game/Avatar';
import { Scoreboard } from '../game/Scoreboard';
import { Stamp } from '../game/Stamp';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ScreenHeading } from '../ui/ScreenHeading';
import { Confetti } from './Confetti';
import { EndRoomDialog, HostTopBar } from './HostShell';
import { ScrollArea } from './ScrollArea';

export function HostFinal({ view }: { view: HostView }) {
  const connection = useConnection();
  const [confirmRematch, setConfirmRematch] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (view.screen.kind !== 'FINAL') return null;
  const screen = view.screen;
  const byId = new Map(view.players.map((player) => [player.id, player]));
  const winners = screen.winnerIds.map((id) => byId.get(id)).filter((p) => p !== undefined);
  const joint = screen.award === 'CO_CEOS_OF_DOING_NOTHING';
  const best = screen.bestPost;
  const bestAuthor = best ? byId.get(best.playerId) : undefined;

  const rematch = async () => {
    if (!connection) return;
    setBusy(true);
    const result = await connection.command('host.returnToLobby', {});
    setBusy(false);
    if (result.ok) setConfirmRematch(false);
    else setError(result.message);
  };

  const close = async () => {
    if (!connection) return;
    const result = await connection.command('host.closeRoom', {});
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="host" data-testid="host-final">
      <Confetti burstId={view.phase.id} />
      <HostTopBar view={view} showTimer={false} center={<span>Final results · Room <strong>{view.roomCode}</strong></span>} />
      <main className="host-main">
        <ScrollArea>
          <div className="grid gap-[var(--host-gap)] xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="grid content-start gap-[var(--host-gap)]">
              <div className="grid gap-3">
                <Stamp tone="yellow" size={28}>
                  {joint ? 'Co-CEOs of Doing Nothing' : 'Chief Exaggeration Officer'}
                </Stamp>
                <ScreenHeading className="font-display text-[clamp(48px,calc(4px+4.5vw),104px)] leading-[0.95]">
                  {winners.map((player) => player.name).join(' & ') || 'Nobody'}
                </ScreenHeading>
                <div className="flex flex-wrap gap-3">
                  {winners.map((player) => (
                    <Avatar key={player.id} id={player.avatarId} size={72} label={player.name} />
                  ))}
                </div>
              </div>
              <Scoreboard rows={screen.rows} players={view.players} size="host" showGain={false} />
            </div>
            <div className="grid content-start gap-4">
              {best ? (
                <>
                  <p className="eyebrow text-[var(--host-label)]">Highest-Clout Announcement</p>
                  <article className="post-card">
                    <header className="post-head">
                      {bestAuthor ? <Avatar id={bestAuthor.avatarId} size={56} decorative /> : null}
                      <div className="min-w-0">
                        <h2 className="post-author font-body">{bestAuthor?.name ?? 'A former player'}</h2>
                        <p className="post-subtitle">{bestAuthor?.headline ?? 'Professional'}</p>
                      </div>
                    </header>
                    <p className="post-body">{best.text}</p>
                    <p className="font-display text-[var(--host-label)] font-bold text-blue">+{formatClout(best.points)} Clout</p>
                  </article>
                  <p className="truth-box text-[var(--host-facts)]">
                    <span className="eyebrow block">What actually happened</span>
                    {best.truth}
                  </p>
                </>
              ) : (
                <p className="card p-6 font-display text-[clamp(28px,calc(6px+1.6vw),44px)] font-bold">
                  A room full of professionals. No endorsements.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="primary" onClick={() => setConfirmRematch(true)} icon={<RotateCcw size={22} aria-hidden="true" />} data-testid="play-again">
                  Play again
                </Button>
                <Button onClick={() => setConfirmClose(true)} icon={<Power size={22} aria-hidden="true" />}>
                  Close room
                </Button>
              </div>
              {error ? (
                <p className="field-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </ScrollArea>
      </main>
      <Modal open={confirmRematch} title="Return everyone to the lobby?" onClose={() => setConfirmRematch(false)}>
        <p>Scores will reset. Anyone who is offline right now will be removed from the room.</p>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => setConfirmRematch(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={rematch} data-testid="confirm-rematch">
            Back to lobby
          </Button>
        </div>
      </Modal>
      <EndRoomDialog open={confirmClose} onCancel={() => setConfirmClose(false)} onConfirm={close} error={error} />
    </div>
  );
}
