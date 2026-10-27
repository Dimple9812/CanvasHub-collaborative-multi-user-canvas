import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { WakingServer } from "../components/ui/WakingServer";

/** Landing spot for share links: adds you to the board, then opens it. */
export default function JoinPage() {
  const { id = "", invite = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    api.joinBoard(id, invite).then(
      () => navigate(`/b/${id}`, { replace: true }),
      (e) => setError((e as Error).message),
    );
  }, [id, invite, navigate]);

  if (!error) return <WakingServer label="Joining board" />;
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-extrabold">Can't open this board</h1>
      <p className="max-w-sm text-slate">{error} Ask the owner for a new link.</p>
      <Link to="/boards" className="font-semibold text-cobalt hover:underline">Go to your boards</Link>
    </main>
  );
}
