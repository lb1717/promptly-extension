(() => {
  const CANDIDATE_SELECTOR = [
    "#prompt-textarea",
    "textarea",
    "div[contenteditable='true']",
    "div[contenteditable='']",
    "[role='textbox']",
    "input[type='text']",
    "[aria-label*='message' i]",
    "[placeholder*='message' i]"
  ].join(",");

  function isElement(node) {
    return node instanceof Element;
  }

  function getSite() {
    const host = window.location.hostname;
    if (host === "chat.openai.com" || host.endsWith(".openai.com") || host === "chatgpt.com") {
      return "chatgpt";
    }
    if (host === "claude.ai") {
      return "claude";
    }
    if (host === "gemini.google.com") {
      return "gemini";
    }
    return "unknown";
  }

  function collectElementsIncludingShadow(root, selector, out, seen) {
    if (!root) {
      return;
    }

    if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
      const matches = root.querySelectorAll(selector);
      for (const match of matches) {
        if (!seen.has(match)) {
          seen.add(match);
          out.push(match);
        }
      }
    }

    const hosts = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (const child of hosts) {
      if (child.shadowRoot) {
        collectElementsIncludingShadow(child.shadowRoot, selector, out, seen);
      }
    }
  }

  function allCandidates() {
    const out = [];
    collectElementsIncludingShadow(document, CANDIDATE_SELECTOR, out, new Set());
    return out;
  }

  function isVisible(el) {
    if (!isElement(el) || !el.isConnected) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 24) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return Number(style.opacity || 1) > 0;
  }

  function isEditable(el) {
    if (!isVisible(el)) {
      return false;
    }
    if (el.closest("[data-promptly-root='true']")) {
      return false;
    }
    if ("disabled" in el && el.disabled) {
      return false;
    }
    if ("readOnly" in el && el.readOnly) {
      return false;
    }
    if (el instanceof HTMLTextAreaElement) {
      return true;
    }
    if (el instanceof HTMLInputElement) {
      return el.type === "text" || el.type === "search";
    }
    if (el.getAttribute("role") === "textbox") {
      return true;
    }
    return el.isContentEditable || el.getAttribute("contenteditable") === "true";
  }

  function textSignals(el) {
    const parts = [
      el.getAttribute("placeholder"),
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("name"),
      el.id
    ];
    const parent = el.closest("form, main, section, div");
    if (parent) {
      parts.push(parent.getAttribute("aria-label"), parent.getAttribute("title"));
    }
    return parts
      .filter(Boolean)
      .map((v) => String(v).toLowerCase())
      .join(" ");
  }

  function scoreCommon(el, previousTarget) {
    if (!isEditable(el)) {
      return Number.NEGATIVE_INFINITY;
    }
    const rect = el.getBoundingClientRect();
    const signals = textSignals(el);
    let score = 0;

    if (el instanceof HTMLTextAreaElement) {
      score += 8;
    }
    if (el.isContentEditable) {
      score += 6;
    }
    if (el.getAttribute("role") === "textbox") {
      score += 3;
    }

    if (rect.width > 280) {
      score += 2;
    }
    if (rect.width > 420) {
      score += 1;
    }
    if (rect.bottom > window.innerHeight * 0.45) {
      score += 2;
    }

    if (/\b(message|prompt|ask|chat|assistant|conversation|input)\b/.test(signals)) {
      score += 4;
    }
    if (el.closest("form")) {
      score += 2;
    }
    if (document.activeElement === el) {
      score += 6;
    }
    if (previousTarget && previousTarget === el) {
      score += 3;
    }
    return score;
  }

  function bestByScore(elements, scoreFn) {
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const el of elements) {
      const score = scoreFn(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function getPromptElementForChatGPT(previousTarget) {
    const candidates = allCandidates().filter((el) => {
      if (!isEditable(el)) {
        return false;
      }
      const signals = textSignals(el);
      return /\b(message|chatgpt|prompt|ask)\b/.test(signals) || !!el.closest("form");
    });
    return bestByScore(candidates, (el) => {
      let score = scoreCommon(el, previousTarget);
      if (el.id === "prompt-textarea") {
        score += 8;
      }
      if (el.closest("[data-testid*='composer' i], [class*='composer' i]")) {
        score += 3;
      }
      return score;
    });
  }

  function getPromptElementForClaude(previousTarget) {
    const candidates = allCandidates().filter((el) => {
      if (!isEditable(el)) {
        return false;
      }
      const signals = textSignals(el);
      return /\b(claude|message|chat|prompt)\b/.test(signals) || !!el.closest("form");
    });
    return bestByScore(candidates, (el) => scoreCommon(el, previousTarget));
  }

  function getPromptElementForGemini(previousTarget) {
    const candidates = allCandidates().filter((el) => {
      if (!isEditable(el)) {
        return false;
      }
      const signals = textSignals(el);
      return /\b(gemini|message|prompt|enter|ask)\b/.test(signals) || !!el.closest("form");
    });
    return bestByScore(candidates, (el) => {
      let score = scoreCommon(el, previousTarget);
      const aria = String(el.getAttribute("aria-label") || "").toLowerCase();
      const placeholder = String(el.getAttribute("data-placeholder") || "").toLowerCase();
      if (el.isContentEditable) {
        score += 2;
      }
      if (el.classList.contains("ql-editor")) {
        score += 4;
      }
      if (aria.includes("prompt for gemini")) {
        score += 10;
      }
      if (placeholder.includes("ask gemini")) {
        score += 6;
      }
      if (el.closest("rich-textarea")) {
        score += 6;
      }
      return score;
    });
  }

  function getPromptElementUniversal(previousTarget) {
    const candidates = allCandidates();
    return bestByScore(candidates, (el) => scoreCommon(el, previousTarget));
  }

  function getPromptElement(previousTarget) {
    const site = getSite();
    if (site === "chatgpt") {
      return getPromptElementForChatGPT(previousTarget) || getPromptElementUniversal(previousTarget);
    }
    if (site === "claude") {
      return getPromptElementForClaude(previousTarget) || getPromptElementUniversal(previousTarget);
    }
    if (site === "gemini") {
      return getPromptElementForGemini(previousTarget) || getPromptElementUniversal(previousTarget);
    }
    return getPromptElementUniversal(previousTarget);
  }

  /**
   * Host UIs often wrap the real editor (e.g. #prompt-textarea) around an inner ProseMirror/contenteditable.
   * Writing to the outer node can truncate or be discarded; reads/writes should use the same inner surface.
   */
  function getPromptWriteSurface(target) {
    if (!isElement(target)) {
      return target;
    }
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      return target;
    }
    if (target.classList && target.classList.contains("ProseMirror")) {
      return target;
    }

    const nestedSelector = "[contenteditable='true'], [contenteditable='']";
    let nested = [];
    try {
      nested = Array.from(target.querySelectorAll(nestedSelector)).filter(
        (node) => node instanceof Element && node !== target && isEditable(node)
      );
    } catch (_e) {
      return target;
    }
    if (nested.length === 0) {
      return target;
    }

    const pm = nested.find((n) => n.classList && n.classList.contains("ProseMirror"));
    if (pm) {
      return pm;
    }

    let best = nested[0];
    let bestH = 0;
    for (const n of nested) {
      const h = n.scrollHeight || 0;
      if (h > bestH) {
        bestH = h;
        best = n;
      }
    }
    return best;
  }

  function getAnchorElementForGemini(target) {
    if (!target || !isElement(target)) {
      return target;
    }
    return (
      target.closest("fieldset.input-area-container") ||
      target.closest("[data-node-type='input-area']") ||
      target.closest("input-area-v2") ||
      target.closest(".text-input-field") ||
      target.closest(".text-input-field_textarea-wrapper") ||
      target
    );
  }

  function getAnchorElementForChatGPT(target) {
    if (!target || !isElement(target)) {
      return target;
    }
    return (
      target.closest("[data-testid*='composer' i]") ||
      target.closest("[data-composer-surface='true']") ||
      target.closest("[data-type='unified-composer']") ||
      target.closest("[class*='composer' i]") ||
      target.closest("form.group\\/composer") ||
      target.closest("form") ||
      target
    );
  }

  function getAnchorElementForClaude(target) {
    if (!target || !isElement(target)) {
      return target;
    }
    return target.closest("form") || target;
  }

  function getAnchorElement(target) {
    const site = getSite();
    if (site === "gemini") {
      return getAnchorElementForGemini(target);
    }
    if (site === "chatgpt") {
      return getAnchorElementForChatGPT(target);
    }
    if (site === "claude") {
      return getAnchorElementForClaude(target);
    }
    return target;
  }

  function extractFirstEmail(text) {
    const value = String(text || "");
    const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].toLowerCase() : null;
  }

  function getPageEmailHint() {
    const selectors = [
      "[data-email]",
      "[data-user-email]",
      "a[href^='mailto:']",
      "[aria-label*='@']",
      "[title*='@']"
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) {
        continue;
      }
      const candidate = extractFirstEmail(
        node.getAttribute("data-email") ||
          node.getAttribute("data-user-email") ||
          node.getAttribute("aria-label") ||
          node.getAttribute("title") ||
          node.getAttribute("href") ||
          node.textContent
      );
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  function pageEmailHintForSessionVerify(site) {
    const raw = getPageEmailHint();
    if (!raw) {
      return null;
    }
    // Avoid matching support/legal copy on Google surfaces; extension only allows Gmail anyway.
    if (
      (site === "gemini" || site === "chatgpt") &&
      !raw.endsWith("@gmail.com") &&
      !raw.endsWith("@googlemail.com")
    ) {
      return null;
    }
    return raw;
  }

  /**
   * Gemini always includes generic accounts.google.com links (account menu, etc.). Only treat the page
   * as logged-out when a visible auth-wall / ServiceLogin style control is present.
   */
  function geminiShowsSignInWall() {
    const anchors = document.querySelectorAll('a[href*="accounts.google.com"]');
    for (const el of anchors) {
      if (!isVisible(el)) {
        continue;
      }
      const href = String(el.getAttribute("href") || "").toLowerCase();
      if (!href) {
        continue;
      }
      if (
        href.includes("signout") ||
        href.includes("logout") ||
        href.includes("myaccount.google.com") ||
        href.includes("myaccount")
      ) {
        continue;
      }
      if (
        href.includes("servicelogin") ||
        href.includes("accountchooser") ||
        href.includes("/signin/identifier") ||
        (href.includes("oauth2") && href.includes("authorize")) ||
        href.includes("interactive/login") ||
        href.includes("interactive%2flogin")
      ) {
        return true;
      }
    }
    const exactSignInLabels = ["Sign in", "Sign in with Google"];
    for (const label of exactSignInLabels) {
      const el = document.querySelector(`button[aria-label="${label}"], a[aria-label="${label}"]`);
      if (el && isVisible(el)) {
        return true;
      }
    }
    return false;
  }

  function hasServiceAuthUi(target) {
    const site = getSite();
    const hasPromptInput = !!target && isEditable(target);
    if (!hasPromptInput) {
      return false;
    }
    if (site === "gemini") {
      return !geminiShowsSignInWall();
    }
    if (site === "chatgpt") {
      const loginCta = document.querySelector("a[href*='/auth/login'], button[data-testid*='login' i]");
      return !loginCta;
    }
    if (site === "claude") {
      const loginCta = document.querySelector("a[href*='/login'], button[aria-label*='log in' i]");
      return !loginCta;
    }
    return true;
  }

  function getSessionVerificationHints(target) {
    const site = getSite();
    return {
      site,
      hasAuthenticatedUi: hasServiceAuthUi(target),
      pageEmailHint: pageEmailHintForSessionVerify(site)
    };
  }

  window.PromptlySiteAdapters = {
    getSite,
    isEditable,
    getPromptElement,
    getPromptWriteSurface,
    getPromptElementForChatGPT,
    getPromptElementForClaude,
    getPromptElementForGemini,
    getPromptElementUniversal,
    getAnchorElement,
    getSessionVerificationHints
  };
})();
