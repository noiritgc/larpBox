import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PostCard } from './PostCard';

describe('PostCard', () => {
  it('renders HTML-looking text as plain text and keeps line breaks', () => {
    const text = '<img src=x onerror=alert(1)> Proud to announce\n<b>bold claims</b>';
    const { container } = render(<PostCard side="A" post={{ status: 'POSTED', text }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('.post-body')?.textContent).toBe(text);
  });

  it('gives anonymous A and B cards identical, author-free metadata', () => {
    render(
      <>
        <PostCard side="A" post={{ status: 'POSTED', text: 'First post, suitably inflated.' }} />
        <PostCard side="B" post={{ status: 'POSTED', text: 'Second post, equally inflated.' }} />
      </>,
    );
    const [a, b] = screen.getAllByRole('article');
    for (const card of [a, b]) {
      if (!card) throw new Error('missing card');
      expect(within(card).getByText('Anonymous professional')).toBeInTheDocument();
      expect(within(card).getByText('Proud to share an update')).toBeInTheDocument();
    }
    expect(a?.querySelector('.post-head')?.innerHTML.replace('Post A', 'Post X')).toBe(
      b?.querySelector('.post-head')?.innerHTML.replace('Post B', 'Post X'),
    );
  });

  it('shows the absence card for a forfeited post', () => {
    render(<PostCard side="B" post={{ status: 'FORFEIT' }} />);
    expect(screen.getByText('This professional had nothing to announce.')).toBeInTheDocument();
  });

  it('shows the real author only when one is revealed', () => {
    render(<PostCard side="A" post={{ status: 'POSTED', text: 'A revealed post.' }} author={{ name: 'Alex', avatarId: 'coffee', headline: 'Founder · Details Coming Soon' }} />);
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.queryByText('Anonymous professional')).toBeNull();
  });
});
