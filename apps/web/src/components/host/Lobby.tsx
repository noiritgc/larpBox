import {
  estimateGameMinutes,
  MAX_PLAYERS,
  MIN_PLAYERS,
  POSTS_PER_PLAYER_LABELS,
  ROUND_COUNT_LABELS,
  type HostView,
  type PublicPlayer,
  type RoomSettings,
} from '@larpbox/shared';
import { Check, CircleDashed, Copy, Link2, Play, UserX } from 'lucide-react';
import { useState } from 'react';
import { useConnection } from '../../hooks/useRoomConnection';
import { hostAudio } from '../../lib/audio';
import { Avatar } from '../game/Avatar';
import { JoinQR } from '../game/JoinQR';
import { BrandLogo } from '../brand/BrandLogo';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ScreenHeading } from '../ui/ScreenHeading';
import { StatusBanner } from '../ui/StatusBanner';
import { FullscreenButton, HostMenu, SoundToggle } from './HostShell';
import { SettingsFields } from './SettingsFields';

function RosterRow({ player, onRemove }: { player: PublicPlayer; onRemove: () => void }) {
  return (
    <li className="host-roster-row enter" data-testid="roster-row">
      <span className="roster-avatar">
        <Avatar id={player.avatarId} size={52} decorative />
      </span>
      <div className="roster-text min-w-0">
        <p className="host-roster-name truncate">{player.name}</p>
        <p className="host-roster-headline truncate">{player.headline}</p>
      </div>
      <span className="roster-status inline-flex items-center gap-2 font-semibold">
        {!player.connected ? (
          <>
            <span className="status-dot status-dot-off" aria-hidden="true" />
            <span className="text-amber">{player.joining ? 'Joining…' : 'Offline'}</span>
          </>
        ) : player.ready ? (
          <>
            <Check size={24} aria-hidden="true" className="text-green" />
            <span className="text-green">Ready</span>
          </>
        ) : (
          <>
            <CircleDashed size={24} aria-hidden="true" className="muted" />
            <span className="muted">Not ready</span>
          </>
        )}
      </span>
      <button
        type="button"
        className="roster-remove btn btn-ghost btn-small"
        onClick={onRemove}
        aria-label={`Remove ${player.name}`}
        title={`Remove ${player.name}`}
      >
        <UserX size={22} aria-hidden="true" />
      </button>
    </li>
  );
}

