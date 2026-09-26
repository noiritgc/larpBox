import { DEFAULT_SETTINGS, estimateRangeMinutes, MAX_PLAYERS, MIN_PLAYERS, type RoomSettings } from '@larpbox/shared';
import { ArrowLeft, Laptop } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wordmark } from '../components/game/Wordmark';
import { SettingsFields } from '../components/host/SettingsFields';
import { Button } from '../components/ui/Button';
import { ChoiceGroup } from '../components/ui/ChoiceGroup';
import { StatusBanner } from '../components/ui/StatusBanner';
import { hostAudio } from '../lib/audio';
import { createRoom, HttpFailure } from '../lib/http';
import { uuid } from '../lib/ids';
import { readPrefs, writePrefs } from '../lib/prefs';
import { clearPendingRequest, pendingRequestId, rememberPendingRequest, saveHostCredential } from '../lib/session';

export default function HostSetup() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [prefs, setPrefs] = useState(readPrefs);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range = estimateRangeMinutes(settings);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    // Creating the room is the host's audio-unlock gesture.
    if (prefs.sound) hostAudio.unlock();
    const bodyKey = JSON.stringify(settings);
    const requestId = pendingRequestId('create', bodyKey) ?? uuid();
    rememberPendingRequest('create', requestId, bodyKey);
    try {
      const room = await createRoom(requestId, settings);
      saveHostCredential({ roomId: room.roomId, roomCode: room.roomCode, token: room.hostToken, createdAt: Date.now() });
      clearPendingRequest('create');
      navigate(`/host/${room.roomCode}`, { replace: true });
    } catch (failure) {
      // After a network failure the room may exist with its response lost: the next deliberate
      // click reuses the same request ID. An API refusal gets a fresh ID next time.
      if (!(failure instanceof HttpFailure) || failure.kind === 'api') clearPendingRequest('create');
      setError(
        failure instanceof HttpFailure
          ? failure.code === 'RATE_LIMITED'
            ? `Too many rooms from this network. Try again in ${Math.ceil((failure.details.retryAfterMs ?? 60_000) / 60_000)} minutes.`
            : failure.message
          : 'Something went wrong. Try again.',
      );
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[760px] flex-col gap-6 px-4 pb-10 pt-5">
      <header className="flex items-center justify-between">
        <Wordmark />
      </header>
      <main className="grid gap-6">
        <h1 className="font-display text-[36px] leading-[1.05] md:text-[48px]">Let's make this a networking event.</h1>
        <div className="lg:hidden">
          <StatusBanner tone="blue" icon="none">
            <span className="inline-flex items-center gap-2">
              <Laptop size={20} aria-hidden="true" /> For the best experience, host on a laptop or TV.
            </span>
          </StatusBanner>
        </div>
        <section className="card grid gap-6 p-5 md:p-7" aria-label="Game settings">
          <SettingsFields value={settings} onChange={setSettings} disabled={creating} />
          <div className="grid gap-5 border-t-2 border-ink pt-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <p className="font-bold">Big-screen sound</p>
              <ChoiceGroup
                label="Big-screen sound"
                layout="segmented"
                value={prefs.sound ? 'on' : 'off'}
                onChange={(value) => {
                  hostAudio.setEnabled(value === 'on');
                  setPrefs(writePrefs({ sound: value === 'on' }));
                }}
                choices={[
                  { value: 'on', label: 'On' },
                  { value: 'off', label: 'Off' },
                ]}
              />
            </div>
            <div className="grid gap-2">
              <p className="font-bold">Reduced motion</p>
              <ChoiceGroup
                label="Reduced motion"
                layout="segmented"
                value={prefs.motion}
                onChange={(motion) => setPrefs(writePrefs({ motion }))}
                choices={[
                  { value: 'system', label: 'System' },
                  { value: 'reduced', label: 'On' },
                ]}
              />
            </div>
          </div>
        </section>
        <p className="text-[18px] font-semibold" data-testid="setup-summary">
          {MIN_PLAYERS}–{MAX_PLAYERS} players · about {range.min}–{range.max} minutes
        </p>
        {error ? (
          <StatusBanner tone="red" icon="warning" role="alert">
            {error}
          </StatusBanner>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Link to="/" className="btn" aria-disabled={creating || undefined}>
            <ArrowLeft size={20} aria-hidden="true" /> Back
          </Link>
          <Button variant="primary" loading={creating} loadingLabel="Preparing the room…" onClick={create} className="min-w-[240px]" data-testid="create-room">
            Create room
          </Button>
        </div>
      </main>
    </div>
  );
}
