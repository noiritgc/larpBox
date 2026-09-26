import { Link } from 'react-router-dom';

export function Wordmark({ link = true, className = '' }: { link?: boolean; className?: string }) {
  const content = (
    <>
      <span>larpbox</span>
      <span className="wordmark-tv" aria-hidden="true">
        TV
      </span>
      <span className="sr-only"> TV</span>
    </>
  );
  if (!link) {
    return <span className={`wordmark ${className}`}>{content}</span>;
  }
  return (
    <Link to="/" className={`wordmark ${className}`} aria-label="Larpbox TV home">
      {content}
    </Link>
  );
}
