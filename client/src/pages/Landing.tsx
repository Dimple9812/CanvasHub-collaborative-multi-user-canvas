import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../components/ui/Logo";
import { Button } from "../components/ui/Button";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";

export default function Landing() {
  const demo = useAuth((s) => s.demo);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const tryIt = async () => {
    setBusy(true);
    setError("");
    try {
      await demo();
      const [first] = await api.boards();
      navigate(first ? `/b/${first.id}` : "/boards");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/login" className="rounded-md px-3 py-2 font-semibold hover:bg-ink/5">Sign in</Link>
          <Link to="/signup" className="hidden rounded-md border border-line bg-white px-3 py-2 font-semibold hover:border-slate/50 sm:inline-block">
            Create account
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-6 lg:grid-cols-[1fr_1.15fr] lg:pt-14">
        <section>
          <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
            Sketch it out together, live.
          </h1>
          <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-slate">
            CanvasHub is a shared whiteboard. Everyone on the board sees each shape, sticky note and cursor as it moves, and
            edits made offline merge in when you reconnect.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={tryIt} disabled={busy}>
              {busy ? "Setting up your board…" : "Try a board — no sign-up"}
            </Button>
            <Link to="/signup" className="rounded-md px-4 py-3 font-semibold text-ink hover:bg-ink/5">
              Create an account
            </Link>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          <p className="mt-4 text-sm text-slate">Tip: once inside, copy the edit link and open it in a second tab.</p>
        </section>

        <HeroBoard />
      </main>

      <section aria-labelledby="how" className="border-t border-line bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 id="how" className="text-2xl font-bold tracking-tight">What happens on a board</h2>
          <dl className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Everyone sees changes instantly", "Shapes, text and moves reach every open tab in tens of milliseconds, with each person's cursor and name."],
              ["Offline edits aren't lost", "Keep drawing without a connection. Changes are saved in the browser and merge cleanly when you're back."],
              ["Share to edit or just to view", "Send an edit link or a view-only link, and reset them any time to cut off old links."],
              ["Save versions, undo your own work", "Name a version before a big change and restore it later. Undo only touches what you did."],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="font-semibold">{t}</dt>
                <dd className="mt-1.5 leading-relaxed text-slate">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-slate">
        <span>Built with React, TypeScript, Konva, Yjs, Socket.IO, Node.js and MongoDB.</span>
        <a href="https://github.com/Dimple9812/CanvasHub-collaborative-multi-user-canvas" className="inline-flex items-center gap-1.5 font-semibold text-ink hover:underline">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}

/** A scripted preview of two people working on one board. Plays once; static under reduced motion. */
function HeroBoard() {
  return (
    <figure className="relative" aria-label="Preview: two people drawing on the same board">
      <svg viewBox="0 0 560 400" className="w-full rounded-2xl border border-line bg-white shadow-float" role="img" aria-hidden="true">
        <defs>
          <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.2" fill="#1c2433" opacity="0.14" />
          </pattern>
        </defs>
        <rect width="560" height="400" rx="16" fill="url(#dots)" />

        <text x="36" y="58" fontSize="24" fontWeight="800" fill="#1c2433">Launch plan</text>

        {/* Priya draws the box */}
        <rect className="hb-draw" x="40" y="96" width="230" height="130" rx="10" fill="#e7edff" stroke="#2f5bea" strokeWidth="3" pathLength={1} />
        <text className="hb-fade d1" x="62" y="140" fontSize="17" fontWeight="700" fill="#1c2433">Beta for 200 users</text>
        <text className="hb-fade d1" x="62" y="166" fontSize="15" fill="#6b7385">Invite list ready Friday</text>

        {/* Arrow */}
        <path className="hb-draw d2" d="M282 160 C 320 160, 330 210, 350 228" fill="none" stroke="#1c2433" strokeWidth="3" strokeLinecap="round" pathLength={1} />
        <path className="hb-fade d2b" d="M342 218 L352 230 L337 232" fill="none" stroke="#1c2433" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Sam's sticky note */}
        <g className="hb-drop">
          <rect x="330" y="236" width="190" height="130" rx="6" fill="#ffd84d" />
          <text x="348" y="276" fontSize="17" fontWeight="700" fill="#5a4300">Ship Monday?</text>
          <text x="348" y="302" fontSize="15" fill="#5a4300">QA signs off Sunday</text>
        </g>

        {/* Cursors */}
        <g className="hb-cursor-a">
          <path d="M0 0 L0 20 L6 15 L10 24 L14 22 L10 13 L18 13 Z" fill="#2f5bea" stroke="white" strokeWidth="1.5" />
          <rect x="16" y="20" width="52" height="22" rx="11" fill="#2f5bea" />
          <text x="29" y="35.5" fontSize="12.5" fontWeight="700" fill="white">Priya</text>
        </g>
        <g className="hb-cursor-b">
          <path d="M0 0 L0 20 L6 15 L10 24 L14 22 L10 13 L18 13 Z" fill="#e11d48" stroke="white" strokeWidth="1.5" />
          <rect x="16" y="20" width="44" height="22" rx="11" fill="#e11d48" />
          <text x="27" y="35.5" fontSize="12.5" fontWeight="700" fill="white">Sam</text>
        </g>
      </svg>
      <style>{`
        .hb-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: hb-draw 1.1s ease-out .3s forwards; fill-opacity: 0; }
        .hb-draw.d2 { animation-delay: 1.6s; }
        .hb-draw { animation-name: hb-draw; }
        @keyframes hb-draw { 70% { fill-opacity: 0 } to { stroke-dashoffset: 0; fill-opacity: 1 } }
        .hb-fade { opacity: 0; animation: hb-fade .4s ease-out 1.2s forwards; }
        .hb-fade.d2b { animation-delay: 2.5s; }
        @keyframes hb-fade { to { opacity: 1 } }
        .hb-drop { opacity: 0; transform: translate(0, -18px); animation: hb-drop .45s cubic-bezier(.2,.9,.3,1.3) 2.6s forwards; }
        @keyframes hb-drop { to { opacity: 1; transform: none } }
        .hb-cursor-a { transform: translate(60px, 330px); animation: hb-ca 2.4s ease-in-out .1s forwards; }
        @keyframes hb-ca { 15% { transform: translate(40px, 96px) } 55% { transform: translate(270px, 226px) } to { transform: translate(250px, 120px) } }
        .hb-cursor-b { transform: translate(520px, 60px); animation: hb-cb 2.6s ease-in-out .6s forwards; }
        @keyframes hb-cb { 60% { transform: translate(470px, 200px) } to { transform: translate(470px, 330px) } }
        @media (prefers-reduced-motion: reduce) {
          .hb-draw { stroke-dashoffset: 0; fill-opacity: 1; animation: none }
          .hb-fade, .hb-drop { opacity: 1; transform: none; animation: none }
          .hb-cursor-a { transform: translate(250px, 120px); animation: none }
          .hb-cursor-b { transform: translate(470px, 330px); animation: none }
        }
      `}</style>
    </figure>
  );
}
