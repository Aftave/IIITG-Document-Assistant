import Link from "next/link";

export default function Home() {
  return (
    <section className="mx-auto flex max-w-4xl flex-col items-center px-6 py-28 text-center">
      <span className="mb-6 rounded-full border border-black px-4 py-1 text-xs font-semibold uppercase tracking-widest">
        IIIT Guwahati
      </span>
      <h1 className="text-5xl font-black leading-tight tracking-tight sm:text-7xl">
        Ask your institute<br />
        <span className="text-neutral-400">documents anything.</span>
      </h1>
      <p className="mt-6 max-w-xl text-neutral-500">
        Circulars, policies and course material in one place. Chat with a single document or an entire subject.
      </p>
      <Link
        href="/library"
        className="mt-10 rounded-full bg-black px-10 py-4 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-neutral-800"
      >
        Open Library →
      </Link>
    </section>
  );
}