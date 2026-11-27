type EmptyRole = "advertiser" | "affiliate";

const COPY: Record<
  EmptyRole,
  { title: string; body: string; action: string; destination: string }
> = {
  advertiser: {
    title: "No campaigns yet",
    body: "Create a campaign when you are ready to track affiliate sales.",
    action: "Get started",
    destination: "create-campaign",
  },
  affiliate: {
    title: "No programs yet",
    body: "Join a campaign when you are ready to earn commissions.",
    action: "Get started",
    destination: "join-campaign",
  },
};

interface EmptyStateProps {
  role: EmptyRole;
  onAction: (destination: string) => void;
}

export function EmptyState({ role, onAction }: EmptyStateProps) {
  const copy = COPY[role];
  return (
    <section
      aria-label={`${role} empty state`}
      className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/60"
    >
      <svg
        aria-hidden="true"
        className="mx-auto mb-4 h-24 w-24 text-indigo-500"
        viewBox="0 0 120 120"
        fill="none"
      >
        <rect x="18" y="28" width="84" height="64" rx="14" stroke="currentColor" strokeWidth="4" />
        <path d="M34 48h52M34 64h32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <circle cx="86" cy="78" r="16" className="fill-white dark:fill-zinc-900" stroke="currentColor" strokeWidth="4" />
        <path d="M86 70v16M78 78h16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <h2 className="text-xl font-black text-zinc-900 dark:text-white">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{copy.body}</p>
      <button
        type="button"
        onClick={() => onAction(copy.destination)}
        className="mt-6 inline-flex h-11 items-center rounded-2xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-500"
      >
        {copy.action}
      </button>
    </section>
  );
}
