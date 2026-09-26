import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/brand/BrandLogo';
import { Sticker } from '../components/game/Sticker';
import { SCORING_SUMMARY, TUTORIAL_EXAMPLE, TUTORIAL_RULE, TUTORIAL_STEPS } from '../content/tutorial';

const ROUND_TWO_LINE = 'Round 2 doubles everything.';

export default function Help() {
  return (
    <div className="page-frame">
      <div className="page-inner">
        <header className="page-header">
          <BrandLogo />
          <Link to="/" className="page-link">
            Home
          </Link>
        </header>
        <main className="grid gap-10">
          <div className="grid gap-3">
            <h1 className="display display-page">
              How to <span className="accent accent-underline">LARP.</span>
            </h1>
            <p className="tagline">Make it insane. Keep it true.</p>
          </div>

          <section aria-labelledby="steps">
            <h2 id="steps" className="sr-only">
              Three steps
            </h2>
            <ol className="grid gap-8 pt-3 md:grid-cols-3">
              {TUTORIAL_STEPS.map((step, index) => (
                <li key={step.title} className="card tape panel grid content-start gap-3">
                  <span className="step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className="display accent text-[28px]">{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <section className="card panel grid content-start gap-4" aria-labelledby="scoring">
              <h2 id="scoring" className="display display-card">
                Clout, explained.
              </h2>
              <ul className="facts-list">
                {SCORING_SUMMARY.filter((line) => line !== ROUND_TWO_LINE).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div>
                <Sticker placement="card" compact>
                  {ROUND_TWO_LINE}
                </Sticker>
              </div>
            </section>
            <section className="card panel grid content-start gap-4" aria-labelledby="setup">
              <h2 id="setup" className="display display-card">
                Get everyone in.
              </h2>
              <ul className="facts-list">
                <li>One laptop or TV opens the big screen with “Host a game”. It shows the posts but never scores.</li>
                <li>Everyone plays on their own phone, including the host: join on a separate phone.</li>
                <li>Nobody needs an account or an app. 3–8 players.</li>
                <li>
                  The host picks one or two posts per player. With one each and an odd number of players, one person sits out
                  each round and judges every post-off instead.
                </li>
                <li>The host controls pauses. If someone needs a minute, ask the host to pause.</li>
              </ul>
            </section>
            <section className="card panel grid content-start gap-4" aria-labelledby="example">
              <h2 id="example" className="display display-card">
                For example.
              </h2>
              <p>
                <strong>What happened:</strong> {TUTORIAL_EXAMPLE.fact}
              </p>
              <p className="post-body text-[20px]">“{TUTORIAL_EXAMPLE.post}”</p>
              <p className="hand text-[22px] accent">{TUTORIAL_RULE}</p>
            </section>
            <section className="card panel grid content-start gap-4" aria-labelledby="trouble">
              <h2 id="trouble" className="display display-card">
                Connection trouble?
              </h2>
              <ul className="facts-list">
                <li>Check the four-letter room code on the big screen.</li>
                <li>Playing on local Wi-Fi? Stay on the same network as the big screen.</li>
                <li>Refreshed or dropped out? Open the same link again and choose “Rejoin” instead of joining as a new player.</li>
                <li>Writing is saved on your phone as you type, so a quick reconnect won't lose your post.</li>
              </ul>
            </section>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Link to="/" className="btn">
              Home
            </Link>
            <Link to="/join" className="btn btn-primary">
              Join a room
            </Link>
          </div>
        </main>
        <footer className="page-footer">
          <span>Larpbox TV · Make it insane. Keep it true.</span>
          <span className="hand text-[15px] normal-case">Live Laugh LARP</span>
        </footer>
      </div>
    </div>
  );
}
