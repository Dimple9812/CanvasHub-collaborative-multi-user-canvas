import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-extrabold">Nothing here</h1>
      <p className="text-slate">This page doesn't exist.</p>
      <Link to="/" className="font-semibold text-cobalt hover:underline">Go home</Link>
    </main>
  );
}
