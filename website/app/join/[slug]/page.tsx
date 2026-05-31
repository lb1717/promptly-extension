import { Suspense } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { SalesJoinClient } from "@/components/join/SalesJoinClient";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

type Props = { params: { slug: string } };

export default function JoinPage({ params }: Props) {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <Suspense fallback={<div className="px-6 py-16 text-center text-sm text-muted">Loading…</div>}>
          <SalesJoinClient slug={params.slug} />
        </Suspense>
        <Footer />
      </div>
    </main>
  );
}