export function HostLobby({ view }: { view: HostView }) {
  const connection = useConnection();
  const [removeTarget, setRemoveTarget] = useState<PublicPlayer | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<RoomSettings>(view.settings);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  if (view.screen.kind !== 'LOBBY') return null;
  const screen = view.screen;
  const joinOrigin = (() => {
    try {
      const url = new URL(view.joinUrl);
      return `${url.host}/join`;
    } catch {
      return '/join';
    }
  })();
  // A localhost join link can't be opened by any phone: tell the operator how to fix it.
  const joinLinkIsLocalOnly = (() => {
    try {
      const host = new URL(view.joinUrl).hostname;
      return host === 'localhost' || host === '[::1]' || host.startsWith('127.');
    } catch {
      return false;
    }
  })();
  const players = view.players;
  const openSeats = Math.max(0, MAX_PLAYERS - players.length);
  const minutes = estimateGameMinutes(view.settings, Math.max(MIN_PLAYERS, players.length));

  const start = async () => {
    if (!connection) return;
    hostAudio.unlock();
    setBusy('start');
    setError(null);
    const result = await connection.command('host.startGame', {});
    setBusy(null);
    if (!result.ok && result.code !== 'PHASE_CHANGED') setError(result.message);
  };

  const remove = async () => {
    if (!connection || !removeTarget) return;
    setBusy('remove');
    const result = await connection.command('host.removePlayer', { playerId: removeTarget.id });
    setBusy(null);
    if (result.ok || result.code === 'BAD_INPUT') setRemoveTarget(null);
    else setError(result.message);
  };

  const saveSettings = async () => {
    if (!connection) return;
    setBusy('settings');
    const result = await connection.command('host.updateSettings', { settings: draftSettings });
    setBusy(null);
    if (result.ok) setSettingsOpen(false);
    else setError(result.message);
  };

  const copyLink = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(view.joinUrl);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="host mx-auto w-full max-w-[1680px]" data-testid="host-lobby">
      <header className="host-topbar">
        <BrandLogo />
        <div className="host-topbar-center" />
        <SoundToggle />
        <FullscreenButton />
        <HostMenu view={view} />
      </header>
      <ScreenHeading className="host-heading">
        The networking <span className="accent">event starts here.</span>
      </ScreenHeading>
      <div className="grid flex-1 items-start gap-[calc(var(--host-gap)*1.5)] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
        <section className="card tape grid justify-items-start gap-4 p-[clamp(20px,1.8vw,34px)]" aria-labelledby="join-title">
          <h2 id="join-title" className="eyebrow">
            Scan the code, or open this on your phone
          </h2>
          <p className="text-[clamp(20px,calc(8px+1vw),30px)] font-bold" data-testid="join-origin">
            {joinOrigin}
          </p>
          <div className="flex flex-wrap items-center gap-[var(--host-gap)]">
            <JoinQR url={view.joinUrl} size={220} />
            <div>
              <p className="eyebrow muted">Room code</p>
              <p className="host-room-code" data-testid="room-code">
                {view.roomCode}
              </p>
            </div>
          </div>
          <p className="host-annotation host-decor accent">Zero experience required.</p>
          <p className="text-[var(--host-label)]">The host plays on a separate phone too.</p>
          <Button small onClick={copyLink} icon={copyState === 'copied' ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}>
            {copyState === 'copied' ? 'Link copied' : 'Copy join link'}
          </Button>
          {joinLinkIsLocalOnly ? (
            <StatusBanner tone="yellow" icon="warning">
              This link only works on this computer. To let phones join, set PUBLIC_ORIGIN to this computer's network address and restart the server.
            </StatusBanner>
          ) : null}
          {copyState === 'failed' ? (
            <label className="grid w-full gap-1">
              <span className="inline-flex items-center gap-2 font-semibold">
                <Link2 size={18} aria-hidden="true" /> Copy this link:
              </span>
              <input className="input" readOnly value={view.joinUrl} onFocus={(event) => event.currentTarget.select()} />
            </label>
          ) : null}
        </section>
        <section className="grid content-start gap-4" aria-labelledby="roster-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="roster-title" className="display text-[clamp(32px,calc(8px+2vw),48px)]">
              Your network
            </h2>
            <span className="badge text-[clamp(13px,calc(6px+0.5vw),16px)]">
              {players.length} / {MAX_PLAYERS} players · {screen.readyCount} ready
            </span>
          </div>
          {screen.settingsChanged ? (
            <StatusBanner tone="yellow" icon="info">
              Settings changed. Everyone needs to ready up again.
            </StatusBanner>
          ) : null}
          <ul className="host-roster" aria-label="Players">
            {players.map((player) => (
              <RosterRow key={player.id} player={player} onRemove={() => setRemoveTarget(player)} />
            ))}
            {Array.from({ length: openSeats }, (_, index) => (
              <li key={`open-${index}`} className="host-roster-row host-roster-row-empty" aria-label="Open seat">
                <span className="grid h-[52px] w-[52px] place-items-center rounded-[12px] border-2 border-dashed border-line" aria-hidden="true" />
                <span className="font-semibold">Open seat</span>
              </li>
            ))}
          </ul>
          <p className="host-annotation host-decor">Everyone in? Let the humblebragging begin.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="primary"
              disabled={!screen.canStart}
              loading={busy === 'start'}
              loadingLabel="Starting…"
              onClick={start}
              icon={<Play size={24} aria-hidden="true" />}
              className="min-w-[220px] text-[22px]"
              data-testid="start-game"
            >
              Start game
            </Button>
            <Button
              onClick={() => {
                setDraftSettings(view.settings);
                setSettingsOpen(true);
              }}
            >
              Room settings
            </Button>
          </div>
          <p className="font-semibold" data-testid="start-reason" aria-live="polite">
            {screen.startBlocker ? screen.startBlocker.message : `${screen.readyCount} of ${players.length} ready`}
          </p>
          <p className="host-subheading">
            {ROUND_COUNT_LABELS[view.settings.roundCount]} · {POSTS_PER_PLAYER_LABELS[view.settings.postsPerPlayer].toLowerCase()} ·{' '}
            {view.settings.secondsPerPost}s per post · about {minutes} minutes. Everyone joins on a phone, including the host.
          </p>
        </section>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <Modal open={removeTarget !== null} title={`Remove ${removeTarget?.name ?? 'this player'} from the room?`} onClose={() => setRemoveTarget(null)}>
        <p>Their phone will be disconnected. They can join again with the code while you're in the lobby.</p>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => setRemoveTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={busy === 'remove'} onClick={remove} data-testid="confirm-remove">
            Remove
          </Button>
        </div>
      </Modal>
      <Modal open={settingsOpen} title="Room settings" onClose={() => setSettingsOpen(false)}>
        <SettingsFields value={draftSettings} onChange={setDraftSettings} />
        <p className="text-[15px] muted">Saving changes asks everyone to ready up again.</p>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={busy === 'settings'} onClick={saveSettings}>
            Save settings
          </Button>
        </div>
      </Modal>
    </div>
  );
}
