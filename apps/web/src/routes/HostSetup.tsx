import { DEFAULT_SETTINGS, estimateRangeMinutes, MAX_PLAYERS, MIN_PLAYERS, type RoomSettings } from '@larpbox/shared';
import { ArrowLeft, ArrowRight, Laptop } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/brand/BrandLogo';
import { SettingsFields } from '../components/host/SettingsFields';
import { Button } from '../components/ui/Button';
import { ChoiceGroup } from '../components/ui/ChoiceGroup';
import { StatusBanner } from '../components/ui/StatusBanner';
import { hostAudio } from '../lib/audio';
import { checkServer, createRoom, HttpFailure } from '../lib/http';
import { uuid } from '../lib/ids';
import { readPrefs, writePrefs } from '../lib/prefs';
import { clearPendingRequest, pendingRequestId, rememberPendingRequest, saveHostCredential } from '../lib/session';

export default function HostSetup() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [prefs, setPrefs] = useState(readPrefs);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<'checking' | 'ok' | 'missing' | 'unreachable'>('checking');
  const range = estimateRangeMinutes(settings);

  useEffect(() => {
    let cancelled = false;
    void checkServer().then((result) => {
      if (!cancelled) setServer(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="page-frame">
      <div className="page-inner">
        <header className="page-header">
          <BrandLogo />
          <Link to="/help" className="page-link">
            How to play
          </Link>
        </header>
        <main className="mx-auto grid w-full max-w-[960px] gap-6">
          <div className="grid gap-3">
            <h1 className="display display-page">
              Host a <span className="accent">networking event.</span>
            </h1>
            <p className="tagline">Bring your laptop. Everyone else brings a phone.</p>
          </div>
          {server === 'missing' ? (
            <StatusBanner tone="red" icon="warning" role="alert">
              <p>This site isn't connected to the Larpbox game server, so rooms can't be created here.</p>
              <p className="mt-1 text-[15px] font-medium">
                The game server serves these pages, the API and the live connections together. A static-only
                deploy (such as a Vercel project pointed at apps/web) can't run games. Deploy the whole app to a
                Node host instead, as described in the README.
              </p>
            </StatusBanner>
          ) : null}
          {server === 'unreachable' ? (
            <StatusBanner tone="amber" icon="offline">
              Can't reach the game server right now. Check your connection, then try creating the room.
            </StatusBanner>
          ) : null}
          <div className="lg:hidden">
            <StatusBanner tone="blue" icon="none">
              <span className="inline-flex items-center gap-2">
                <Laptop size={20} aria-hidden="true" /> For the best experience, host on a laptop or TV.
              </span>
            </StatusBanner>
          </div>
          <section className="card tape panel mt-3 grid gap-6 md:p-7" aria-label="Game settings">
            <SettingsFields value={settings} onChange={setSettings} disabled={creating} />
            <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
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
          {error ? (
            <StatusBanner tone="red" icon="warning" role="alert">
              {error}
            </StatusBanner>
          ) : null}
          <div className="flex flex-col-reverse items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <Link to="/" className="btn" aria-disabled={creating || undefined}>
                <ArrowLeft size={20} aria-hidden="true" /> Back
              </Link>
              <p className="text-[17px] muted" data-testid="setup-summary">
                {MIN_PLAYERS}–{MAX_PLAYERS} players · about {range.min}–{range.max} minutes
              </p>
            </div>
            <Button
              variant="primary"
              loading={creating}
              loadingLabel="Creating room…"
              onClick={create}
              className="min-w-[240px]"
              data-testid="create-room"
            >
              Create room <ArrowRight size={22} aria-hidden="true" />
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
