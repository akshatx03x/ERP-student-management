import Image from "next/image";

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
    <main className="min-h-screen flex items-center justify-center bg-[#f0f2f5] px-4 py-12">
      {/* Outer card — fixed min-height so illustration never clips */}
      <div className="w-full max-w-[920px] min-h-[520px] rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col md:flex-row">

        {/* ── Left: Form Panel ── */}
        <div className="flex flex-col justify-center px-12 py-14 md:w-[44%]">

          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <svg width="38" height="38" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 28V10C4 8.9 4.9 8 6 8H18V28H6C4.9 28 4 27.1 4 26V28Z" fill="#1a1a2e"/>
              <path d="M18 8H30C31.1 8 32 8.9 32 10V26C32 27.1 31.1 28 30 28H18V8Z" fill="#1a1a2e"/>
              <path d="M16 6L18 4L20 6V8H16V6Z" fill="#1a1a2e"/>
              <rect x="8" y="12" width="6" height="1.5" rx="0.75" fill="white" opacity="0.7"/>
              <rect x="8" y="15" width="8" height="1.5" rx="0.75" fill="white" opacity="0.7"/>
              <rect x="8" y="18" width="6" height="1.5" rx="0.75" fill="white" opacity="0.7"/>
            </svg>
            <div>
              <p className="text-[16px] font-bold tracking-[0.12em] uppercase text-[#1a1a2e] leading-none">Vidhyanjali Public School</p>
              <p className="text-[9px] tracking-[0.14em] uppercase text-slate-400 leading-none mt-1">School Management System</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-xl font-semibold text-slate-700">{title}</h1>
            {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
          </div>

          {/* Form slot */}
          {children}

          {/* Footer */}
          {footer && <div className="mt-6 text-sm text-slate-400">{footer}</div>}
        </div>

        {/* ── Right: Illustration Panel ── */}
        <div
          className="relative hidden md:flex md:w-[56%] items-center justify-center overflow-hidden rounded-r-2xl py-6 px-4"
          style={{
            background: "linear-gradient(150deg, #ffffff 0%, #f4f5f8 45%, #eceef3 100%)",
          }}
        >
          {/* Decorative colour dots */}
          <span className="absolute top-8  left-10  h-3   w-3   rounded-full bg-yellow-400 opacity-80" />
          <span className="absolute top-12  right-14 h-2   w-2   rounded-full bg-pink-400   opacity-80" />
          <span className="absolute top-28  left-20  h-2   w-2   rounded-full bg-teal-400   opacity-80" />
          <span className="absolute bottom-20 right-10 h-3  w-3   rounded-full bg-yellow-400 opacity-70" />
          <span className="absolute bottom-14 left-14  h-2  w-2   rounded-full bg-pink-400   opacity-70" />
          <span className="absolute top-20  right-8  h-2.5 w-2.5 rounded-full bg-teal-300   opacity-60" />

          {/* Illustration — centered, full height contained, no clip */}
          <Image
            src="/login-illustration.png"
            alt="Students studying on a stack of books"
            width={500}
            height={460}
            className="w-full max-w-[460px] h-auto object-contain select-none"
            priority
          />
        </div>

      </div>
    </main>
  );
}
