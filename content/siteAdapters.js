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

  /** Matches Claude empty-state greetings like "Good morning, Leo" (wording varies by time/day). */
  const CLAUDE_HOME_GREETING_TEXT_RE =
    /^(?:Good\s+(?:morning|afternoon|evening)|Happy\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|Welcome\s+back|Back\s+at\s+it|Hello)(?:[,.!?]|\s)/i;

  function isClaudeElementVisible(el) {
    if (!isElement(el) || !el.isConnected) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 6) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return Number(style.opacity || 1) > 0;
  }

  function claudeThreadHasUserMessages() {
    return !!document.querySelector(
      '[data-testid="user-message"], [data-testid="human-message"], .font-user-message'
    );
  }

  function claudeShowsHomeGreeting() {
    if (claudeThreadHasUserMessages()) {
      return false;
    }
    const spans = document.querySelectorAll("span.whitespace-nowrap.select-none");
    for (const span of spans) {
      if (!isClaudeElementVisible(span)) {
        continue;
      }
      if (span.closest('[data-testid="chat-input"], form')) {
        continue;
      }
      const text = String(span.textContent || "").trim();
      if (!text || text.length > 96) {
        continue;
      }
      if (CLAUDE_HOME_GREETING_TEXT_RE.test(text)) {
        return true;
      }
      // Other short personalized empty-state lines (e.g. "Hey, Leo").
      if (text.length >= 6 && text.length <= 72 && /^[A-Z]/.test(text) && /,\s*\S/.test(text)) {
        return true;
      }
    }
    return false;
  }

  /** Claude uses the uploaded filename as data-testid on thumbnail cells (e.g. "Resume OLD.pdf"). */
  const CLAUDE_ATTACHMENT_DATA_TESTID_RE =
    /\.(pdf|png|jpe?g|gif|webp|svg|docx?|txt|csv|xlsx?|pptx?|md|zip|heic|mov|mp4|mp3)$/i;

  function claudeDataTestIdLooksLikeAttachment(testId) {
    const tid = String(testId || "").trim();
    if (!tid || tid === "chat-input") {
      return false;
    }
    if (CLAUDE_ATTACHMENT_DATA_TESTID_RE.test(tid)) {
      return true;
    }
    return tid.includes(".") && !/\s/.test(tid) && tid.length <= 120;
  }

  function getClaudeComposerChromeElement(input) {
    if (!input) {
      return null;
    }
    let node = input.parentElement;
    for (let depth = 0; node && depth < 16; node = node.parentElement, depth += 1) {
      if (typeof node.getBoundingClientRect !== "function") {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 28) {
        continue;
      }
      const style = window.getComputedStyle(node);
      const radius = parseFloat(style.borderTopLeftRadius || "0");
      if (Number.isFinite(radius) && radius >= 6) {
        return node;
      }
    }
    return input.closest("form");
  }

  function getClaudeAttachmentStripElement(input) {
    const scope = getClaudeComposerScope(input);
    if (!scope || !input) {
      return null;
    }
    const inputTop = input.getBoundingClientRect().top;

    for (const node of scope.querySelectorAll("[data-testid]")) {
      if (!claudeDataTestIdLooksLikeAttachment(node.getAttribute("data-testid"))) {
        continue;
      }
      if (!isClaudeElementVisible(node)) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.bottom > inputTop + 8) {
        continue;
      }
      const strip =
        node.closest("div.overflow-x-auto") ||
        node.closest('[class*="group/thumbnail"]')?.parentElement;
      if (strip instanceof Element && isClaudeElementVisible(strip)) {
        const stripRect = strip.getBoundingClientRect();
        if (stripRect.height >= 32 && stripRect.width >= 80) {
          return strip;
        }
      }
    }

    for (const btn of scope.querySelectorAll('button[aria-label^="Remove "]')) {
      if (!isClaudeElementVisible(btn)) {
        continue;
      }
      const strip = btn.closest("div.overflow-x-auto");
      if (strip instanceof Element && isClaudeElementVisible(strip)) {
        const stripRect = strip.getBoundingClientRect();
        if (stripRect.bottom <= inputTop + 8 && stripRect.height >= 32) {
          return strip;
        }
      }
    }

    for (const row of scope.querySelectorAll("div.flex.flex-row.overflow-x-auto")) {
      if (!isClaudeElementVisible(row)) {
        continue;
      }
      const rowRect = row.getBoundingClientRect();
      if (rowRect.bottom <= inputTop + 8 && rowRect.height >= 32 && row.querySelector("img")) {
        return row;
      }
    }

    return null;
  }

  function getClaudeAttachmentStripTop(input) {
    const strip = getClaudeAttachmentStripElement(input);
    if (!strip) {
      return null;
    }
    const chrome = getClaudeComposerChromeElement(input);
    const stripRect = strip.getBoundingClientRect();
    if (chrome) {
      const chromeRect = chrome.getBoundingClientRect();
      if (chromeRect.top <= stripRect.top + 6) {
        return chromeRect.top;
      }
    }
    return stripRect.top;
  }

  function claudeComposerHasAttachmentStack(input, anchor) {
    if (getClaudeAttachmentStripElement(input)) {
      return true;
    }
    const root =
      (anchor instanceof Element && anchor) || input?.closest("form") || getClaudeChatInput(input)?.parentElement;
    if (!root || !input) {
      return false;
    }
    const inputTop = input.getBoundingClientRect().top;
    const rootTop = root.getBoundingClientRect().top;
    const attachmentSelectors = [
      '[data-testid*="attachment"]',
      '[class*="group/thumbnail"]',
      '[class*="attachment"]',
      '[class*="Attachment"]'
    ];
    for (const selector of attachmentSelectors) {
      let nodes = [];
      try {
        nodes = root.querySelectorAll(selector);
      } catch (_e) {
        continue;
      }
      for (const node of nodes) {
        if (!isClaudeElementVisible(node)) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (rect.height < 10 || rect.width < 10) {
          continue;
        }
        if (rect.bottom <= inputTop + 8 && rect.top >= rootTop - 8) {
          return true;
        }
      }
    }
    return false;
  }

  function claudeComposerIsStackedAboveInput(target, anchor, anchorRect, surfaceRect) {
    if (!surfaceRect || surfaceRect.width < 80) {
      return false;
    }
    const gapAboveEditor = surfaceRect.top - anchorRect.top;
    if (gapAboveEditor > 18) {
      return true;
    }
    const input = getClaudeChatInput(target);
    return claudeComposerHasAttachmentStack(input, anchor);
  }

  function claudeComposerIsStackedForTarget(target) {
    if (!isElement(target)) {
      return false;
    }
    const anchor = getAnchorElementForClaude(target);
    const anchorRect =
      anchor && typeof anchor.getBoundingClientRect === "function"
        ? anchor.getBoundingClientRect()
        : null;
    const surfaceRect = getPromptSurfaceRect(target) || target.getBoundingClientRect();
    if (!anchorRect) {
      return false;
    }
    return claudeComposerIsStackedAboveInput(target, anchor, anchorRect, surfaceRect);
  }

  function getClaudeComposerScope(input) {
    if (!isElement(input)) {
      return null;
    }
    const form = input.closest("form");
    if (form) {
      return form;
    }
    const fieldset = input.closest("fieldset");
    if (fieldset) {
      return fieldset;
    }
    let node = input.parentElement;
    for (let depth = 0; node && depth < 18 && node !== document.body; node = node.parentElement, depth += 1) {
      if (typeof node.getBoundingClientRect !== "function") {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width >= 260 && rect.height >= 40) {
        return node;
      }
    }
    return input.parentElement;
  }

  function isNearClaudeComposer(el, input) {
    if (!isElement(el) || !isElement(input)) {
      return false;
    }
    const inputRect = input.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (inputRect.width < 80 || rect.width < 8 || rect.height < 8) {
      return false;
    }
    const horizontalOverlap = rect.right >= inputRect.left - 48 && rect.left <= inputRect.right + 48;
    const aboveInput = rect.bottom <= inputRect.top + 24;
    const notTooFarAbove = rect.top >= inputRect.top - 220;
    return horizontalOverlap && aboveInput && notTooFarAbove;
  }

  function collectComposerSearchRoots(input, includeDocumentFallback) {
    const roots = [];
    const seen = new Set();
    const add = (root) => {
      if (!root || seen.has(root)) {
        return;
      }
      seen.add(root);
      roots.push(root);
      let nodes = [];
      try {
        nodes = root.querySelectorAll ? root.querySelectorAll("*") : [];
      } catch (_e) {
        return;
      }
      for (const node of nodes) {
        if (node.shadowRoot) {
          add(node.shadowRoot);
        }
      }
    };
    add(getClaudeComposerScope(input));
    if (includeDocumentFallback) {
      add(document);
    }
    return roots;
  }

  function claudeRootHasAttachmentSignals(root, input, requireProximity) {
    let removeBtns = [];
    let testIdNodes = [];
    let thumbs = [];
    let fileImgs = [];
    try {
      removeBtns = root.querySelectorAll('button[aria-label^="Remove "]');
      testIdNodes = root.querySelectorAll("[data-testid]");
      thumbs = root.querySelectorAll('[class*="group/thumbnail"]');
      fileImgs = root.querySelectorAll('img[src*="/files/"], img[src*="/api/"]');
    } catch (_e) {
      return false;
    }
    const near = (el) => !requireProximity || isNearClaudeComposer(el, input);

    for (const btn of removeBtns) {
      if (isClaudeElementVisible(btn) && near(btn)) {
        return true;
      }
    }
    for (const node of testIdNodes) {
      if (!claudeDataTestIdLooksLikeAttachment(node.getAttribute("data-testid"))) {
        continue;
      }
      if (isClaudeElementVisible(node) && near(node)) {
        return true;
      }
    }
    for (const thumb of thumbs) {
      if (isClaudeElementVisible(thumb) && near(thumb)) {
        return true;
      }
    }
    for (const img of fileImgs) {
      if (!isClaudeElementVisible(img) || !near(img)) {
        continue;
      }
      const src = String(img.getAttribute("src") || "");
      if (src.includes("thumbnail") || src.includes("/files/") || src.includes("/api/")) {
        return true;
      }
    }
    return false;
  }

  /** Simple attachment check for a manual vertical nudge (filename testids, Remove buttons, thumbnails). */
  function claudeHasUploadedAttachment(target) {
    const input = getClaudeChatInput(target);
    if (!input) {
      return false;
    }

    for (const root of collectComposerSearchRoots(input, false)) {
      if (claudeRootHasAttachmentSignals(root, input, false)) {
        return true;
      }
    }
    for (const root of collectComposerSearchRoots(input, true)) {
      if (claudeRootHasAttachmentSignals(root, input, true)) {
        return true;
      }
    }
    return false;
  }

  function claudeAttachmentDiagnostics(target) {
    const input = getClaudeChatInput(target);
    const scope = getClaudeComposerScope(input);
    return {
      hasInput: !!input,
      hasForm: !!input?.closest("form"),
      scopeTag: scope?.tagName || null,
      detected: claudeHasUploadedAttachment(target),
      removeButtons: collectComposerSearchRoots(input, true).reduce((n, root) => {
        try {
          return n + root.querySelectorAll('button[aria-label^="Remove "]').length;
        } catch (_e) {
          return n;
        }
      }, 0),
      filenameTestIds: collectComposerSearchRoots(input, true).reduce((n, root) => {
        try {
          for (const node of root.querySelectorAll("[data-testid]")) {
            if (claudeDataTestIdLooksLikeAttachment(node.getAttribute("data-testid"))) {
              n += 1;
            }
          }
        } catch (_e) {
          /* ignore */
        }
        return n;
      }, 0)
    };
  }

  function getClaudeComposerChromeTop(input, fallbackTop) {
    const chrome = getClaudeComposerChromeElement(input);
    if (chrome && typeof chrome.getBoundingClientRect === "function") {
      return chrome.getBoundingClientRect().top;
    }
    return fallbackTop;
  }

  function getClaudeChatInput(target) {
    if (!target || !isElement(target)) {
      return null;
    }
    return (
      target.closest('[data-testid="chat-input"]') ||
      (target.getAttribute("data-testid") === "chat-input" ? target : null)
    );
  }

  function getAnchorElementForClaude(target) {
    if (!target || !isElement(target)) {
      return target;
    }
    const input = getClaudeChatInput(target);
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
        const topGapPx = inputRect.top - rect.top;
        const topNotFarAbove = topGapPx >= -4 && topGapPx <= 56;
        if (widthCloseToInput && bottomNearInput && topNotFarAbove) {
          ancestors.push({ node, rect, topGapPx });
        }
        if (node.tagName === "FORM") {
          break;
        }
      }
      if (ancestors.length > 0) {
        // Prefer the innermost shell hugging the input (new-chat composers can be much taller).
        ancestors.sort((a, b) => {
          if (a.topGapPx !== b.topGapPx) {
            return a.topGapPx - b.topGapPx;
          }
          return a.rect.height - b.rect.height;
        });
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

  /**
   * Claude new-chat layouts stack starter UI above the editor inside a tall composer shell.
   * Empty-state greetings (e.g. "Good morning, Leo") use a centered composer — pin to the
   * rounded chrome top with a light upward nudge so the tab sits flush on the visible chat bar.
   */
  function getClaudeAnchorPlacementRect(target, anchor) {
    if (!isElement(target) || !isElement(anchor)) {
      return null;
    }
    const anchorRect = anchor.getBoundingClientRect();
    if (anchorRect.width < 120 || anchorRect.height < 20) {
      return null;
    }
    const input = getClaudeChatInput(target);
    const homeGreeting = claudeShowsHomeGreeting();
    const writeSurface = getPromptWriteSurface(target);
    const surfaceRect =
      writeSurface && typeof writeSurface.getBoundingClientRect === "function"
        ? writeSurface.getBoundingClientRect()
        : null;

    let top = anchorRect.top;
    if (homeGreeting) {
      top = getClaudeComposerChromeTop(input, anchorRect.top);
      top -= 4;
    } else if (surfaceRect && surfaceRect.width >= 80 && surfaceRect.height >= 12) {
      const gapAboveEditor = surfaceRect.top - anchorRect.top;
      const growthBelowEditor = anchorRect.bottom - surfaceRect.bottom;
      const tallBelow = growthBelowEditor > 28 && gapAboveEditor <= 12;

      if (tallBelow) {
        // Multiline growth inside the editor only — keep the tab on the typing surface.
        top = surfaceRect.top;
      }
    }

    return {
      left: anchorRect.left,
      width: anchorRect.width,
      top
    };
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
    getClaudeAnchorPlacementRect,
    claudeShowsHomeGreeting,
    claudeHasUploadedAttachment,
    claudeAttachmentDiagnostics,
    getSessionVerificationHints
  };
})();
