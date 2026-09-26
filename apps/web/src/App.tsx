import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LoadingBlock } from './components/common/SystemScreens';
import { AnnouncerProvider } from './components/ui/Announcer';
import { applyMotionPreference, readPrefs } from './lib/prefs';
import { purgeStaleEntries } from './lib/session';
import JoinRoom from './routes/JoinRoom';
import Landing from './routes/Landing';
import NotFound from './routes/NotFound';

// Phones never download the host display code (and vice versa).
const HostSetup = lazy(() => import('./routes/HostSetup'));
const HostRoom = lazy(() => import('./routes/HostRoom'));
const Controller = lazy(() => import('./routes/Controller'));
const Help = lazy(() => import('./routes/Help'));
// Compiled out of production builds entirely (see vite.config.ts).
const ScenarioGallery = __LARPBOX_DEVTOOLS__ ? lazy(() => import('./dev/ScenarioGallery')) : null;

export function App() {
  useEffect(() => {
    purgeStaleEntries();
    applyMotionPreference(readPrefs().motion);
  }, []);

  return (
    <AnnouncerProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingBlock label="Loading…" />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/host/new" element={<HostSetup />} />
            <Route path="/host/:code" element={<HostRoom />} />
            <Route path="/join" element={<JoinRoom />} />
            <Route path="/join/:code" element={<JoinRoom />} />
            <Route path="/play/:code" element={<Controller />} />
            <Route path="/help" element={<Help />} />
            {ScenarioGallery ? <Route path="/dev" element={<ScenarioGallery />} /> : null}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AnnouncerProvider>
  );
}
