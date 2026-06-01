"use client";

import { userNeedsEmailVerification, type EmailVerificationUiStatus } from "@/lib/emailVerification";
import { reload, type User } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";

const POLL_MS = 3000;

export function useEmailVerificationStatus(user: User | null) {
  const [uiStatus, setUiStatus] = useState<EmailVerificationUiStatus>("none");
  const [trackedEmail, setTrackedEmail] = useState("");

  const notifyVerificationSent = useCallback((email: string) => {
    const trimmed = email.trim();
    if (trimmed) setTrackedEmail(trimmed);
    setUiStatus("sent");
  }, []);

  const notifyVerified = useCallback((email?: string) => {
    const trimmed = String(email || trackedEmail || user?.email || "").trim();
    if (trimmed) setTrackedEmail(trimmed);
    setUiStatus("verified");
  }, [trackedEmail, user?.email]);

  const resetVerificationStatus = useCallback(() => {
    setUiStatus("none");
    setTrackedEmail("");
  }, []);

  useEffect(() => {
    if (!user?.emailVerified) return;
    if (uiStatus === "sent") {
      setUiStatus("verified");
    }
    if (user.email && !trackedEmail) {
      setTrackedEmail(user.email);
    }
  }, [user?.emailVerified, user?.email, uiStatus, trackedEmail]);

  useEffect(() => {
    if (!user || !userNeedsEmailVerification(user)) return;

    let cancelled = false;

    const check = async () => {
      try {
        await reload(user);
        if (cancelled) return;
        if (user.emailVerified) {
          if (user.email) setTrackedEmail(user.email);
          setUiStatus("verified");
        }
      } catch {
        /* ignore transient reload errors while polling */
      }
    };

    void check();
    const id = window.setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user, user?.emailVerified]);

  return {
    uiStatus,
    trackedEmail,
    notifyVerificationSent,
    notifyVerified,
    resetVerificationStatus,
    awaitingVerification: userNeedsEmailVerification(user)
  };
}
