import { DEFAULT_SETTINGS, MAX_PLAYERS, MIN_PLAYERS, estimateRangeMinutes } from '@larpbox/shared';
import { ArrowRight, ArrowUpRight, ChevronDown, Clock, Smartphone, Tv } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/brand/BrandLogo';
import { PostCard } from '../components/game/PostCard';
import { Sticker } from '../components/game/Sticker';

/** Static explanatory example, not a fake active room: the spec's sample post, poster-sized. */
function HeroPost() {
  return (
    <article className="hero-card tape w-full max-w-[600px]" aria-label="Example post">
      <header className="flex items-center gap-[14px]">
        <span className="hero-avatar" aria-hidden="true">
          <ArrowUpRight size={30} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p className="text-[22px] font-bold leading-tight">Some Guy</p>
          <p className="text-[14px] muted">Thought Leader · Available Immediately</p>
        </div>
      </header>
      <p className="post-body">Proud to announce I have successfully completed a full cycle of household resource redistribution.</p>
      <Sticker placement="hero">He took out the trash.</Sticker>
      <footer className="hero-reactions" aria-hidden="true">
        <span>1,204 reactions</span>
        <span>Agree?</span>
      </footer>
    </article>
  );
}

const STEPS = [
  { title: 'Inflate it.', body: 'Small event. Unreasonably big words.' },
  { title: 'Decode it.', body: 'Guess what actually happened.' },
  { title: 'Endorse it.', body: 'Reward the funniest technically true post.' },
] as const;

// Invented for this page; not an event from the game's prompt pack.
const EXAMPLE_TRUTH = 'Made instant noodles';
const EXAMPLE_OPTIONS = ['Cooked a three-course dinner', EXAMPLE_TRUTH, 'Won a chili cook-off', 'Reheated leftovers'] as const;
const EXAMPLE_POSTS = {
  A: 'Thrilled to share that I delivered a hot, fully hydrated meal to a key stakeholder (me) in under four minutes. Speed matters. #Execution',
  B: "Humbled to announce I've mastered the rapid hydration of carbohydrate-based infrastructure. Grateful to the kettle that believed in me.",
} as const;

