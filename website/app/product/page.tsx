import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Product | Promptly Labs",
  description: "Promptly product overview."
};

export default function ProductPage() {
  return (
    <main className="min-h-screen bg-violetDark text-ink">
      <Navbar />
      <article className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:pt-14">
        <p className="text-sm font-medium text-violet-200/70">
          <Link href="/" className="text-violet-200 hover:text-white">
            Home
          </Link>
          <span className="mx-2 opacity-60">/</span>
          Product
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Product</h1>
        <p className="mt-4 text-violet-200/85">
          This page is for product details. Replace this copy with your roadmap, features, or extension overview.
        </p>
      </article>
      <Footer />
    </main>
  );
}
