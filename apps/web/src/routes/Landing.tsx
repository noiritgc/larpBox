import { DEFAULT_SETTINGS, MAX_PLAYERS, MIN_PLAYERS, estimateRangeMinutes } from '@larpbox/shared';
import { ArrowDown, ChevronDown, Clock, Megaphone, Search, Smartphone, ThumbsUp, Tv, WandSparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/game/Avatar';
import { PostCard } from '../components/game/PostCard';
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

const STEPS = [
  {
    icon: WandSparkles,
    title: 'Get a tiny truth',
    body: 'Your phone privately shows something ordinary you "did", like "You made instant noodles."',
  },
  {
    icon: Megaphone,
    title: 'Make it huge',
    body: 'Write it up as a career milestone. Inflate the wording as much as you like. Invent nothing.',
  },
  {
    icon: Search,
    title: 'Spot the truth',
    body: 'Two anonymous posts hit the big screen. Everyone else guesses what actually happened.',
  },
  {
    icon: ThumbsUp,
    title: 'Endorse the best',
    body: 'The truth comes out and the room endorses the post that stayed technically true. Endorsements are Clout.',
  },
] as const;

// Invented for this page; not an event from the game's prompt pack.
const EXAMPLE_TRUTH = 'Made instant noodles';
const EXAMPLE_OPTIONS = ['Cooked a three-course dinner', EXAMPLE_TRUTH, 'Won a chili cook-off', 'Reheated leftovers'] as const;
const EXAMPLE_POSTS = {
  A: "Thrilled to share that I delivered a hot, fully hydrated meal to a key stakeholder (me) in under four minutes. Speed matters. #Execution",
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
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-10 pt-5 md:px-10">
      <header className="flex items-center justify-between gap-4">
        <Wordmark className="text-[32px] md:text-[44px]" />
        <Link to="/help" className="font-semibold">
          How to play
        </Link>
      </header>
      <main>
        <section
          className="grid items-center gap-10 py-10 lg:min-h-[calc(100dvh-150px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16"
          aria-labelledby="landing-title"
        >
          <div className="grid gap-6">
            <p className="eyebrow">A party game about professional exaggeration</p>
            <h1 id="landing-title" className="font-display text-[44px] leading-[1.02] tracking-tight md:text-[72px]">
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
            <a href="#how-it-works" className="landing-scroll-cue hidden lg:inline-flex">
              <ArrowDown size={18} aria-hidden="true" /> See how a round works
            </a>
          </div>
          <div className="flex justify-center lg:justify-end">
            <ExamplePost />
          </div>
        </section>

        <section id="how-it-works" className="landing-section" aria-labelledby="how-title">
          <p className="eyebrow">How a round works</p>
          <h2 id="how-title" className="landing-h2">
            Four steps from nothing to thought leadership.
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="card grid content-start gap-3 p-5">
                <span className="icon-tile" aria-hidden="true">
                  <Icon size={26} />
                </span>
                <h3 className="font-display text-[22px] leading-tight">
                  <span className="muted">{index + 1}.</span> {title}
                </h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" aria-labelledby="example-title">
          <p className="eyebrow">A post-off</p>
          <h2 id="example-title" className="landing-h2">
            Same truth. Two announcements.
          </h2>
          <p className="max-w-[640px] text-[19px]">
            Both players got the same event. Readers see both posts, anonymous, then guess what really happened.
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            <PostCard side="A" post={{ status: 'POSTED', text: EXAMPLE_POSTS.A }} headingLevel={3} />
            <PostCard side="B" post={{ status: 'POSTED', text: EXAMPLE_POSTS.B }} headingLevel={3} />
          </div>
          <div className="card grid gap-3 p-5">
            <h3 className="font-display text-[22px]">What actually happened?</h3>
            <ul className="grid gap-2 sm:grid-cols-2" aria-label="Guess options">
              {EXAMPLE_OPTIONS.map((option) => (
                <li key={option} className={`landing-option ${option === EXAMPLE_TRUTH ? 'landing-option-truth' : ''}`}>
                  {option}
                  {option === EXAMPLE_TRUTH ? <span className="stamp stamp-yellow text-[14px]">The truth</span> : null}
                </li>
              ))}
            </ul>
            <p className="font-semibold">Then everyone endorses the post that made the most of it without inventing anything.</p>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="need-title">
          <p className="eyebrow">What you need</p>
          <h2 id="need-title" className="landing-h2">
            One screen, a few phones, no downloads.
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            <li className="card grid content-start gap-2 p-5">
              <Tv size={30} aria-hidden="true" />
              <h3 className="font-display text-[22px]">A big screen</h3>
              <p>A TV or laptop everyone can see. It shows the posts, the timer and the scores.</p>
            </li>
            <li className="card grid content-start gap-2 p-5">
              <Smartphone size={30} aria-hidden="true" />
              <h3 className="font-display text-[22px]">
                {MIN_PLAYERS}–{MAX_PLAYERS} phones
              </h3>
              <p>Every player writes, guesses and endorses on their own phone. Scan the QR code to join.</p>
            </li>
            <li className="card grid content-start gap-2 p-5">
              <Clock size={30} aria-hidden="true" />
              <h3 className="font-display text-[22px]">
                {quick.min}–{standard.max} minutes
              </h3>
              <p>Play one quick round or a standard game of two. Round two is worth double.</p>
            </li>
          </ul>
        </section>

        <section className="landing-section" aria-labelledby="faq-title">
          <p className="eyebrow">Questions</p>
          <h2 id="faq-title" className="landing-h2">
            Frequently asked
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

        <section className="landing-section landing-cta card p-6 md:p-10" aria-labelledby="cta-title">
          <h2 id="cta-title" className="landing-h2">
            Ready to overstate everything?
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/host/new" className="btn btn-primary min-w-[200px] text-[20px]">
              Host a game
            </Link>
            <Link to="/join" className="btn min-w-[200px] text-[20px]">
              Join a game
            </Link>
          </div>
        </section>
      </main>
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink pt-5 text-[15px]">
        <span>Larpbox TV. A party game about professional exaggeration.</span>
        <Link to="/help" className="font-semibold">
          Full rules
        </Link>
      </footer>
    </div>
  );
}
