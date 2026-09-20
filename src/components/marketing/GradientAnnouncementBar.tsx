import Link from "next/link";

export function GradientAnnouncementBar() {
  return (
    <Link
      href="/product"
      className="mkt-grad-bar flex items-center justify-center gap-1.5 px-5 py-2.5 text-center text-[13px] font-semibold text-[#0a0f0a]"
    >
      New: AI agents for payroll, compliance and close — see how they work
      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 flex-none">
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
