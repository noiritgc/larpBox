import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EndedScreen, NotInRoomScreen, SessionConflictOverlay } from '../components/common/SystemScreens';
import { ControllerShell } from '../components/controller/ControllerShell';
import { ControllerLobby } from '../components/controller/Lobby';
import { ControllerDuel } from '../components/controller/Reader';
import { ControllerDuelResult, ControllerFinal, ControllerScoreboard } from '../components/controller/Results';
import { ControllerRules } from '../components/controller/Rules';
import { ControllerRoundIntro } from '../components/controller/Waiting';
import { ControllerWriter } from '../components/controller/Writer';
import { HostDuel } from '../components/host/Duel';
import { HostFinal } from '../components/host/Final';
import { PauseOverlay } from '../components/host/HostShell';
import { HostLobby } from '../components/host/Lobby';
import { HostScoreboard } from '../components/host/Results';
import { HostRoundIntro } from '../components/host/RoundIntro';
import { HostRules } from '../components/host/Rules';
import { HostWriting } from '../components/host/Writing';
import type { ConnectionStatus } from '../lib/socket';
import { fixturePhase, hostView, id, LONG_POST, LONG_POST_B, OPTIONS, playerView, players, posts, result, reveal } from './fixtures';

/**
 * Development-only gallery of every screen rendered from fixture DTOs, including worst cases.
 * Only reachable in the Vite dev server with ENABLE_DEVTOOLS=true; compiled out of builds.
 */

interface Scenario {
  id: string;
  title: string;
  render: () => ReactNode;
}

function Phone({ children, status = 'connected', view }: { children: ReactNode; status?: ConnectionStatus; view: Parameters<typeof ControllerShell>[0]['view'] }) {
  return (
    <ControllerShell code="KPRT" status={status} view={view}>
      {children}
    </ControllerShell>
  );
}

const eight = players(8, (_, i) => ({ ready: i !== 5, connected: i !== 6, joining: i === 7, score: [2250, 2250, 1416, 999, 666, 333, 0, 0][i] ?? 0 }));
const scored = players(5, (_, i) => ({ score: [2250, 1416, 1416, 666, 0][i] ?? 0 }));
const rows = scored.map((player, index) => ({
  playerId: player.id,
  rank: [1, 2, 2, 4, 5][index] ?? 5,
  total: player.score,
  roundGain: [1250, 1416, 250, 666, 0][index] ?? 0,
}));
const tieRows = players(3).map((player) => ({ playerId: player.id, rank: 1, total: 0, roundGain: 0 }));

const writingAssignments = [
  {
    id: id(401),
    presentationNumber: 2,
    truth: reveal.truth,
    facts: reveal.facts,
    boundaries: reveal.boundaries,
    draftText: '',
    draftRevision: 0,
    status: 'DRAFT' as const,
    finalText: null,
    autoSubmitted: false,
  },
  {
    id: id(402),
    presentationNumber: 4,
    truth: 'You labeled your freezer bags.',
    facts: ['You had six freezer bags.', 'You wrote what was inside each one.'],
    boundaries: ['You did not cook, meal-plan, or feed anyone else.'],
    draftText: '',
    draftRevision: 0,
    status: 'DRAFT' as const,
    finalText: null,
    autoSubmitted: false,
  },
];

