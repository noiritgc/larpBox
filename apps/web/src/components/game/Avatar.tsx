import { AVATAR_LABELS, type AvatarId } from '@larpbox/shared';
import type { ReactNode } from 'react';

/** Original flat two-color silhouettes. Color and icon both identify an avatar. */
const PALETTE: Record<AvatarId | 'anonymous', { bg: string; fg: string }> = {
  briefcase: { bg: '#1747E7', fg: '#FFFFFF' },
  coffee: { bg: '#E9FF70', fg: '#171717' },
  ladder: { bg: '#FFC9B5', fg: '#171717' },
  trophy: { bg: '#166534', fg: '#E9FF70' },
  necktie: { bg: '#B42318', fg: '#FFFFFF' },
  spreadsheet: { bg: '#EAF0FF', fg: '#1747E7' },
  plant: { bg: '#C9F2D4', fg: '#166534' },
  stamp: { bg: '#171717', fg: '#E9FF70' },
  rocket: { bg: '#FFB547', fg: '#171717' },
  megaphone: { bg: '#7C3AED', fg: '#FFFFFF' },
  laptop: { bg: '#D9D4C7', fg: '#171717' },
  lightbulb: { bg: '#1E3A8A', fg: '#FFD84D' },
  chart: { bg: '#0F766E', fg: '#FFFFFF' },
  sunglasses: { bg: '#FF8FB1', fg: '#171717' },
  crown: { bg: '#FFD84D', fg: '#171717' },
  badge: { bg: '#FDE2E4', fg: '#B42318' },
  anonymous: { bg: '#E4E1D8', fg: '#595B62' },
};

