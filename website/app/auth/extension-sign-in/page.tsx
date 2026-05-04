"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ExtensionEmailAuthPanel } from "./ExtensionEmailAuthPanel";

const CALLBACK_PATH = "/auth/extension-google-oauth";

/** Must match redirect URIs the extension uses (Google OAuth + extension bridge). */
function isAllowedRedirectUri(redirectUri: string): boolean {
  try {
    const u = new URL(redirectUri);
    const path = (u.pathname.replace(/\/$/, "") || "/").toLowerCase();
    if (path !== CALLBACK_PATH.toLowerCase()) {
      return false;
    }
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "promptly-labs.com" && u.protocol === "https:") {
      return true;
    }
    if (host.endsWith(".vercel.app") && u.protocol === "https:") {
      return true;
    }
    if ((host === "localhost" || host === "127.0.0.1") && u.protocol === "http:" && u.port === "3000") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function buildGoogleAuthUrl(params: {
  client_id: string;
  redirect_uri: string;
  state: string;
  nonce: string;
}) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", params.client_id);
  u.searchParams.set("redirect_uri", params.redirect_uri);
  u.searchParams.set("response_type", "token id_token");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("display", "popup");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", params.state);
  u.searchParams.set("nonce", params.nonce);
  return u.toString();
}

function ExtensionSignInContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id")?.trim() || "";
  const redirectUri = searchParams.get("redirect_uri")?.trim() || "";
  const state = searchParams.get("state")?.trim() || "";
  const nonce = searchParams.get("nonce")?.trim() || "";
  const extensionId = searchParams.get("extension_id")?.trim() || "";
  const signinCsrf = searchParams.get("signin_csrf")?.trim() || "";
  const firebaseApiKey =
    searchParams.get("firebase_api_key")?.trim() ||
    String(process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "").trim();

  const { error, googleUrl } = useMemo(() => {
    if (!clientId || !redirectUri || !state || !nonce) {
      return {
        error:
          "Missing sign-in parameters. Use the Sign in control on Promptly in ChatGPT, Claude, or Gemini — not this URL directly.",
        googleUrl: ""
      };
    }
    if (!isAllowedRedirectUri(redirectUri)) {
      return { error: "Sign-in redirect is not allowed for this site.", googleUrl: "" };
    }
    return {
      error: "",
      googleUrl: buildGoogleAuthUrl({ client_id: clientId, redirect_uri: redirectUri, state, nonce })
    };
  }, [clientId, redirectUri, state, nonce]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-hero-radial p-6 text-ink">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-glow backdrop-blur-sm">
        <h1 className="text-xl font-semibold tracking-tight text-center mb-1">Promptly</h1>
        <p className="text-sm text-ink/70 text-center mb-8">Sign in to continue with the extension</p>

        {error ? (
          <p className="text-sm text-red-300/95 text-center leading-relaxed">{error}</p>
        ) : (
          <>
            <a
              href={googleUrl}
              className="flex items-center justify-center gap-3 w-full rounded-xl bg-white text-violetDark font-semibold text-sm py-3 px-4 no-underline hover:bg-violet-50 transition-colors border border-white/20 shadow-lg"
            >
              <GoogleMark />
              Continue with Google
            </a>
            <p className="text-[11px] text-ink/45 text-center mt-4 leading-snug">
              You’ll finish on Google, then return here to complete sign-in.
            </p>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-[11px] font-semibold uppercase tracking-wide">
                <span className="bg-white/[0.06] px-3 text-ink/50">Or</span>
              </div>
            </div>

            {extensionId && signinCsrf && firebaseApiKey ? (
              <ExtensionEmailAuthPanel
                apiKey={firebaseApiKey}
                extensionId={extensionId}
                signinCsrf={signinCsrf}
                disabled={false}
              />
            ) : (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-center">
                <p className="text-[12px] font-semibold text-amber-100/95">Email sign-in unavailable</p>
                <p className="mt-1 text-[11px] text-ink/60 leading-snug">
                  {!extensionId || !signinCsrf
                    ? "Update the Promptly extension so the sign-in window includes extension parameters, then try again."
                    : "Missing Firebase Web API key. Add NEXT_PUBLIC_FIREBASE_API_KEY to the site env, or ensure the extension passes firebase_api_key in this URL."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.86 11.86 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function ExtensionSignInPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-transparent p-6 text-ink">
          <p className="text-sm opacity-70">Loading…</p>
        </main>
      }
    >
      <ExtensionSignInContent />
    </Suspense>
  );
}
