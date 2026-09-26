import { normalizeRoomCode, type HostView } from '@larpbox/shared';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EndedScreen, LoadingBlock, NotInRoomScreen, OutdatedScreen, SessionConflictOverlay } from '../components/common/SystemScreens';
import { HostDuel } from '../components/host/Duel';
import { HostFinal } from '../components/host/Final';
import { PauseOverlay } from '../components/host/HostShell';
import { HostLobby } from '../components/host/Lobby';
import { HostScoreboard } from '../components/host/Results';
import { HostRoundIntro } from '../components/host/RoundIntro';
import { HostRules } from '../components/host/Rules';
import { HostWriting } from '../components/host/Writing';
import { StatusBanner } from '../components/ui/StatusBanner';
import { ConnectionProvider, useRoomConnection } from '../hooks/useRoomConnection';
import { hostAudio, type Cue } from '../lib/audio';
import { hostCredentialFor } from '../lib/session';
import { useGameStore, useHostView } from '../store/gameStore';

function cueFor(phase: HostView['phase']['name']): Cue | null {
  switch (phase) {
    case 'LOBBY':
      return null;
    case 'DUEL_ENDORSE':
      return 'truth';
    case 'DUEL_RESULT':
      return 'results';
    case 'FINAL':
      return 'final';
    default:
      return 'phase';
  }
}

/** Host-only sound: once per phase entry and once per newly joined player, never on reconnect. */
function useHostCues(view: HostView | null) {
  const knownPlayers = useRef<Set<string> | null>(null);
  const phaseId = view?.phase.id;
  const phaseName = view?.phase.name;
  useEffect(() => {
    if (!phaseId || !phaseName) return;
    const cue = cueFor(phaseName);
    if (cue) hostAudio.playForPhase(phaseId, cue);
  }, [phaseId, phaseName]);
  useEffect(() => {
    if (!view) return;
    const ids = new Set(view.players.map((player) => player.id));
    const known = knownPlayers.current;
    if (known && view.phase.name === 'LOBBY' && [...ids].some((id) => !known.has(id))) hostAudio.play('join');
    knownPlayers.current = ids;
  }, [view]);
}

export default function HostRoom() {
  const params = useParams();
  const code = normalizeRoomCode(params.code ?? '');
  const [credential] = useState(() => hostCredentialFor(code));
  const connection = useRoomConnection({
    role: 'host',
    roomCode: code,
    roomId: credential?.roomId ?? null,
    token: credential?.token ?? null,
  });
  const status = useGameStore((state) => state.status);
  const closed = useGameStore((state) => state.closed);
  const view = useHostView();
  useHostCues(view);

  useEffect(() => {
    // Any host click or key press can unlock audio (browsers require a gesture).
    const unlock = () => hostAudio.unlock();
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  if (!credential) return <NotInRoomScreen code={code} role="host" />;
  if (closed) return <EndedScreen payload={closed} />;
  if (status === 'unauthorized') return <NotInRoomScreen code={code} role="host" />;
  if (status === 'outdated') return <OutdatedScreen />;

  let screen: React.ReactNode = (
    <div className="host">
      <LoadingBlock label="Connecting the big screen…" />
    </div>
  );
  if (view) {
    switch (view.screen.kind) {
      case 'LOBBY':
        screen = <HostLobby view={view} />;
        break;
      case 'RULES':
        screen = <HostRules view={view} />;
        break;
      case 'ROUND_INTRO':
        screen = <HostRoundIntro view={view} />;
        break;
      case 'WRITING':
        screen = <HostWriting view={view} />;
        break;
      case 'DUEL_READ':
      case 'DUEL_GUESS':
      case 'DUEL_ENDORSE':
      case 'DUEL_RESULT':
        screen = <HostDuel key={view.phase.id} view={view} />;
        break;
      case 'ROUND_SCOREBOARD':
        screen = <HostScoreboard view={view} />;
        break;
      case 'FINAL':
        screen = <HostFinal view={view} />;
        break;
      default:
        break;
    }
  }

  return (
    <ConnectionProvider connection={connection}>
      <div className="relative" data-testid="host-room">
        {status === 'reconnecting' || status === 'error' ? (
          <div className="fixed inset-x-0 top-0 z-50 mx-auto max-w-[960px] p-3">
            <StatusBanner tone="amber" icon="offline" role="alert">
              The big screen is reconnecting. Play stays paused until it's back.
            </StatusBanner>
          </div>
        ) : null}
        <div className="host-stage">{screen}</div>
        {view ? <PauseOverlay view={view} /> : null}
        {status === 'in-use' || status === 'replaced' ? (
          <SessionConflictOverlay role="host" replaced={status === 'replaced'} onTakeOver={() => connection?.takeOver()} />
        ) : null}
      </div>
    </ConnectionProvider>
  );
}
