"use client";

import { AI_TRY_TARGETS } from "@/components/onboarding/AiServiceLogos";
import { formatSetupAgentList, showBrowserTryLinksOnDone } from "@/lib/onboardingInstallProgress";
import type { IdeToolId } from "@/components/integrations/integrationOs";
import Link from "next/link";

type Props = {
  browserStoreClicked: boolean;
  setupAgents: IdeToolId[];
  openingAi: string | null;
  onOpenAi: (key: string, url: string) => void;
  completionDetail?: string;
  disabled?: boolean;
};

export function OnboardingDoneStep({
  browserStoreClicked,
  setupAgents,
  openingAi,
  onOpenAi,
  completionDetail = "Your account is ready.",
  disabled = false
}: Props) {
  const showBrowserLinks = showBrowserTryLinksOnDone(browserStoreClicked);
  const agentList = formatSetupAgentList(setupAgents);

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
        <p className="text-lg font-semibold text-emerald-900">Setup complete</p>
        <p className="mt-1 text-sm text-emerald-800">{completionDetail}</p>
      </div>

      {showBrowserLinks ? (
        <>
          <p className="text-center text-sm font-semibold text-ink">Try it out now</p>
          <p className="text-center text-xs text-faint">
            Use Chrome or Edge on a computer — these links open AI chat in your desktop browser where Promptly is
            installed.
          </p>

          <div className="grid gap-3">
            {AI_TRY_TARGETS.map(({ key, name, url, Logo }) => (
              <button
                key={key}
                type="button"
                onClick={() => onOpenAi(key, url)}
                disabled={disabled || openingAi !== null}
                className="flex flex-col items-center rounded-xl border border-line bg-cream-dark p-4 transition-colors hover:border-ink/20 hover:bg-cream disabled:opacity-60"
              >
                <Logo className="h-10 w-10" />
                <span className="mt-2 text-sm font-semibold text-ink">{name}</span>
                <span className="mt-1 text-xs text-faint">
                  {openingAi === key ? "Signing in to extension…" : "Open & start prompting"}
                </span>
              </button>
            ))}
          </div>

          <p className="text-center text-xs text-faint">
            We sync your Promptly sign-in to the extension when you open a chat (if installed).
          </p>
        </>
      ) : agentList ? (
        <div className="rounded-xl border border-line bg-cream-dark px-4 py-4 text-center">
          <p className="text-sm font-semibold text-ink">You&apos;re set up for {agentList}</p>
          <p className="mt-2 text-sm text-muted">
            Run the install command in your terminal, then send a prompt in {agentList} to start tracking.
          </p>
          <p className="mt-3 text-xs text-faint">
            You can pair Claude Code, Cursor, and Codex on the same computer, or add Chrome/Edge later from{" "}
            <Link href="/integrations" className="font-medium text-ink underline-offset-2 hover:underline">
              Integrations
            </Link>{" "}
            or your account.
          </p>
        </div>
      ) : (
        <p className="text-center text-sm text-muted">
          You&apos;re all set. Install Promptly on other apps anytime from{" "}
          <Link href="/integrations" className="font-medium text-ink underline-offset-2 hover:underline">
            Integrations
          </Link>
          .
        </p>
      )}

      <Link
        href="/account"
        className="inline-flex w-full items-center justify-center rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream-dark"
      >
        Go to your account
      </Link>
    </div>
  );
}
