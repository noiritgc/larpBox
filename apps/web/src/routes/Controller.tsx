import { normalizeRoomCode } from '@larpbox/shared';
import { useCallback, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  EndedScreen,
  LoadingBlock,
  NotInRoomScreen,
  OutdatedScreen,
  SessionConflictOverlay,
} from '../components/common/SystemScreens';
import { ControllerShell } from '../components/controller/ControllerShell';
import { ControllerLobby } from '../components/controller/Lobby';
import { ControllerDuel } from '../components/controller/Reader';
import { ControllerDuelResult, ControllerFinal, ControllerScoreboard } from '../components/controller/Results';
import { ControllerRules } from '../components/controller/Rules';
import { ControllerRoundIntro } from '../components/controller/Waiting';
import { ControllerWriter } from '../components/controller/Writer';
import { ConnectionProvider, useRoomConnection } from '../hooks/useRoomConnection';
import { forgetRoom, playerCredentialFor } from '../lib/session';
import { useGameStore, usePlayerView } from '../store/gameStore';

export default function Controller() {
  const params = useParams();
  const code = normalizeRoomCode(params.code ?? '');
  const navigate = useNavigate();
  const [credential] = useState(() => playerCredentialFor(code));
  const connection = useRoomConnection({
    role: 'player',
    roomCode: code,
    roomId: credential?.roomId ?? null,
    token: credential?.token ?? null,
  });
  const status = useGameStore((state) => state.status);
  const closed = useGameStore((state) => state.closed);
  const view = usePlayerView();
  const onLeft = useCallback(() => {
    if (credential) forgetRoom(credential.roomId, 'player');
    navigate('/', { replace: true });
  }, [credential, navigate]);

  if (!credential) return <Navigate to={`/join/${code}`} replace />;
  if (closed) return <EndedScreen payload={closed} />;
  if (status === 'unauthorized') return <NotInRoomScreen code={code} role="player" />;
  if (status === 'outdated') return <OutdatedScreen />;

  const connected = status === 'connected';
  const screen = view?.screen.kind;
  let content: React.ReactNode = <LoadingBlock />;
  if (view) {
    switch (screen) {
      case 'LOBBY':
        content = <ControllerLobby view={view} onLeft={onLeft} />;
        break;
      case 'RULES':
        content = <ControllerRules view={view} />;
        break;
      case 'ROUND_INTRO':
        content = <ControllerRoundIntro view={view} />;
        break;
      case 'WRITING':
        content = <ControllerWriter key={view.phase.id} view={view} connection={connection} connected={connected} />;
        break;
      case 'DUEL_READ':
      case 'DUEL_GUESS':
      case 'DUEL_ENDORSE':
        content = <ControllerDuel view={view} connection={connection} connected={connected} />;
        break;
      case 'DUEL_RESULT':
        content = <ControllerDuelResult key={view.phase.id} view={view} />;
        break;
      case 'ROUND_SCOREBOARD':
        content = <ControllerScoreboard view={view} />;
        break;
      case 'FINAL':
        content = <ControllerFinal view={view} />;
        break;
      default:
        content = <LoadingBlock />;
    }
  }

  return (
    <ConnectionProvider connection={connection}>
      <ControllerShell code={code} status={status} view={view}>
        {content}
      </ControllerShell>
      {status === 'in-use' || status === 'replaced' ? (
        <SessionConflictOverlay replaced={status === 'replaced'} onTakeOver={() => connection?.takeOver()} />
      ) : null}
    </ConnectionProvider>
  );
}
