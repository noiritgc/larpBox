import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/global.css';

/**
 * Text limits count grapheme clusters with Intl.Segmenter on both phone and server. Browsers that
 * lack it load a UAX #29 polyfill before any component can count text.
 */
async function ensureSegmenter(): Promise<void> {
  if (typeof Intl.Segmenter !== 'function') {
    await import('@formatjs/intl-segmenter/polyfill-force.js');
  }
}

async function start(): Promise<void> {
  await ensureSegmenter();
  const [{ StrictMode, createElement }, { createRoot }, { App }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./App'),
  ]);
  const container = document.getElementById('root');
  if (!container) throw new Error('Missing #root element');
  createRoot(container).render(createElement(StrictMode, null, createElement(App)));
}

void start();
