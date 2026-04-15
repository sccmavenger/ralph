"use client";

export default function AuthError({ message }: { message: string }) {
  return (
    <div className="mb-6 w-full rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <p className="mb-2 text-sm font-medium text-red-400">{message}</p>
      <a
        href="/api/auth/login"
        className="text-sm font-semibold text-[var(--color-accent)] transition-colors hover:text-blue-400"
      >
        Try Again →
      </a>
    </div>
  );
}
