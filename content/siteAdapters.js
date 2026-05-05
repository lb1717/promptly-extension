(() => {
  const CANDIDATE_SELECTOR = [
    "#prompt-textarea",
    "[data-testid='chat-input']",
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
    if (host === "claude.ai" || host === "www.claude.ai") {
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

  /**
   * Rich editors (Claude, ChatGPT, etc.) often focus a short inner line or paragraph; its rect can be
   * under the 24px height threshold even though the composer is clearly visible. Walk up (including
   * out of open shadow roots via the shadow host) until we find a box large enough to treat as the
   * visible surface for that node.
   */
  function findMeasurableBoundsHost(el) {
    if (!isElement(el) || !el.isConnected) {
      return null;
    }
    let n = el;
    for (let i = 0; i < 40 && n; i += 1) {
      const rect = n.getBoundingClientRect();
      if (rect.width >= 120 && rect.height >= 24) {
        return n;
      }
      if (n.parentElement) {
        n = n.parentElement;
      } else {
        const root = n.getRootNode();
        if (root instanceof ShadowRoot && root.host) {
          n = root.host;
        } else {
          break;
        }
      }
    }
    return null;
  }

  function isVisible(el) {
    if (!isElement(el) || !el.isConnected) {
      return false;
    }
    const host = findMeasurableBoundsHost(el);
    if (!host) {
      return false;
    }
    const style = window.getComputedStyle(host);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return Number(style.opacity || 1) > 0;
  }

  /** Bounding rect of the measurable shell around `el` (see findMeasurableBoundsHost). Used for placement visibility on hosts like Claude TipTap where the focused surface can be shorter than 24px. */
  function getPromptSurfaceRect(el) {
    if (!isElement(el) || !el.isConnected) {
      return null;
    }
    const host = findMeasurableBoundsHost(el);
    return host ? host.getBoundingClientRect() : null;
  }

  function isInsidePromptlyUi(el) {
    if (!isElement(el)) {
      return false;
    }
    if (el.closest("[data-promptly-root='true'], [data-promptly-ui='true']")) {
      return true;
    }
    const root = el.getRootNode();
    return root instanceof ShadowRoot && !!root.host && root.host.getAttribute("data-promptly-root") === "true";
  }

  function isEditable(el) {
    if (!isVisible(el)) {
      return false;
    }
    if (isInsidePromptlyUi(el)) {
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
      if (el.getAttribute("data-testid") === "chat-input") {
        return true;
      }
      const signals = textSignals(el);
      return /\b(claude|message|chat|prompt)\b/.test(signals) || !!el.closest("form");
    });
    return bestByScore(candidates, (el) => {
      let score = scoreCommon(el, previousTarget);
      if (el.getAttribute("data-testid") === "chat-input") {
        score += 24;
      }
      if (el.classList && el.classList.contains("ProseMirror")) {
        score += 6;
      }
      return score;
    });
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
    const input =
      target.closest('[data-testid="chat-input"]') ||
      (target.getAttribute("data-testid") === "chat-input" ? target : null);
    if (input) {
      const inputRect = input.getBoundingClientRect();
      const ancestors = [];
      for (
        let node = input.parentElement, depth = 0;
        node && depth < 16 && node !== document.body;
        node = node.parentElement, depth += 1
      ) {
        if (typeof node.getBoundingClientRect !== "function") {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (rect.width < 120 || rect.height < 20) {
          continue;
        }
        // Keep candidates close to the input geometry so we avoid huge page wrappers.
        const widthCloseToInput = rect.width >= inputRect.width * 0.85 && rect.width <= inputRect.width + 220;
        const bottomNearInput = rect.bottom >= inputRect.bottom - 12 && rect.bottom <= inputRect.bottom + 96;
        const topNotFarAbove = rect.top <= inputRect.top + 8 && rect.top >= inputRect.top - 220;
        if (widthCloseToInput && bottomNearInput && topNotFarAbove) {
          ancestors.push({ node, rect });
        }
        if (node.tagName === "FORM") {
          break;
        }
      }
      if (ancestors.length > 0) {
        ancestors.sort((a, b) => (a.rect.top === b.rect.top ? a.rect.height - b.rect.height : a.rect.top - b.rect.top));
        return ancestors[0].node;
      }

      const shell =
        input.closest("[class*='max-h-96']") ||
        input.closest(".overflow-y-auto") ||
        input.parentElement;
      if (shell && typeof shell.getBoundingClientRect === "function") {
        const r = shell.getBoundingClientRect();
        if (r.width >= 120 && r.height >= 20) {
          return shell;
        }
      }
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

  function pageEmailHintForSessionVerify(_site) {
    const raw = getPageEmailHint();
    if (!raw) {
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
    isInsidePromptlyUi,
    getPromptSurfaceRect,
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