const hostScenarios: Scenario[] = [
  { id: 'host-lobby-empty', title: 'Host lobby, empty', render: () => <HostLobby view={hostView({ kind: 'LOBBY', readyCount: 0, canStart: false, startBlocker: { code: 'TOO_FEW_PLAYERS', message: 'Need 3 more players to start.' }, settingsChanged: false }, { players: [] })} /> },
  { id: 'host-lobby-full', title: 'Host lobby, 8 seats, offline and joining', render: () => <HostLobby view={hostView({ kind: 'LOBBY', readyCount: 6, canStart: false, startBlocker: { code: 'PLAYER_OFFLINE', message: 'Waiting for Tanvi to reconnect.' }, settingsChanged: true }, { players: eight })} /> },
  { id: 'host-rules', title: 'Rules', render: () => <HostRules view={hostView({ kind: 'RULES', skipAfterMs: 5_000 })} /> },
  { id: 'host-intro-2', title: 'Round 2 intro', render: () => <HostRoundIntro view={hostView({ kind: 'ROUND_INTRO', roundNumber: 2, roundCount: 2, multiplier: 2, title: 'Open to anything', sitOutIds: [] }, { round: 2 })} /> },
  { id: 'host-intro-sitout', title: 'Round 1 intro, one post each, one sits out', render: () => <HostRoundIntro view={hostView({ kind: 'ROUND_INTRO', roundNumber: 1, roundCount: 2, multiplier: 1, title: 'Open to work', sitOutIds: [id(104)] }, { round: 1, duels: 2 })} /> },
  {
    id: 'host-writing',
    title: 'Writing progress, 8 players',
    render: () => (
      <HostWriting
        view={hostView(
          { kind: 'WRITING', progress: eight.map((p, i) => ({ playerId: p.id, locked: (i % 3) as 0 | 1 | 2, total: 2 })), lockedTotal: 7, assignmentTotal: 16, extensionUsed: false },
          { players: eight, duels: 8, settings: { postsPerPlayer: 2 } },
        )}
      />
    ),
  },
  {
    id: 'host-writing-one-post',
    title: 'Writing progress, one post each, one judging',
    render: () => (
      <HostWriting
        view={hostView(
          { kind: 'WRITING', progress: players(5).map((p, i) => ({ playerId: p.id, locked: i === 1 || i === 2 ? 1 : 0, total: i === 4 ? 0 : 1 })), lockedTotal: 2, assignmentTotal: 4, extensionUsed: false },
          { players: players(5), duels: 2 },
        )}
      />
    ),
  },
  { id: 'host-read-long', title: 'READ, two 280-character posts', render: () => <HostDuel view={hostView({ kind: 'DUEL_READ', duelId: id(300), posts: posts.long })} /> },
  { id: 'host-read-unbroken', title: 'READ, long unbroken string', render: () => <HostDuel view={hostView({ kind: 'DUEL_READ', duelId: id(300), posts: posts.unbroken })} /> },
  { id: 'host-read-forfeit', title: 'READ, one forfeit', render: () => <HostDuel view={hostView({ kind: 'DUEL_READ', duelId: id(300), posts: posts.forfeitB })} /> },
  { id: 'host-guess-long', title: 'GUESS, long posts', render: () => <HostDuel view={hostView({ kind: 'DUEL_GUESS', duelId: id(300), posts: posts.long, options: OPTIONS, lockedCount: 2, eligibleCount: 3 })} /> },
  {
    id: 'host-endorse-long',
    title: 'ENDORSE, long posts',
    render: () => (
      <HostDuel view={hostView({ kind: 'DUEL_ENDORSE', duelId: id(300), posts: posts.long, options: OPTIONS, ...reveal, availableChoices: ['A', 'B', 'NEITHER'], lockedCount: 1, eligibleCount: 3 })} />
    ),
  },
  { id: 'host-result', title: 'RESULT, winner', render: () => <HostDuel view={hostView({ kind: 'DUEL_RESULT', duelId: id(300), result: result({ stamp: 'ENDORSED_A', votesA: 2, votesB: 1, neither: 0, pointsA: 666, pointsB: 333 }) })} /> },
  { id: 'host-result-tie', title: 'RESULT, co-endorsed', render: () => <HostDuel view={hostView({ kind: 'DUEL_RESULT', duelId: id(300), result: result({ stamp: 'CO_ENDORSED', votesA: 1, votesB: 1, neither: 1, pointsA: 333, pointsB: 333 }) })} /> },
  { id: 'host-result-none', title: 'RESULT, no endorsements, forfeit', render: () => <HostDuel view={hostView({ kind: 'DUEL_RESULT', duelId: id(300), result: result({ stamp: 'NO_ENDORSEMENTS', votesA: 0, votesB: 0, neither: 3, pointsA: 0, pointsB: 0, forfeitB: true, correct: [] }) })} /> },
  { id: 'host-result-unfilled', title: 'RESULT, both positions unfilled', render: () => <HostDuel view={hostView({ kind: 'DUEL_RESULT', duelId: id(300), result: result({ stamp: 'UNFILLED', votesA: 0, votesB: 0, neither: 0, pointsA: 0, pointsB: 0, correct: [] }) })} /> },
  { id: 'host-scoreboard', title: 'Round scoreboard with ties', render: () => <HostScoreboard view={hostView({ kind: 'ROUND_SCOREBOARD', roundNumber: 1, nextMultiplier: 2, rows }, { players: scored })} /> },
  {
    id: 'host-final',
    title: 'Final, single winner',
    render: () => (
      <HostFinal
        view={hostView(
          { kind: 'FINAL', rows: rows.map((r) => ({ ...r, roundGain: 0 })), winnerIds: [id(100)], award: 'CHIEF_EXAGGERATION_OFFICER', bestPost: { duelId: id(300), side: 'A', playerId: id(100), text: LONG_POST, truth: reveal.truth, points: 1333, roundNumber: 2 } },
          { players: scored, round: 2, phase: fixturePhase('FINAL', { remainingMs: null }) },
        )}
      />
    ),
  },
  {
    id: 'host-final-tie',
    title: 'Final, all-zero joint win',
    render: () => (
      <HostFinal
        view={hostView(
          { kind: 'FINAL', rows: tieRows, winnerIds: tieRows.map((r) => r.playerId), award: 'CO_CEOS_OF_DOING_NOTHING', bestPost: null },
          { players: players(3), round: 1, phase: fixturePhase('FINAL', { remainingMs: null }) },
        )}
      />
    ),
  },
  {
    id: 'host-paused',
    title: 'Paused overlay',
    render: () => {
      const view = hostView({ kind: 'DUEL_READ', duelId: id(300), posts: posts.long }, { phase: fixturePhase('DUEL_READ', { remainingMs: 7_000, paused: 'HOST_PAUSED' }) });
      return (
        <>
          <HostDuel view={view} />
          <PauseOverlay view={view} />
        </>
      );
    },
  },
];

