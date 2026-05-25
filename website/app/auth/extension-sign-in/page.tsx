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

  const emailAuthReady = !!(extensionId && signinCsrf && firebaseApiKey);

  const brandHeader = (
    <div className="mb-6 flex w-full flex-col items-center text-center">
      <p className="text-sm font-semibold tracking-tight text-ink">Promptly Labs</p>
      <img
        src="/images/promptly-logo.png"
        alt="Promptly"
        className="mt-3 h-11 w-auto max-w-[200px] object-contain"
      />
    </div>
  );

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-white p-6 text-ink">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center">
        {brandHeader}
        {error ? (
          <p className="text-center text-sm leading-relaxed text-red-700">{error}</p>
        ) : (
          <>
            <a
              href={googleUrl}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream no-underline hover:bg-neutral-800"
            >
              <span>Sign in with Google</span>
              <img
                src="/images/google-logo.png"
                alt=""
                aria-hidden
                className="h-[18px] w-[18px] shrink-0 object-contain"
              />
            </a>

            {emailAuthReady ? (
              <>
                <div className="my-5 flex w-full items-center gap-3">
                  <div className="h-px flex-1 bg-line" aria-hidden />
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-faint">or</span>
                  <div className="h-px flex-1 bg-line" aria-hidden />
                </div>

                <ExtensionEmailAuthPanel
                  apiKey={firebaseApiKey}
                  extensionId={extensionId}
                  signinCsrf={signinCsrf}
                  disabled={false}
                />
              </>
            ) : (
              <div className="mt-5 w-full rounded-xl border border-line bg-cream px-4 py-3 text-center">
                <p className="text-[12px] font-semibold text-ink">Email sign-in unavailable</p>
                <p className="mt-1 text-[11px] leading-snug text-muted">
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

export default function ExtensionSignInPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-white p-6 text-ink">
          <div className="flex flex-col items-center text-center">
            <p className="text-sm font-semibold tracking-tight text-ink">Promptly Labs</p>
            <img
              src="/images/promptly-logo.png"
              alt="Promptly"
              className="mt-3 h-11 w-auto max-w-[200px] object-contain"
            />
            <p className="mt-6 text-sm text-muted">Loading…</p>
          </div>
        </main>
      }
    >
      <ExtensionSignInContent />
    </Suspense>
  );
}
