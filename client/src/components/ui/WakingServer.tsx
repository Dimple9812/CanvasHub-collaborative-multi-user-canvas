import { Logo } from "./Logo";

/** Shown while the free-tier API wakes up, so a cold start doesn't look like a broken site. */
export function WakingServer({ seconds = null, failed = false, label }: { seconds?: number | null; failed?: boolean; label?: string }) {
  return (
    <main className="dot-grid flex h-full flex-col items-center justify-center gap-5 px-6 text-center" style={{ backgroundSize: "22px 22px" }}>
      <Logo />
      {failed ? (
        <>
          <p className="max-w-sm text-slate">The server didn't respond. It may be redeploying.</p>
          <button type="button" className="font-semibold text-cobalt underline underline-offset-4" onClick={() => location.reload()}>
            Try again
          </button>
        </>
      ) : (
        <div role="status" className="flex flex-col items-center gap-3">
          <span className="h-1.5 w-40 overflow-hidden rounded-full bg-line">
            <span className="block h-full w-1/3 animate-[slide_1.1s_ease-in-out_infinite] rounded-full bg-cobalt" />
          </span>
          <p className="max-w-sm text-slate">
            {seconds === null
              ? (label ?? "Loading")
              : `Waking the server — free hosting sleeps when idle. This takes up to a minute (${seconds}s).`}
          </p>
        </div>
      )}
      <style>{`@keyframes slide { from { transform: translateX(-100%) } to { transform: translateX(300%) } }`}</style>
    </main>
  );
}
