import type { RoomClosedPayload } from '@larpbox/shared';
import { MonitorX, RefreshCw, TabletSmartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../brand/BrandLogo';
import { Button } from '../ui/Button';
import { ScreenHeading } from '../ui/ScreenHeading';

export function CenteredPage({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div className="page-frame">
      <main className="page-inner mx-auto flex max-w-[600px] flex-col gap-8" data-testid={testId}>
        <BrandLogo />
        <div className="card tape panel grid gap-5">{children}</div>
      </main>
    </div>
  );
}

/** Honest end-of-room screen: rooms never come back after the host ends them or the server restarts. */
export function EndedScreen({ payload }: { payload: RoomClosedPayload }) {
  const removed = payload.reason === 'REMOVED';
  const left = payload.reason === 'LEFT';
  return (
    <CenteredPage testId="room-ended">
      <MonitorX size={40} aria-hidden="true" />
      <ScreenHeading className="display text-[36px]">
        {removed ? "You've been removed from this room." : left ? 'You left the room.' : 'This room has ended.'}
      </ScreenHeading>
      <p className="text-[18px]">
        {removed || left ? 'You can join another room with a new code.' : 'Ask the host for a new code.'}
      </p>
      {!removed && !left && payload.message && payload.message !== 'This room has ended. Ask the host for a new code.' ? (
        <p className="muted">{payload.message}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/join" className="btn btn-primary">
          Join another
        </Link>
        <Link to="/" className="btn">
          Home
        </Link>
      </div>
    </CenteredPage>
  );
}

export function NotInRoomScreen({ code, role }: { code: string; role: 'host' | 'player' }) {
  return (
    <CenteredPage testId="not-in-room">
      <TabletSmartphone size={40} aria-hidden="true" />
      <ScreenHeading className="display text-[36px]">
        {role === 'host' ? "This browser doesn't host this room." : "This browser isn't part of this room."}
      </ScreenHeading>
      <p className="text-[18px]">
        {role === 'host'
          ? 'Only the browser that created a room can run its big screen. You can still join as a player.'
          : 'Join with the room code to get a spot, if the game is still in the lobby.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to={`/join/${code}`} className="btn btn-primary">
          Join room {code}
        </Link>
        <Link to="/" className="btn">
          Home
        </Link>
      </div>
    </CenteredPage>
  );
}

export function OutdatedScreen() {
  return (
    <CenteredPage testId="outdated">
      <ScreenHeading className="display text-[36px]">This page is out of date.</ScreenHeading>
      <p className="text-[18px]">The game server was updated. Reload to continue.</p>
      <Button variant="primary" icon={<RefreshCw size={20} aria-hidden="true" />} onClick={() => window.location.reload()}>
        Reload
      </Button>
    </CenteredPage>
  );
}

/** Another tab holds this seat. Taking over is always a deliberate tap, never automatic. */
export function SessionConflictOverlay({
  onTakeOver,
  replaced,
  role = 'player',
}: {
  onTakeOver: () => void;
  replaced: boolean;
  role?: 'host' | 'player';
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="session-conflict-title" data-testid="session-conflict">
      <div className="card tape panel grid w-full max-w-[440px] gap-4">
        <h2 id="session-conflict-title" className="display text-[30px]">
          {role === 'host' ? 'This big screen is open in another tab.' : 'This player is active in another tab.'}
        </h2>
        <p>
          {replaced
            ? 'You opened this game somewhere else, so this tab stopped. Use this tab to move back here.'
            : 'Close the other tab, or use this one instead. The other tab will stop.'}
        </p>
        <Button variant="primary" onClick={onTakeOver} data-testid="use-this-tab">
          Use this tab
        </Button>
      </div>
    </div>
  );
}

export function LoadingBlock({ label = 'Connecting to the room…' }: { label?: string }) {
  return (
    <div className="grid place-items-center gap-3 py-16 text-center" role="status">
      <span className="spinner text-[32px]" aria-hidden="true" />
      <p className="font-semibold">{label}</p>
    </div>
  );
}