const readerSelf = { role: 'READER' as const, side: null, autoSubmitted: false };
const writerSelf = { role: 'WRITER' as const, side: 'A' as const, autoSubmitted: true };

const phoneScenarios: Scenario[] = [
  { id: 'phone-lobby', title: 'Lobby, settings changed', render: () => { const view = playerView({ kind: 'LOBBY', readyCount: 3, settingsChanged: true }, { players: players(5, (_, i) => ({ ready: i > 0 })) }); return <Phone view={view}><ControllerLobby view={view} onLeft={() => {}} /></Phone>; } },
  { id: 'phone-rules', title: 'Rules', render: () => { const view = playerView({ kind: 'RULES', skipAfterMs: 5_000 }); return <Phone view={view}><ControllerRules view={view} /></Phone>; } },
  { id: 'phone-intro', title: 'Round 2 intro', render: () => { const view = playerView({ kind: 'ROUND_INTRO', roundNumber: 2, roundCount: 2, multiplier: 2, title: 'Open to anything', sitOutIds: [] }, { round: 2 }); return <Phone view={view}><ControllerRoundIntro view={view} /></Phone>; } },
  { id: 'phone-intro-sitout', title: 'Round 1 intro, sitting out', render: () => { const view = playerView({ kind: 'ROUND_INTRO', roundNumber: 1, roundCount: 2, multiplier: 1, title: 'Open to work', sitOutIds: [id(100)] }, { round: 1 }); return <Phone view={view}><ControllerRoundIntro view={view} /></Phone>; } },
  { id: 'phone-writing-single', title: 'Writing, one post each', render: () => { const view = playerView({ kind: 'WRITING', assignments: [writingAssignments[0]!] }); return <Phone view={view}><ControllerWriter view={view} connection={null} connected /></Phone>; } },
  { id: 'phone-sitting-out', title: 'Writing, sitting out (judging)', render: () => { const view = playerView({ kind: 'WRITING', assignments: [] }); return <Phone view={view}><ControllerWriter view={view} connection={null} connected /></Phone>; } },
  { id: 'phone-writing', title: 'Writing, two posts each, empty', render: () => { const view = playerView({ kind: 'WRITING', assignments: writingAssignments }, { settings: { postsPerPlayer: 2 } }); return <Phone view={view}><ControllerWriter view={view} connection={null} connected /></Phone>; } },
  {
    id: 'phone-writing-warning',
    title: 'Writing, last 15 seconds, one locked',
    render: () => {
      const view = playerView(
        { kind: 'WRITING', assignments: [{ ...writingAssignments[0]!, status: 'LOCKED', finalText: LONG_POST, draftText: LONG_POST, draftRevision: 3 }, writingAssignments[1]!] },
        { phase: fixturePhase('WRITING', { remainingMs: 12_000 }), settings: { postsPerPlayer: 2 } },
      );
      return <Phone view={view}><ControllerWriter view={view} connection={null} connected /></Phone>;
    },
  },
  { id: 'phone-writing-offline', title: 'Writing while reconnecting', render: () => { const view = playerView({ kind: 'WRITING', assignments: writingAssignments }, { settings: { postsPerPlayer: 2 } }); return <Phone view={view} status="reconnecting"><ControllerWriter view={view} connection={null} connected={false} /></Phone>; } },
  { id: 'phone-read-writer', title: 'READ as a writer (auto-submitted)', render: () => { const view = playerView({ kind: 'DUEL_READ', duelId: id(300), posts: posts.long, me: writerSelf }); return <Phone view={view}><ControllerDuel view={view} connection={null} connected /></Phone>; } },
  { id: 'phone-guess', title: 'GUESS as a reader', render: () => { const view = playerView({ kind: 'DUEL_GUESS', duelId: id(300), posts: posts.long, options: OPTIONS, lockedCount: 1, eligibleCount: 3, me: { ...readerSelf, guessOptionId: null, guessPick: null } }); return <Phone view={view}><ControllerDuel view={view} connection={null} connected /></Phone>; } },
  {
    id: 'phone-guess-urgent',
    title: 'GUESS, picked but not locked, 6 seconds left',
    render: () => {
      const view = playerView(
        { kind: 'DUEL_GUESS', duelId: id(300), posts: posts.short, options: OPTIONS, lockedCount: 1, eligibleCount: 3, me: { ...readerSelf, guessOptionId: null, guessPick: OPTIONS[2]!.id } },
        { phase: fixturePhase('DUEL_GUESS', { remainingMs: 6_000, durationMs: 20_000 }) },
      );
      return <Phone view={view}><ControllerDuel view={view} connection={null} connected /></Phone>;
    },
  },
  { id: 'phone-guess-locked', title: 'GUESS, locked', render: () => { const view = playerView({ kind: 'DUEL_GUESS', duelId: id(300), posts: posts.short, options: OPTIONS, lockedCount: 2, eligibleCount: 3, me: { ...readerSelf, guessOptionId: OPTIONS[1]!.id, guessPick: null } }); return <Phone view={view}><ControllerDuel view={view} connection={null} connected /></Phone>; } },
  {
    id: 'phone-endorse-forfeit',
    title: 'ENDORSE with a forfeited side',
    render: () => {
      const view = playerView({
        kind: 'DUEL_ENDORSE',
        duelId: id(300),
        posts: posts.forfeitB,
        options: OPTIONS,
        ...reveal,
        availableChoices: ['A', 'NEITHER'],
        lockedCount: 0,
        eligibleCount: 3,
        me: { ...readerSelf, guessOptionId: OPTIONS[1]!.id, guessCorrect: true, endorsement: null, endorsementPick: null },
      });
      return <Phone view={view}><ControllerDuel view={view} connection={null} connected /></Phone>;
    },
  },
  {
    id: 'phone-endorse-urgent',
    title: 'ENDORSE, nothing picked, 4 seconds left',
    render: () => {
      const view = playerView(
        {
          kind: 'DUEL_ENDORSE',
          duelId: id(300),
          posts: posts.short,
          options: OPTIONS,
          ...reveal,
          availableChoices: ['A', 'B', 'NEITHER'],
          lockedCount: 1,
          eligibleCount: 3,
          me: { ...readerSelf, guessOptionId: OPTIONS[1]!.id, guessCorrect: true, endorsement: null, endorsementPick: null },
        },
        { phase: fixturePhase('DUEL_ENDORSE', { remainingMs: 4_000, durationMs: 20_000 }) },
      );
      return <Phone view={view}><ControllerDuel view={view} connection={null} connected /></Phone>;
    },
  },
  {
    id: 'phone-result-writer',
    title: 'RESULT as the winning writer',
    render: () => {
      const view = playerView({ kind: 'DUEL_RESULT', duelId: id(300), result: result({ stamp: 'ENDORSED_A', votesA: 2, votesB: 1, neither: 0, pointsA: 666, pointsB: 333 }), me: { ...writerSelf, guessCorrect: null, writingPoints: 666, guessPoints: null, total: 1416 } });
      return <Phone view={view}><ControllerDuelResult view={view} /></Phone>;
    },
  },
  { id: 'phone-scoreboard', title: 'Scoreboard', render: () => { const view = playerView({ kind: 'ROUND_SCOREBOARD', roundNumber: 1, nextMultiplier: 2, rows }, { players: scored, selfId: id(102) }); return <Phone view={view}><ControllerScoreboard view={view} /></Phone>; } },
  {
    id: 'phone-final',
    title: 'Final',
    render: () => {
      const view = playerView(
        { kind: 'FINAL', rows: rows.map((r) => ({ ...r, roundGain: 0 })), winnerIds: [id(100)], award: 'CHIEF_EXAGGERATION_OFFICER', bestPost: { duelId: id(300), side: 'B', playerId: id(101), text: LONG_POST_B, truth: reveal.truth, points: 1333, roundNumber: 2 } },
        { players: scored, selfId: id(102), phase: fixturePhase('FINAL', { remainingMs: null }) },
      );
      return <Phone view={view}><ControllerFinal view={view} /></Phone>;
    },
  },
  {
    id: 'phone-host-away',
    title: 'Paused because the big screen disconnected',
    render: () => {
      const view = playerView({ kind: 'DUEL_READ', duelId: id(300), posts: posts.short, me: readerSelf }, { hostConnected: false, phase: fixturePhase('DUEL_READ', { remainingMs: 6_000, paused: 'HOST_DISCONNECTED' }) });
      return <Phone view={view}><ControllerDuel view={view} connection={null} connected /></Phone>;
    },
  },
  { id: 'phone-ended', title: 'Room ended', render: () => <EndedScreen payload={{ reason: 'EXPIRED', message: 'This room has ended. Ask the host for a new code.' }} /> },
  { id: 'phone-removed', title: 'Removed from room', render: () => <EndedScreen payload={{ reason: 'REMOVED', message: "You've been removed from this room." }} /> },
  { id: 'phone-not-in-room', title: 'Not part of this room', render: () => <NotInRoomScreen code="KPRT" role="player" /> },
  {
    id: 'phone-session-conflict',
    title: 'Active in another tab',
    render: () => {
      const view = playerView({ kind: 'LOBBY', readyCount: 3, settingsChanged: false });
      return (
        <>
          <Phone view={view}>
            <ControllerLobby view={view} onLeft={() => {}} />
          </Phone>
          <SessionConflictOverlay replaced onTakeOver={() => {}} />
        </>
      );
    },
  },
];

