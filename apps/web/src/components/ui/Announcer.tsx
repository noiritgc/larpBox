import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Announce = (message: string) => void;

const AnnouncerContext = createContext<Announce>(() => {});

/**
 * One polite live region for phase changes and confirmed actions. It is not used for timer ticks
 * (only the single ten-seconds-left warning).
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const toggle = useRef(false);
  const announce = useCallback<Announce>((next) => {
    // Alternate a trailing no-break space so repeating the same text is still announced.
    toggle.current = !toggle.current;
    setMessage(`${next}${toggle.current ? '' : '\u00a0'}`);
  }, []);
  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnounce(): Announce {
  return useContext(AnnouncerContext);
}
