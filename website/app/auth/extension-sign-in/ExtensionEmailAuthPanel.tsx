"use client";

import type { FormEvent } from "react";
import { useState } from "react";

type Props = {
  apiKey: string;
  extensionId: string;
  signinCsrf: string;
  disabled: boolean;
};

type ChromeRuntime = {
  runtime?: {
    sendMessage?: (
      extensionId: string,
      message: unknown,
      responseCallback?: (response?: unknown) => void
    ) => void;
    lastError?: { message?: string };
  };
};

function getChromeRuntime(): ChromeRuntime | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { chrome?: ChromeRuntime }).chrome;
}

async function identitySignInWithPassword(apiKey: string, email: string, password: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true, email: email.trim(), password })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Sign-in failed"));
  }
  return body as {
    idToken: string;
    refreshToken: string;
    email: string;
    localId: string;
    expiresIn: string;
  };
}

async function identitySignUp(apiKey: string, email: string, password: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true, email: email.trim(), password })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Could not create account"));
  }
  return body as {
    idToken: string;
    refreshToken: string;
    email: string;
    localId: string;
    expiresIn: string;
  };
}

async function identitySendPasswordReset(apiKey: string, email: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: "PASSWORD_RESET",
        email: email.trim()
      })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Could not send reset email"));
  }
}

async function identitySendVerifyEmail(apiKey: string, idToken: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: "VERIFY_EMAIL",
        idToken: idToken.trim()
      })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Could not send verification email"));
  }
}

async function identityLookup(apiKey: string, idToken: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken.trim() })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Could not verify account state"));
  }
  const firstUser = Array.isArray(body?.users) ? body.users[0] : null;
  return {
    emailVerified: !!firstUser?.emailVerified
  };
}

function sendSessionToExtension(
  extensionId: string,
  payload: {
    signin_csrf: string;
    idToken: string;
    refreshToken: string;
    email: string;
    uid: string;
    expiresAtSec: number;
  }
) {
  return new Promise<void>((resolve, reject) => {
    const chrome = getChromeRuntime();
    const send = chrome?.runtime?.sendMessage;
    if (typeof send !== "function") {
      reject(new Error("Chrome extension API unavailable"));
      return;
    }
    send(
      extensionId,
      { type: "PROMPTLY_FIREBASE_EMAIL_SESSION", ...payload },
      (response: unknown) => {
        const err = chrome?.runtime?.lastError;
        if (err?.message) {
          reject(new Error(err.message));
          return;
        }
        const r = response as { ok?: boolean; error?: string } | undefined;
        if (r && r.ok === false) {
          reject(new Error(String(r.error || "Extension rejected sign-in")));
          return;
        }
        resolve();
      }
    );
  });
}

export function ExtensionEmailAuthPanel({ apiKey, extensionId, signinCsrf, disabled }: Props) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);

  async function onSubmitSignIn(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setNeedsEmailVerification(false);
    if (disabled || !apiKey || !extensionId || !signinCsrf) return;
    setBusy(true);
    try {
      const body = await identitySignInWithPassword(apiKey, email, password);
      const lookup = await identityLookup(apiKey, body.idToken);
      if (!lookup.emailVerified) {
        await identitySendVerifyEmail(apiKey, body.idToken);
        setNeedsEmailVerification(true);
        setMessage("Verify your email to finish sign-in. We sent a verification link.");
        return;
      }
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresIn = Math.max(300, Number(body.expiresIn) || 3600);
      await sendSessionToExtension(extensionId, {
        signin_csrf: signinCsrf,
        idToken: body.idToken,
        refreshToken: body.refreshToken,
        email: String(body.email || email).trim().toLowerCase(),
        uid: String(body.localId || "").trim(),
        expiresAtSec: nowSec + expiresIn
      });
      setMessage("Signed in. You can close this window.");
      try {
        window.close();
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitRegister(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setNeedsEmailVerification(false);
    if (disabled || !apiKey || !extensionId || !signinCsrf) return;
    if (password !== password2) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    try {
      const body = await identitySignUp(apiKey, email, password);
      await identitySendVerifyEmail(apiKey, body.idToken);
      setNeedsEmailVerification(true);
      setMode("signin");
      setPassword("");
      setPassword2("");
      setMessage("Account created. Verify your email first, then sign in.");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    setError("");
    setMessage("");
    if (disabled || !apiKey) return;
    const em = email.trim();
    if (!em) {
      setError("Enter your email above first.");
      return;
    }
    setBusy(true);
    try {
      await identitySendPasswordReset(apiKey, em);
      setMessage("If an account exists for that email, a reset link was sent.");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-6">
      <p className="text-[12px] font-semibold text-ink/70 text-center mb-3">Email &amp; password</p>
      <div className="flex justify-center gap-2 text-[11px] mb-3">
        <button
          type="button"
          className={`rounded-lg px-2 py-1 ${mode === "signin" ? "bg-white/15 text-white" : "text-ink/55 hover:text-ink/80"}`}
          onClick={() => {
            setMode("signin");
            setError("");
            setMessage("");
            setNeedsEmailVerification(false);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`rounded-lg px-2 py-1 ${mode === "register" ? "bg-white/15 text-white" : "text-ink/55 hover:text-ink/80"}`}
          onClick={() => {
            setMode("register");
            setError("");
            setMessage("");
            setNeedsEmailVerification(false);
          }}
        >
          Create account
        </button>
      </div>
      <form onSubmit={mode === "signin" ? onSubmitSignIn : onSubmitRegister} className="space-y-3">
        <label className="block">
          <span className="sr-only">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            disabled={disabled || busy}
            placeholder="Email"
            className="w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-ink/40 outline-none focus:border-violet-400/60"
          />
        </label>
        <label className="block">
          <span className="sr-only">Password</span>
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            disabled={disabled || busy}
            placeholder="Password"
            className="w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-ink/40 outline-none focus:border-violet-400/60"
          />
        </label>
        {mode === "register" ? (
          <label className="block">
            <span className="sr-only">Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={password2}
              onChange={(ev) => setPassword2(ev.target.value)}
              disabled={disabled || busy}
              placeholder="Confirm password"
              className="w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-ink/40 outline-none focus:border-violet-400/60"
            />
          </label>
        ) : null}
        <button
          type="submit"
          disabled={disabled || busy}
          className="w-full rounded-xl bg-violet-600/90 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in with email" : "Create account"}
        </button>
      </form>
      {mode === "signin" ? (
        <button
          type="button"
          onClick={onForgotPassword}
          disabled={disabled || busy}
          className="mt-2 w-full text-center text-[11px] text-violet-200/90 hover:text-white disabled:opacity-50"
        >
          Forgot password?
        </button>
      ) : null}
      {mode === "signin" && needsEmailVerification ? (
        <p className="mt-2 text-center text-[11px] text-amber-200/90 leading-snug">
          Email must be verified before this account can be used.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-center text-[11px] text-red-300/95 leading-snug">{error}</p> : null}
      {message ? <p className="mt-2 text-center text-[11px] text-emerald-200/90 leading-snug">{message}</p> : null}
    </div>
  );
}
