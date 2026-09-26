import { Link } from 'react-router-dom';
import { Avatar } from '../components/game/Avatar';
import { Wordmark } from '../components/game/Wordmark';

/** Static explanatory example, not a fake active room. */
function ExamplePost() {
  return (
    <article className="post-card max-w-[560px] rotate-[1deg]" aria-label="Example post">
      <header className="post-head">
        <Avatar id="briefcase" size={56} decorative />
        <div>
          <p className="post-author text-[20px]">Some Guy</p>
          <p className="post-subtitle">Thought Leader · Available Immediately</p>
        </div>
      </header>
      <p className="post-body text-[22px] leading-snug md:text-[26px]">
        Proud to announce I have successfully completed a full cycle of household resource redistribution.
      </p>
      <div>
        <span className="stamp stamp-yellow stamp-in text-[18px] md:text-[22px]">He took out the trash.</span>
      </div>
      <footer className="post-foot" aria-hidden="true">
        <span>1,204 reactions</span>
        <span className="post-foot-agree">Agree?</span>
      </footer>
    </article>
  );
}

export default function Landing() {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1280px] flex-col px-4 pb-8 pt-5 md:px-10">
      <header className="flex items-center justify-between gap-4">
        <Wordmark className="text-[28px] md:text-[34px]" />
        <Link to="/help" className="font-semibold">
          How to play
        </Link>
      </header>
      <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <div className="grid gap-6">
          <p className="eyebrow">A party game about professional exaggeration</p>
          <h1 className="font-display text-[44px] leading-[1.02] tracking-tight md:text-[72px]">
            Tiny achievement. Huge announcement.
          </h1>
          <p className="max-w-[560px] text-[19px] md:text-[21px]">
            Turn everyday nonsense into career milestones. Your friends supply the endorsements.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/host/new" className="btn btn-primary min-w-[200px] text-[20px]" data-testid="host-a-game">
              Host a game
            </Link>
            <Link to="/join" className="btn min-w-[200px] text-[20px]" data-testid="join-a-game">
              Join a game
            </Link>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="At a glance">
            <li className="chip">3–8 players</li>
            <li className="chip">Phones are controllers</li>
            <li className="chip">No accounts</li>
          </ul>
        </div>
        <div className="flex justify-center lg:justify-end">
          <ExamplePost />
        </div>
      </main>
    </div>
  );
}
