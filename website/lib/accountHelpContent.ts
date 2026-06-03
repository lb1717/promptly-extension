export type AccountHelpItem = { q: string; a: string };

export const ACCOUNT_FAQ: AccountHelpItem[] = [
  {
    q: "What is Promptly?",
    a: "Promptly is a browser extension that improves your prompts inside ChatGPT, Claude, and Gemini on a desktop or laptop. You write as usual; Promptly rewrites or structures your message so the model understands your intent more clearly."
  },
  {
    q: "Where does Promptly appear?",
    a: "After you install the extension and open ChatGPT, Claude, or Gemini in Chrome or Edge on a computer, controls appear in or near the chat input. Promptly does not run inside mobile browsers or native apps."
  },
  {
    q: "How do I improve a prompt?",
    a: "Type your message in the chat box, then use the Promptly control (improve / rewrite) before you send. The extension replaces or refines your draft in place so you can review it and send when ready."
  },
  {
    q: "Do I need an account?",
    a: "Yes. Sign in on the Promptly website with the same email you use in the extension so your plan, credits, and usage stay in sync. Use Get started if you have not completed setup yet."
  },
  {
    q: "What are credits and weekly usage?",
    a: "Each improved prompt uses tokens from your plan allowance. Your account page shows weekly usage and when your balance resets. If you run out, wait for the reset or upgrade your plan."
  },
  {
    q: "Which browsers are supported?",
    a: "Google Chrome and Microsoft Edge on macOS, Windows, or Linux. Install from the Chrome Web Store or Edge Add-ons, then keep the extension enabled on the AI sites you use."
  }
];

export const ACCOUNT_TROUBLESHOOTING: AccountHelpItem[] = [
  {
    q: "I don't see Promptly in the chat",
    a: "Confirm the extension is installed and turned on in chrome://extensions (or edge://extensions). Open chatgpt.com, claude.ai, or gemini.google.com in Chrome or Edge on a computer—not a phone. Refresh the tab (⌘R / Ctrl+R). If you just installed or updated, reload once more."
  },
  {
    q: "Promptly shows “sign in” or my credits look wrong",
    a: "Sign in on this account page with the same email you use in the extension. Open the extension popup or settings and sign in there if prompted. After signing in on the website, refresh your AI chat tab so the session syncs."
  },
  {
    q: "The page says the extension updated — refresh to reconnect",
    a: "Chrome or Edge updated Promptly in the background. Reload the ChatGPT, Claude, or Gemini tab. You do not need to reinstall unless the extension was removed."
  },
  {
    q: "Improve does nothing or errors",
    a: "Check you are signed in and still have credits on this account page. Wait a few seconds and try again. Very long inputs may hit limits—shorten the draft and retry. If it persists, sign out and back in on the website, then refresh the chat tab."
  },
  {
    q: "I skipped setup steps earlier",
    a: "Go to Get started, sign in, and finish the install step. If you already had Promptly installed, the site may detect the extension automatically so you can finish without downloading again."
  },
  {
    q: "Still stuck?",
    a: "Note your browser, the AI site you use, and whether the extension icon appears in the toolbar. Email us using the address on the Privacy page with those details so we can help."
  }
];