const ALL = [...hostScenarios, ...phoneScenarios];

function PreviewBadge() {
  return (
    <p className="sticker sticker-compact pointer-events-none fixed bottom-3 left-3 z-[60]" role="note">
      LOCAL PREVIEW: NOT A LIVE GAME
    </p>
  );
}

export default function ScenarioGallery() {
  const [params] = useSearchParams();
  const selected = ALL.find((scenario) => scenario.id === params.get('s'));
  if (selected) {
    return (
      <>
        {hostScenarios.includes(selected) ? <div className="host-stage">{selected.render()}</div> : selected.render()}
        <PreviewBadge />
      </>
    );
  }
  return (
    <main className="mx-auto grid max-w-[900px] gap-6 p-6">
      <p className="sticker sticker-compact self-start">LOCAL PREVIEW: NOT A LIVE GAME</p>
      <h1 className="text-[36px]">Scenario gallery</h1>
      <p>Fixture screens for design review. Nothing here connects to a room.</p>
      {[
        ['Big screen', hostScenarios],
        ['Phone', phoneScenarios],
      ].map(([title, list]) => (
        <section key={title as string} className="grid gap-2">
          <h2 className="text-[24px]">{title as string}</h2>
          <ul className="grid gap-1 sm:grid-cols-2">
            {(list as Scenario[]).map((scenario) => (
              <li key={scenario.id}>
                <Link to={`/dev?s=${scenario.id}`}>{scenario.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
