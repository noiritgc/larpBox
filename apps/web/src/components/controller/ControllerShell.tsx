import type { PlayerView } from '@larpbox/shared';
import type { ReactNode } from 'react';
import type { ConnectionStatus } from '../../lib/socket';
import { persistentStorageAvailable } from '../../lib/storage';
import { RoomCodeChip } from '../game/RoomCode';
import { Wordmark } from '../game/Wordmark';
import { StatusBanner } from '../ui/StatusBanner';

function statusLabel(status: ConnectionStatus): { text: string; tone: 'on' | 'off' | 'idle' } {
  switch (status) {
    case 'connected':
      return { text: 'Connected', tone: 'on' };
    case 'connecting':
      return { text: 'Connecting…', tone: 'idle' };
    case 'reconnecting':
      return { text: 'Reconnecting…', tone: 'off' };
    default:
      return { text: 'Offline', tone: 'off' };
  }
}

/** Phone frame: header with wordmark, room code and network status, then banners, then the screen. */
export function ControllerShell({
  code,
  status,
  view,
  children,
}: {
  code: string;
  status: ConnectionStatus;
  view: PlayerView | null;
  children: ReactNode;
}) {
  const label = statusLabel(status);
  const hostAway = view !== null && !view.hostConnected;
  return (
    <div className="phone" data-testid="controller">
      <header className="phone-header">
        <Wordmark />
        <RoomCodeChip code={code} />
        <span className="ml-auto inline-flex items-center gap-2 text-[14px] font-semibold" data-testid="network-status">
          <span className={`status-dot status-dot-${label.tone}`} aria-hidden="true" />
          {label.text}
        </span>
      </header>
      <div className="phone-body">
        {status === 'reconnecting' || status === 'error' ? (
          <StatusBanner tone="amber" icon="offline">
            Reconnecting… Keep this page open.
          </StatusBanner>
        ) : null}
        {!persistentStorageAvailable() ? (
          <StatusBanner tone="blue" icon="info">
            This browser isn't saving data. Keep this tab open to stay connected.
          </StatusBanner>
        ) : null}
        {view && view.phase.paused ? (
          <StatusBanner tone="yellow" icon="warning" role="alert">
            {view.phase.pauseReason === 'HOST_DISCONNECTED'
              ? 'The big screen disconnected. Waiting for the host.'
              : 'Host paused the game. Your time is safe.'}
          </StatusBanner>
        ) : hostAway && view.phase.name === 'LOBBY' ? (
          <StatusBanner tone="blue" icon="info">
            The big screen is offline right now. Stay here.
          </StatusBanner>
        ) : null}
        {children}
      </div>
    </div>
  );
}
