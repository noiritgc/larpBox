import { Link } from 'react-router-dom';
import logo480 from '../../assets/brand/larpbox-logo-480.webp';
import logo1040 from '../../assets/brand/larpbox-logo-1040.webp';

/**
 * The Larpbox TV logo. Its height follows the element's font size (see `.wordmark`), so existing
 * size classes keep working; `large` adds a high-resolution source for hero-sized placements.
 */
export function Wordmark({ link = true, large = false, className = '' }: { link?: boolean; large?: boolean; className?: string }) {
  const image = (
    <img
      src={logo480}
      srcSet={large ? `${logo480} 480w, ${logo1040} 1040w` : undefined}
      sizes={large ? '(min-width: 768px) 420px, 70vw' : undefined}
      width={480}
      height={206}
      alt={link ? '' : 'Larpbox TV'}
      draggable={false}
    />
  );
  if (!link) {
    return <span className={`wordmark ${className}`}>{image}</span>;
  }
  return (
    <Link to="/" className={`wordmark ${className}`} aria-label="Larpbox TV home">
      {image}
    </Link>
  );
}
