"use client";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton, useUser , Show} from "@clerk/nextjs";

export default function Navbar() {
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";
  return (
    <nav className="sticky top-0 z-50 border-b border-black/10 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-black tracking-tight text-black">
          IIITG<span className="text-neutral-400">.docs</span>
        </Link>
        <div className="flex items-center gap-3">
          <Show when="signed-in">
            <Link href="/library" className="text-sm font-medium text-neutral-600 hover:text-black">
              Library
            </Link>
            {isAdmin && (
              <Link
                href="/admin/upload"
                className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                + Upload
              </Link>
            )}
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton>
              <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
                Sign in
              </button>
            </SignInButton>
          </Show>
        </div>
      </div>
    </nav>
  );
}