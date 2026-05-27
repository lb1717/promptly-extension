import { AmbientBackground } from "@/components/AmbientBackground";

function SuccessCheckmark() {
  return (
    <svg
      viewBox="0 0 96 96"
      aria-hidden
      className="h-24 w-24 text-emerald-600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="4" opacity="0.25" />
      <path
        d="M28 50 L42 64 L70 34"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ExtensionSignInSuccessPage() {
  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground variant="static" />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-6">
        <SuccessCheckmark />
        <p className="mt-6 text-2xl font-semibold tracking-tight text-ink">Signed in!</p>
      </div>
    </main>
  );
}
