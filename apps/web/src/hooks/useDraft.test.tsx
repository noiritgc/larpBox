import type { Ack, AssignmentView } from '@larpbox/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult, RoomConnection } from '../lib/socket';
import { useDraft } from './useDraft';

interface Sent {
  type: string;
  payload: { assignmentId: string; text: string; expectedDraftRevision: number };
  resolve: (ack: CommandResult) => void;
}

/** A connection whose commands resolve only when the test says so. */
function fakeConnection() {
  const sent: Sent[] = [];
  const connection = {
    command: vi.fn((type: string, payload: Sent['payload']) => new Promise<CommandResult>((resolve) => sent.push({ type, payload, resolve }))),
  } as unknown as RoomConnection;
  return { connection, sent };
}

function ok(revision: number, status: 'DRAFT' | 'LOCKED' = 'DRAFT'): Ack {
  return { ok: true, requestId: 'r', revision: 1, serverNow: Date.now(), data: { assignmentId: 'a', draftRevision: revision, status } };
}

const assignment: AssignmentView = {
  id: '00000000-0000-4000-8000-000000000401',
  presentationNumber: 1,
  truth: 'You alphabetized your spice rack.',
  facts: ['There were eleven spice jars.', 'You rearranged them from A to Z.'],
  boundaries: ['You did not cook anything.'],
  draftText: '',
  draftRevision: 0,
  status: 'DRAFT',
  finalText: null,
  autoSubmitted: false,
};

function Harness({ connection, current = assignment }: { connection: RoomConnection; current?: AssignmentView }) {
  const draft = useDraft({ gameId: 'g', roomId: 'room', assignment: current, connection, connected: true, paused: false });
  return (
    <div>
      <textarea aria-label="post" value={draft.text} onChange={(event) => draft.setText(event.target.value)} />
      <span data-testid="status">{draft.saveStatus}</span>
      <button type="button" onClick={() => void draft.lock()}>
        lock
      </button>
      <span data-testid="message">{draft.message ?? ''}</span>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useDraft', () => {
  it('saves to the phone immediately and to the server after a 400ms debounce', () => {
    const { connection, sent } = fakeConnection();
    render(<Harness connection={connection} />);
    fireEvent.change(screen.getByLabelText('post'), { target: { value: 'Humbled to announce' } });
    expect(window.localStorage.getItem(`larpbox:draft:g:${assignment.id}`)).toContain('Humbled to announce');
    act(() => vi.advanceTimersByTime(399));
    expect(sent).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'writing.saveDraft', payload: { text: 'Humbled to announce', expectedDraftRevision: 0 } });
  });

  it('keeps one save in flight and sends the latest text with the acked revision next', async () => {
    const { connection, sent } = fakeConnection();
    render(<Harness connection={connection} />);
    const box = screen.getByLabelText('post');
    fireEvent.change(box, { target: { value: 'first version' } });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.change(box, { target: { value: 'second version' } });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.change(box, { target: { value: 'third version' } });
    act(() => vi.advanceTimersByTime(400));
    expect(sent).toHaveLength(1);
    await act(async () => sent[0]?.resolve(ok(1)));
    expect(sent).toHaveLength(2);
    expect(sent[1]?.payload).toMatchObject({ text: 'third version', expectedDraftRevision: 1 });
    await act(async () => sent[1]?.resolve(ok(2)));
    expect(screen.getByTestId('status')).toHaveTextContent('saved');
  });

  it('waits for the outstanding save, then locks the complete text at the latest revision', async () => {
    const { connection, sent } = fakeConnection();
    render(<Harness connection={connection} />);
    const box = screen.getByLabelText('post');
    fireEvent.change(box, { target: { value: 'A post that is long enough to lock.' } });
    act(() => vi.advanceTimersByTime(400));
    expect(sent).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'A post that is long enough to lock, edited.' } });
    fireEvent.click(screen.getByText('lock'));
    // The lock does not overtake the in-flight save.
    expect(sent).toHaveLength(1);
    await act(async () => sent[0]?.resolve(ok(1)));
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({
      type: 'writing.lockPost',
      payload: { text: 'A post that is long enough to lock, edited.', expectedDraftRevision: 1 },
    });
    await act(async () => sent[1]?.resolve(ok(2, 'LOCKED')));
    // No stale autosave fires after the lock.
    act(() => vi.advanceTimersByTime(2_000));
    expect(sent).toHaveLength(2);
  });

  it('refuses to lock posts under 20 characters without contacting the server', () => {
    const { connection, sent } = fakeConnection();
    render(<Harness connection={connection} />);
    fireEvent.change(screen.getByLabelText('post'), { target: { value: 'too short' } });
    fireEvent.click(screen.getByText('lock'));
    expect(screen.getByTestId('message')).toHaveTextContent('20 characters minimum.');
    expect(sent.filter((entry) => entry.type === 'writing.lockPost')).toHaveLength(0);
  });

  it('restores unsent text from the phone after a refresh and never overwrites a server lock', () => {
    window.localStorage.setItem(
      `larpbox:draft:g:${assignment.id}`,
      JSON.stringify({ roomId: 'room', text: 'unsent words from before the refresh', lastAckRevision: 0, unsent: true, updatedAt: Date.now(), pendingLock: null }),
    );
    const { connection } = fakeConnection();
    const { unmount } = render(<Harness connection={connection} />);
    expect(screen.getByLabelText('post')).toHaveValue('unsent words from before the refresh');
    unmount();
    const locked: AssignmentView = { ...assignment, status: 'LOCKED', finalText: 'The server copy wins.', draftText: 'The server copy wins.', draftRevision: 3 };
    render(<Harness connection={connection} current={locked} />);
    expect(screen.getByLabelText('post')).toHaveValue('The server copy wins.');
  });
});
