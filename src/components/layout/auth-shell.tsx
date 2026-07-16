import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#0b1220]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col justify-center gap-10 px-6 py-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="max-w-lg text-white">
          <p className="text-sm font-medium tracking-[0.2em] text-emerald-300/90 uppercase">
            Vidhyanjali Public School
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            School ERP
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            Manage academics, fees, attendance, and records from one calm workspace.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex text-sm text-slate-400 transition hover:text-white"
          >
            Back to home
          </Link>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/95 p-8 shadow-2xl shadow-black/30 backdrop-blur dark:bg-stone-950/90">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              {title}
            </h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
          </div>
          {children}
          {footer ? <div className="mt-6 text-center text-sm text-stone-500">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
