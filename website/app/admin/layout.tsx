import { ReactNode } from "react";

export const metadata = {
  title: "Promptly Admin",
  robots: { index: false, follow: false }
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#161022] text-slate-100">
      <div className="border-b border-violet-500/20 bg-[#1c1428]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/product" className="text-sm font-semibold text-violet-200 hover:text-white">
            ← Back to site
          </a>
          <span className="text-xs uppercase tracking-widest text-violet-400/80">Admin</span>
        </div>
      </div>
      {children}
    </div>
  );
}
