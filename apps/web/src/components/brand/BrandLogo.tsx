import { Link } from 'react-router-dom';
import logo from '../../assets/brand/larpbox-logo.png';

/**
 * The supplied LARPbox TV logo, unchanged: 1090x519 with its own white background, which sits on
 * the white pages. Width comes from CSS (`header` 166px, `compact` 116px; smaller on phones) and the
 * height follows the file's aspect ratio. It is the only logo on any page.
 */
export function BrandLogo({ size = 'header', link = true, className = '' }: { size?: 'header' | 'compact'; link?: boolean; className?: string }) {
  const classes = ['brand-logo', size === 'compact' ? 'brand-logo-compact' : '', className].filter(Boolean).join(' ');
  const image = <img src={logo} width={1090} height={519} alt="Larpbox TV" draggable={false} />;
  if (!link) return <span className={classes}>{image}</span>;
  return (
    <Link to="/" className={classes} aria-label="Larpbox TV home">
      {image}
    </Link>
  );
}
