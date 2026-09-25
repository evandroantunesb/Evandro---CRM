import type { ReactNode } from "react";

export function TelaPublica({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="mb-1 text-sm font-semibold tracking-wide text-amber-600">RAION CRM</p>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900">{titulo}</h1>
        {children}
      </div>
    </main>
  );
}
