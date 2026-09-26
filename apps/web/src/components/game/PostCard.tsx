import type { AvatarId, PostView, Side } from '@larpbox/shared';
import { Lightbulb, PartyPopper, ThumbsUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from './Avatar';

export interface RevealedAuthor {
  name: string;
  avatarId: AvatarId;
  headline: string;
}

/**
 * A professional announcement. Before RESULT both cards are geometrically and textually identical
 * apart from the A/B label and the body: same neutral avatar, same "Anonymous professional", same
 * subtitle, no timestamps. Body text keeps line breaks, wraps long strings and renders as text.
 */
export function PostCard({
  side,
  post,
  author = null,
  size = 'phone',
  mine = false,
  stamp = null,
  footer = null,
  headingLevel = 3,
}: {
  side: Side;
  post: PostView;
  author?: RevealedAuthor | null;
  size?: 'host' | 'phone';
  mine?: boolean;
  stamp?: ReactNode;
  footer?: ReactNode;
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const absent = post.status === 'FORFEIT';
  const avatarSize = size === 'host' ? 60 : 44;
  return (
    <article
      className={`post-card ${absent ? 'post-card-absent' : ''} ${mine ? 'post-card-mine' : ''}`}
      aria-label={`Post ${side}${author ? ` by ${author.name}` : ''}`}
    >
      <span className="post-side" aria-hidden="true">
        {side}
      </span>
      <header className="post-head">
        <Avatar id={author ? author.avatarId : 'anonymous'} size={avatarSize} decorative />
        <div className="min-w-0">
          <Heading className="post-author font-body">
            <span className="sr-only">Post {side}: </span>
            {author ? author.name : 'Anonymous professional'}
          </Heading>
          <p className="post-subtitle">{author ? author.headline : 'Proud to share an update'}</p>
        </div>
      </header>
      {absent ? (
        <p className="post-body">This professional had nothing to announce.</p>
      ) : (
        <p className="post-body">{post.text}</p>
      )}
      {stamp ? <div className="flex flex-wrap gap-3">{stamp}</div> : null}
      <footer className="post-foot" aria-hidden="true">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp size={size === 'host' ? 22 : 16} />
          <PartyPopper size={size === 'host' ? 22 : 16} />
          <Lightbulb size={size === 'host' ? 22 : 16} />
        </span>
        {footer}
        <span className="post-foot-agree">Agree?</span>
      </footer>
    </article>
  );
}
