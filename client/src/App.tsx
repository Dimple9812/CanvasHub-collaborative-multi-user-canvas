import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./store/auth";
import { waitForServer } from "./lib/api";
import Landing from "./pages/Landing";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import JoinPage from "./pages/JoinPage";
import NotFound from "./pages/NotFound";
import { WakingServer } from "./components/ui/WakingServer";

// The canvas engine (Konva + sync) loads only when a board is opened.
const BoardPage = lazy(() => import("./pages/BoardPage"));

export default function App() {
  const status = useAuth((s) => s.status);
  const load = useAuth((s) => s.load);
  const [waking, setWaking] = useState<number | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    load().catch(async () => {
      // Server is asleep or unreachable: wait for it, then try again.
      const ok = await waitForServer((s) => setWaking(s));
      setWaking(null);
      if (ok) await load().catch(() => setUnreachable(true));
      else setUnreachable(true);
    });
  }, [load]);

  if (unreachable) return <WakingServer failed />;
  if (status === "unknown") return <WakingServer seconds={waking} />;

  return (
    <Suspense fallback={<WakingServer seconds={null} label="Opening board" />}>
      <Routes>
        <Route path="/" element={status === "signed-in" ? <Navigate to="/boards" replace /> : <Landing />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/boards" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/b/:id" element={<RequireAuth><BoardPage /></RequireAuth>} />
        <Route path="/join/:id/:invite" element={<RequireAuth><JoinPage /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  const location = useLocation();
  if (status !== "signed-in") {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}