export default function Landing() {
  const quick = estimateRangeMinutes({ ...DEFAULT_SETTINGS, roundCount: 1 });
  const standard = estimateRangeMinutes({ ...DEFAULT_SETTINGS, roundCount: 2 });
  const faqs = [
    {
      q: 'Does anyone need an app or an account?',
      a: 'No. The big screen runs in a browser, and players join from their phone browser with a QR code or the four-letter room code.',
    },
    {
      q: 'How long is a game?',
      a: `A quick game (one round) takes about ${quick.min}–${quick.max} minutes and a standard game about ${standard.min}–${standard.max}, depending on how many people play. The host can change timers and how many posts everyone writes.`,
    },
    {
      q: 'Can we play over a video call?',
      a: 'Yes. Share the host screen on the call, and everyone joins on their own phone with the room code.',
    },
    {
      q: 'Does the host play too?',
      a: 'The big screen only shows the game. If you are hosting and want to play, join on your phone like everyone else.',
    },
    {
      q: "What if someone's phone dies or refreshes?",
      a: 'Open the same link again and choose Rejoin. Writing is saved on the phone as you type, and the host can pause while someone reconnects.',
    },
  ] as const;

  return (
    <div className="page-frame">
      <div className="page-inner">
        <header className="page-header">
          <BrandLogo />
          <Link to="/help" className="page-link">
            How to play
          </Link>
        </header>
        <main>
          <section className="hero" aria-labelledby="landing-title">
            <div className="hero-copy">
              <p className="eyebrow">The party game for professional exaggerators</p>
              <h1 id="landing-title" className="display display-hero">
                Tiny achievement. <span className="accent accent-underline">Huge announcement.</span>
              </h1>
              <p className="hero-lede">Turn everyday nonsense into career milestones. Your friends supply the endorsements.</p>
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <Link to="/host/new" className="btn btn-primary min-w-[200px]" data-testid="host-a-game">
                  Host a game <ArrowUpRight size={22} aria-hidden="true" />
                </Link>
                <Link to="/join" className="btn min-w-[200px]" data-testid="join-a-game">
                  Join a game <ArrowRight size={22} aria-hidden="true" />
                </Link>
              </div>
              <ul className="hero-facts" aria-label="At a glance">
                <li>
                  {MIN_PLAYERS}–{MAX_PLAYERS} players
                </li>
                <li>Phones = controllers</li>
                <li>No accounts</li>
              </ul>
            </div>
            <div className="flex justify-center px-2 pt-4 min-[851px]:justify-end">
              <HeroPost />
            </div>
          </section>

          <ol className="grid gap-7 pb-4 pt-10 md:grid-cols-3" aria-label="How it works">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-[14px]">
                <span className="step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="grid gap-1">
                  <h2 className="display text-[28px]">{step.title}</h2>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <section className="landing-section" aria-labelledby="example-title">
            <p className="eyebrow">A post-off</p>
            <h2 id="example-title" className="display display-section">
              Same truth. <span className="accent">Two announcements.</span>
            </h2>
            <p className="max-w-[640px] text-[19px]">
              Both players got the same event. Readers see both posts, anonymous, then guess what really happened.
            </p>
            <div className="grid gap-8 pt-2 lg:grid-cols-2">
              <PostCard side="A" post={{ status: 'POSTED', text: EXAMPLE_POSTS.A }} headingLevel={3} taped />
              <PostCard side="B" post={{ status: 'POSTED', text: EXAMPLE_POSTS.B }} headingLevel={3} taped />
            </div>
            <div className="card panel grid gap-4">
              <h3 className="display text-[28px]">What actually happened?</h3>
              <ul className="grid gap-3 sm:grid-cols-2" aria-label="Guess options">
                {EXAMPLE_OPTIONS.map((option) => (
                  <li key={option} className={`landing-option ${option === EXAMPLE_TRUTH ? 'landing-option-truth' : ''}`}>
                    {option}
                    {option === EXAMPLE_TRUTH ? <Sticker compact>The truth</Sticker> : null}
                  </li>
                ))}
              </ul>
              <p className="hand text-[22px]">Then everyone endorses the post that made the most of it without inventing anything.</p>
            </div>
          </section>

          <section className="landing-section" aria-labelledby="need-title">
            <p className="eyebrow">What you need</p>
            <h2 id="need-title" className="display display-section">
              One screen. A few phones. <span className="accent">No downloads.</span>
            </h2>
            <ul className="grid gap-8 pt-2 md:grid-cols-3">
              <li className="card tape panel grid content-start gap-3">
                <span className="icon-tile" aria-hidden="true">
                  <Tv size={28} />
                </span>
                <h3 className="display text-[26px]">A big screen</h3>
                <p>A TV or laptop everyone can see. It shows the posts, the timer and the scores.</p>
              </li>
              <li className="card tape panel grid content-start gap-3">
                <span className="icon-tile" aria-hidden="true">
                  <Smartphone size={28} />
                </span>
                <h3 className="display text-[26px]">
                  {MIN_PLAYERS}–{MAX_PLAYERS} phones
                </h3>
                <p>Every player writes, guesses and endorses on their own phone. Scan the QR code to join.</p>
              </li>
              <li className="card tape panel grid content-start gap-3">
                <span className="icon-tile" aria-hidden="true">
                  <Clock size={28} />
                </span>
                <h3 className="display text-[26px]">
                  {quick.min}–{standard.max} minutes
                </h3>
                <p>Play one quick round or a standard game of two. Round two is worth double.</p>
              </li>
            </ul>
          </section>

          <section className="landing-section" aria-labelledby="faq-title">
            <p className="eyebrow">Questions</p>
            <h2 id="faq-title" className="display display-section">
              Frequently <span className="accent">asked.</span>
            </h2>
            <div className="grid max-w-[860px] gap-3">
              {faqs.map(({ q, a }) => (
                <details key={q} className="details-panel">
                  <summary>
                    {q} <ChevronDown size={20} aria-hidden="true" className="flex-none" />
                  </summary>
                  <div className="details-content">
                    <p>{a}</p>
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="card tape panel mt-6 grid justify-items-start gap-5 md:p-10" aria-labelledby="cta-title">
            <h2 id="cta-title" className="display display-section">
              Ready to <span className="accent">overstate everything?</span>
            </h2>
            <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
              <Link to="/host/new" className="btn btn-primary min-w-[200px]">
                Host a game <ArrowUpRight size={22} aria-hidden="true" />
              </Link>
              <Link to="/join" className="btn min-w-[200px]">
                Join a game <ArrowRight size={22} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </main>
        <footer className="page-footer">
          <span>Larpbox TV · Make it insane. Keep it true.</span>
          <span className="hand text-[15px] normal-case">Live Laugh LARP</span>
        </footer>
      </div>
    </div>
  );
}
