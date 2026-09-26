import { Link } from 'react-router-dom';
import { Wordmark } from '../components/game/Wordmark';
import { SCORING_SUMMARY, TUTORIAL_EXAMPLE, TUTORIAL_RULE, TUTORIAL_STEPS } from '../content/tutorial';

export default function Help() {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[760px] flex-col gap-6 px-4 pb-12 pt-5">
      <header>
        <Wordmark />
      </header>
      <main className="grid gap-8">
        <h1 className="font-display text-[40px] leading-[1.05]">How to play</h1>
        <section className="grid gap-3" aria-labelledby="steps">
          <h2 id="steps" className="text-[26px]">
            Three steps
          </h2>
          <ol className="grid gap-3">
            {TUTORIAL_STEPS.map((step, index) => (
              <li key={step.title} className="card grid gap-1 p-4">
                <span className="font-display text-[22px] font-bold">
                  {index + 1}. {step.title}
                </span>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
          <div className="card grid gap-2 p-4">
            <p className="eyebrow">Example</p>
            <p>
              <strong>What happened:</strong> {TUTORIAL_EXAMPLE.fact}
            </p>
            <p>
              <strong>The post:</strong> “{TUTORIAL_EXAMPLE.post}”
            </p>
            <p className="font-display font-bold">{TUTORIAL_RULE}</p>
          </div>
        </section>
        <section className="grid gap-3" aria-labelledby="scoring">
          <h2 id="scoring" className="text-[26px]">
            Scoring (Clout)
          </h2>
          <ul className="facts-list">
            {SCORING_SUMMARY.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section className="grid gap-3" aria-labelledby="setup">
          <h2 id="setup" className="text-[26px]">
            Setting up
          </h2>
          <ul className="facts-list">
            <li>One laptop or TV opens the big screen with “Host a game”. It shows the posts but never scores.</li>
            <li>Everyone plays on their own phone, including the host: join on a separate phone.</li>
            <li>Nobody needs an account or an app. 3–8 players.</li>
            <li>The host controls pauses. If someone needs a minute, ask the host to pause.</li>
          </ul>
        </section>
        <section className="grid gap-3" aria-labelledby="trouble">
          <h2 id="trouble" className="text-[26px]">
            Connection trouble
          </h2>
          <ul className="facts-list">
            <li>Check the four-letter room code on the big screen.</li>
            <li>Playing on local Wi-Fi? Stay on the same network as the big screen.</li>
            <li>Refreshed or dropped out? Open the same link again and choose “Rejoin” instead of joining as a new player.</li>
            <li>Writing is saved on your phone as you type, so a quick reconnect won't lose your post.</li>
          </ul>
        </section>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/" className="btn">
            Home
          </Link>
          <Link to="/join" className="btn btn-primary">
            Join a room
          </Link>
        </div>
      </main>
    </div>
  );
}