function glyph(id: AvatarId | 'anonymous', bg: string): ReactNode {
  switch (id) {
    case 'briefcase':
      return (
        <>
          <path d="M9 7.5V5.8c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3v1.7h-1.8V6.3h-2.4v1.2Z" />
          <rect x="3.5" y="7.5" width="17" height="11.5" rx="1.8" />
          <rect x="3.5" y="11.6" width="17" height="1.3" fill={bg} />
          <rect x="10.8" y="10.8" width="2.4" height="2.9" rx=".6" />
        </>
      );
    case 'coffee':
      return (
        <>
          <rect x="7.6" y="2.8" width="1.5" height="4" rx=".75" />
          <rect x="11" y="2.8" width="1.5" height="4" rx=".75" />
          <path d="M4.5 8.5h11.5v6.6a4.4 4.4 0 0 1-4.4 4.4H8.9a4.4 4.4 0 0 1-4.4-4.4Z" />
          <path d="M16 9.8h1.4a2.8 2.8 0 0 1 0 5.6H16v-1.7h1.4a1.1 1.1 0 0 0 0-2.2H16Z" />
          <rect x="3.5" y="20" width="14" height="1.5" rx=".75" />
        </>
      );
    case 'ladder':
      return (
        <>
          <rect x="6" y="2.5" width="2.2" height="19" rx="1.1" />
          <rect x="15.8" y="2.5" width="2.2" height="19" rx="1.1" />
          <rect x="8" y="5.6" width="8" height="1.9" />
          <rect x="8" y="10" width="8" height="1.9" />
          <rect x="8" y="14.4" width="8" height="1.9" />
          <rect x="8" y="18.8" width="8" height="1.9" />
        </>
      );
    case 'trophy':
      return (
        <>
          <path d="M7 3.5h10v5.5a5 5 0 0 1-10 0Z" />
          <path d="M3.8 4.5H7v1.7H5.5v.6a2.3 2.3 0 0 0 1.9 2.3l-.3 1.7A4 4 0 0 1 3.8 6.8Z" />
          <path d="M20.2 4.5H17v1.7h1.5v.6a2.3 2.3 0 0 1-1.9 2.3l.3 1.7a4 4 0 0 0 3.3-4Z" />
          <rect x="10.9" y="13.5" width="2.2" height="3.6" />
          <rect x="7.5" y="17" width="9" height="3.5" rx="1" />
        </>
      );
    case 'necktie':
      return (
        <>
          <path d="M8.6 2.5h6.8l-1.6 4.2h-3.6Z" />
          <path d="M10.3 7.4h3.4l2.4 10.1-4.1 4.5-4.1-4.5Z" />
        </>
      );
    case 'spreadsheet':
      return (
        <>
          <rect x="3.5" y="4" width="17" height="16" rx="1.6" />
          <rect x="3.5" y="8.4" width="17" height="1.3" fill={bg} />
          <rect x="3.5" y="12.3" width="17" height="1.3" fill={bg} />
          <rect x="3.5" y="16.2" width="17" height="1.3" fill={bg} />
          <rect x="9" y="4" width="1.3" height="16" fill={bg} />
          <rect x="14.6" y="4" width="1.3" height="16" fill={bg} />
        </>
      );
    case 'plant':
      return (
        <>
          <rect x="11.3" y="6.5" width="1.4" height="7" />
          <path d="M11.4 10.4C7.8 10.6 5.3 8.5 5 4.8c3.6.2 6.1 2.2 6.4 5.6Z" />
          <path d="M12.6 8.8c.4-3.3 2.9-5.3 6.4-5.5-.2 3.6-2.8 5.6-6.4 5.5Z" />
          <rect x="6" y="12.6" width="12" height="2.4" rx=".8" />
          <path d="M7.2 15h9.6l-1.2 5.5a1.3 1.3 0 0 1-1.3 1H9.7a1.3 1.3 0 0 1-1.3-1Z" />
        </>
      );
    case 'stamp':
      return (
        <>
          <circle cx="12" cy="5.4" r="2.7" />
          <path d="M10.3 7.6h3.4l.9 5h-5.2Z" />
          <rect x="4.8" y="12.5" width="14.4" height="4.2" rx="1.2" />
          <rect x="4" y="18.3" width="16" height="2.2" rx="1.1" />
        </>
      );
    case 'rocket':
      return (
        <>
          <path d="M12 2.5c3 2 4.5 5.3 4.5 9.2V16h-9v-4.3c0-3.9 1.5-7.2 4.5-9.2Z" />
          <circle cx="12" cy="9.4" r="1.8" fill={bg} />
          <path d="M7.5 11.8 4.4 15.3v3.2l3.1-1.7Z" />
          <path d="M16.5 11.8l3.1 3.5v3.2l-3.1-1.7Z" />
          <path d="M10 17h4l-.9 3.2L12 21.8l-1.1-1.6Z" />
        </>
      );
    case 'megaphone':
      return (
        <>
          <path d="M3.5 9.8h3.2l8.8-4.8v14l-8.8-4.8H3.5Z" />
          <path d="M6.9 14.6h2.5l1.1 4.9H8.1Z" />
          <rect x="17.8" y="11.2" width="3.4" height="1.6" rx=".8" />
          <path d="M17.6 7.6l2.7-1.6.8 1.4-2.7 1.6Z" />
          <path d="M17.6 16.4l2.7 1.6.8-1.4-2.7-1.6Z" />
        </>
      );
    case 'laptop':
      return (
        <>
          <rect x="5" y="4.5" width="14" height="10.5" rx="1.2" />
          <rect x="6.6" y="6.1" width="10.8" height="7.3" rx=".4" fill={bg} />
          <path d="M2.5 16.4h19l-1.2 2.4a1.4 1.4 0 0 1-1.2.7H4.9a1.4 1.4 0 0 1-1.2-.7Z" />
        </>
      );
    case 'lightbulb':
      return (
        <>
          <path d="M12 2.6a6.2 6.2 0 0 1 3.7 11.2c-.6.5-.9 1.1-.9 1.8v.9H9.2v-.9c0-.7-.3-1.3-.9-1.8A6.2 6.2 0 0 1 12 2.6Z" />
          <rect x="9.2" y="17.5" width="5.6" height="1.6" rx=".5" />
          <rect x="9.8" y="19.7" width="4.4" height="1.7" rx=".85" />
        </>
      );
    case 'chart':
      return (
        <>
          <rect x="3.8" y="13.6" width="3.6" height="6.9" rx=".6" />
          <rect x="10.2" y="9.4" width="3.6" height="11.1" rx=".6" />
          <rect x="16.6" y="4.4" width="3.6" height="16.1" rx=".6" />
          <rect x="2.5" y="20.5" width="19" height="1.4" rx=".7" />
        </>
      );
    case 'sunglasses':
      return (
        <>
          <rect x="2" y="8" width="20" height="1.8" rx=".9" />
          <path d="M2.6 9h8v2.8a3.4 3.4 0 0 1-3.4 3.4H6a3.4 3.4 0 0 1-3.4-3.4Z" />
          <path d="M13.4 9h8v2.8a3.4 3.4 0 0 1-3.4 3.4h-1.2a3.4 3.4 0 0 1-3.4-3.4Z" />
          <rect x="10.2" y="9.6" width="3.6" height="1.5" />
        </>
      );
    case 'crown':
      return (
        <>
          <path d="M3.4 7.6l4.4 3.7L12 4.6l4.2 6.7 4.4-3.7-1.7 10H5.1Z" />
          <rect x="5" y="18.8" width="14" height="2.2" rx=".7" />
        </>
      );
    case 'badge':
      return (
        <>
          <path d="M7.6 2.5h2.2l2.2 5 2.2-5h2.2l-3.3 7.1h-2.2Z" />
          <rect x="5.2" y="9" width="13.6" height="12.5" rx="1.6" />
          <circle cx="12" cy="13.4" r="2.1" fill={bg} />
          <rect x="8.4" y="17.2" width="7.2" height="1.4" rx=".7" fill={bg} />
        </>
      );
    case 'anonymous':
      return (
        <>
          <circle cx="12" cy="8.6" r="4.1" />
          <path d="M4.4 21c.6-4.3 3.8-6.9 7.6-6.9s7 2.6 7.6 6.9Z" />
        </>
      );
  }
}

export function Avatar({
  id,
  size = 48,
  label,
  decorative = false,
}: {
  id: AvatarId | 'anonymous';
  size?: number;
  /** Accessible name; defaults to the avatar's description. */
  label?: string;
  /** Hide from assistive tech when the adjacent text already names the person. */
  decorative?: boolean;
}) {
  const colors = PALETTE[id];
  const name = label ?? (id === 'anonymous' ? 'Anonymous professional' : AVATAR_LABELS[id]);
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: colors.bg, borderRadius: Math.round(size * 0.28) }}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
    >
      <svg viewBox="0 0 24 24" fill={colors.fg} xmlns="http://www.w3.org/2000/svg" focusable="false">
        {glyph(id, colors.bg)}
      </svg>
    </span>
  );
}
