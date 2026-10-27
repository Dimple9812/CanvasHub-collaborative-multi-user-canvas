import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Logo } from "../components/ui/Logo";
import { Button } from "../components/ui/Button";
import { useAuth } from "../store/auth";
import { safeNext } from "../lib/redirect";


export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { login, signup, demo } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      navigate(next, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    void run(() => (mode === "login" ? login(email, password) : signup(String(f.get("name")), email, password)));
  };

  const isLogin = mode === "login";
  const otherLink = `${isLogin ? "/signup" : "/login"}${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <main className="dot-grid flex min-h-full items-center justify-center px-4 py-10" style={{ backgroundSize: "22px 22px" }}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-xl border border-line bg-white p-6 shadow-float">
          <h1 className="text-2xl font-extrabold tracking-tight">{isLogin ? "Sign in" : "Create your account"}</h1>
          {next !== "/boards" && <p className="mt-1 text-sm text-slate">Sign in to open the board you were invited to.</p>}

          <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate={false}>
            {!isLogin && (
              <Field label="Your name" name="name" autoComplete="name" required maxLength={60} />
            )}
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={8}
              hint={isLogin ? undefined : "At least 8 characters."}
            />
            {error && (
              <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {isLogin ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-sm text-slate">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => run(demo)}>
            Continue as a guest
          </Button>
        </div>
        <p className="mt-5 text-center text-sm text-slate">
          {isLogin ? "New here? " : "Already have an account? "}
          <Link to={otherLink} className="font-semibold text-cobalt hover:underline">
            {isLogin ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${input.name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        {...input}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-10 w-full rounded-md border border-line bg-white px-3 outline-none transition-colors focus:border-cobalt focus-visible:outline-2 focus-visible:outline-cobalt/30"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate">
          {hint}
        </p>
      )}
    </div>
  );
}
