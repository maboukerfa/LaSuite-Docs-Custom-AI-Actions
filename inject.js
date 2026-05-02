(() => {
  const TAG = '[docs-ai-prompt]';
  let systemPrompt = '';
  let enabled = false;
  let showReasoning = true;
  let customActions = []; // [{id, name, prompt}]

  // one-shot: when set, the next /ai-proxy/ request gets this system prompt
  // prepended to its messages array
  let pendingActionOverride = null;

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.__docsAiPrompt !== true) return;
    if (typeof data.systemPrompt === 'string') systemPrompt = data.systemPrompt;
    if (typeof data.enabled === 'boolean') enabled = data.enabled;
    if (typeof data.showReasoning === 'boolean') showReasoning = data.showReasoning;
    if (Array.isArray(data.customActions)) {
      customActions = data.customActions.filter((a) => a && a.name);
      // re-sync menu on next mutation tick
      syncCustomItems();
    }
  });

  // ---- minimal markdown → HTML ---------------------------------------------
  const escapeHtml = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function md(text) {
    let t = escapeHtml(text);
    t = t.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, _lang, code) =>
      `<pre><code>${code.replace(/\n$/, '')}</code></pre>`
    );
    t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    t = t.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    t = t.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    t = t.replace(/(?:^|\n)((?:- .+(?:\n|$))+)/g, (m, block) => {
      const items = block
        .trim()
        .split('\n')
        .map((l) => `<li>${l.replace(/^- /, '')}</li>`)
        .join('');
      return `\n<ul>${items}</ul>`;
    });
    t = t
      .split(/\n{2,}/)
      .map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return '';
        if (/^<(h\d|ul|pre|ol|blockquote)/.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');
    return t;
  }

  // ---- floating reasoning tip ----------------------------------------------
  let tipEl = null;
  let tipBodyEl = null;

  function ensureTip() {
    if (tipEl) return;
    tipEl = document.createElement('div');
    tipEl.id = '__docs_ai_reasoning_tip';
    tipEl.innerHTML = `
      <div class="dap-head">
        <span class="dap-title">LLM reasoning</span>
        <button class="dap-toggle" title="Collapse">_</button>
        <button class="dap-close" title="Close">×</button>
      </div>
      <div class="dap-body"></div>
    `;
    const style = document.createElement('style');
    style.textContent = `
      #__docs_ai_reasoning_tip {
        position: fixed;
        right: 16px;
        bottom: 16px;
        width: 380px;
        max-height: 60vh;
        background: #1f2328;
        color: #eaeef2;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 12px;
        line-height: 1.5;
        border-radius: 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,.25);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      #__docs_ai_reasoning_tip .dap-head {
        display: flex;
        align-items: center;
        padding: 8px 10px;
        background: #2d333b;
        border-bottom: 1px solid #444c56;
        gap: 6px;
      }
      #__docs_ai_reasoning_tip .dap-title {
        flex: 1;
        font-weight: 600;
        font-size: 12px;
        letter-spacing: .02em;
        opacity: .9;
      }
      #__docs_ai_reasoning_tip button {
        background: transparent;
        border: 0;
        color: #adbac7;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 14px;
        line-height: 1;
        border-radius: 4px;
      }
      #__docs_ai_reasoning_tip button:hover { background: #444c56; color: #fff; }
      #__docs_ai_reasoning_tip .dap-body {
        padding: 10px 12px;
        overflow-y: auto;
        white-space: normal;
      }
      #__docs_ai_reasoning_tip.dap-collapsed .dap-body { display: none; }
      #__docs_ai_reasoning_tip .dap-body p { margin: 0 0 8px; }
      #__docs_ai_reasoning_tip .dap-body h1,
      #__docs_ai_reasoning_tip .dap-body h2,
      #__docs_ai_reasoning_tip .dap-body h3 {
        margin: 8px 0 4px;
        font-size: 13px;
      }
      #__docs_ai_reasoning_tip .dap-body code {
        background: #2d333b;
        padding: 1px 4px;
        border-radius: 3px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
      }
      #__docs_ai_reasoning_tip .dap-body pre {
        background: #2d333b;
        padding: 8px;
        border-radius: 6px;
        overflow-x: auto;
        margin: 6px 0;
      }
      #__docs_ai_reasoning_tip .dap-body pre code { background: transparent; padding: 0; }
      #__docs_ai_reasoning_tip .dap-body ul { margin: 4px 0 8px; padding-left: 20px; }
      #__docs_ai_reasoning_tip .dap-streaming::after {
        content: '▌';
        opacity: .6;
        margin-left: 2px;
      }
    `;
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(tipEl);
    tipBodyEl = tipEl.querySelector('.dap-body');
    tipEl.querySelector('.dap-close').addEventListener('click', () => {
      tipEl.style.display = 'none';
    });
    tipEl.querySelector('.dap-toggle').addEventListener('click', () => {
      tipEl.classList.toggle('dap-collapsed');
    });
  }

  function showTip(reasoning, streaming) {
    if (!showReasoning) return;
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', () => showTip(reasoning, streaming), { once: true });
      return;
    }
    ensureTip();
    tipEl.style.display = 'flex';
    tipEl.classList.remove('dap-collapsed');
    tipBodyEl.innerHTML = md(reasoning || '_(no reasoning emitted)_');
    tipBodyEl.classList.toggle('dap-streaming', !!streaming);
  }

  // ---- custom-action injection into BlockNote AI menu ----------------------
  // Strategy: find #ai-suggestion-menu, clone an existing item per custom action
  // so styling matches automatically. Tag each clone so we don't double-inject.
  // The menu re-renders as the user types; observer re-injects when wiped.

  const ACTION_CLASS = 'dap-custom-action';
  const ACTION_INDEX_ATTR = 'data-dap-action-id';

  function findExistingItem(menu) {
    return (
      menu.querySelector(`.bn-suggestion-menu-item-small:not(.${ACTION_CLASS})`) ||
      menu.querySelector(`[role="menuitem"]:not(.${ACTION_CLASS})`) ||
      menu.querySelector(`.mantine-Menu-item:not(.${ACTION_CLASS})`) ||
      null
    );
  }

  function injectAction(menu, template, action) {
    const node = template.cloneNode(true);
    node.classList.add(ACTION_CLASS);
    node.setAttribute(ACTION_INDEX_ATTR, action.id);
    // remove icon img/svg if present so our marker doesn't clash with the cloned glyph
    const iconHolder = node.querySelector('[data-position="left"]');
    if (iconHolder) iconHolder.textContent = '★';
    // replace title text — try common BlockNote/Mantine class names, fall back to first text node
    const title =
      node.querySelector('.bn-mt-suggestion-menu-item-title') ||
      node.querySelector('.mantine-Text-root') ||
      node.querySelector('[class*="title" i]');
    if (title) {
      title.textContent = action.name;
    } else {
      // fallback: replace all text content with the action name
      // (preserves nested element structure but rewrites visible text)
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let first = walker.nextNode();
      if (first) first.nodeValue = action.name;
      while (walker.nextNode()) walker.currentNode.nodeValue = '';
    }
    // replace subtitle with prompt preview
    const subtitle =
      node.querySelector('.bn-mt-suggestion-menu-item-subtitle') ||
      node.querySelector('[class*="subtitle" i]');
    if (subtitle) {
      const preview = (action.prompt || '').replace(/\s+/g, ' ').slice(0, 60);
      subtitle.textContent = preview;
    }
    // strip every existing event listener by replacing with a fresh clone
    const fresh = node.cloneNode(true);
    fresh.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        runCustomAction(action);
      },
      true
    );
    fresh.addEventListener(
      'mousedown',
      (ev) => {
        // some menus close on mousedown outside the input — keep focus
        ev.preventDefault();
      },
      true
    );
    menu.appendChild(fresh);
  }

  function syncCustomItems() {
    syncBlockNoteMenu();
    syncLegacyDropdown();
  }

  function syncBlockNoteMenu() {
    const menu = document.getElementById('ai-suggestion-menu');
    if (!menu) return;
    if (!enabled || customActions.length === 0) {
      menu.querySelectorAll(`.${ACTION_CLASS}`).forEach((n) => n.remove());
      return;
    }
    const existing = findExistingItem(menu);
    if (!existing) return;
    const present = new Set(
      Array.from(menu.querySelectorAll(`.${ACTION_CLASS}`)).map((n) =>
        n.getAttribute(ACTION_INDEX_ATTR)
      )
    );
    for (const action of customActions) {
      if (present.has(action.id)) continue;
      injectAction(menu, existing, action);
    }
    const wantedIds = new Set(customActions.map((a) => a.id));
    menu.querySelectorAll(`.${ACTION_CLASS}`).forEach((n) => {
      if (!wantedIds.has(n.getAttribute(ACTION_INDEX_ATTR))) n.remove();
    });
  }

  // ---- legacy "Actions IA" dropdown (AIButtonMIT) --------------------------
  // The class `--docs--ai-actions-menu` starts with `--`, which CSS reserves
  // for custom properties — use [class~="..."] attribute matching to dodge
  // any escaping issues. Same for the language sub-trigger we want to skip.
  const LEGACY_ACTION_CLASS = 'dap-custom-legacy-action';
  const LEGACY_DROPDOWN_SEL = '[class~="--docs--ai-actions-menu"]';
  const LEGACY_TRANSLATE_TRIGGER_SEL = '[class~="--docs--ai-translate-menu-trigger"]';
  let legacyLogged = false;

  function findLegacyDropdown() {
    return document.querySelector(LEGACY_DROPDOWN_SEL);
  }

  function findLegacyItem(dropdown) {
    // Action items are rendered as Mantine Menu.Item without a custom class
    // (only mantine-Menu-item). The language sub-trigger also has that class
    // plus --docs--ai-translate-menu-trigger — skip it. Try several
    // candidate selectors for resilience.
    const all = dropdown.querySelectorAll(
      '[class~="mantine-Menu-item"], [class*="Menu-item"], [role="menuitem"], button'
    );
    for (const c of all) {
      if (c.classList.contains(LEGACY_ACTION_CLASS)) continue;
      if (c.matches(LEGACY_TRANSLATE_TRIGGER_SEL)) continue;
      if (c.querySelector(LEGACY_TRANSLATE_TRIGGER_SEL)) continue;
      // skip elements that are children of a menu-item we'll find separately
      if (c.closest(`.${LEGACY_ACTION_CLASS}`)) continue;
      return c;
    }
    return null;
  }

  function injectLegacyAction(dropdown, template, action) {
    const node = template.cloneNode(true);
    node.classList.add(LEGACY_ACTION_CLASS);
    node.setAttribute(ACTION_INDEX_ATTR, action.id);
    // overwrite icon area with star marker
    const iconHolder =
      node.querySelector('.mantine-Menu-itemSection[data-position="left"]') ||
      node.querySelector('[data-position="left"]') ||
      node.querySelector('[class*="itemSection"]');
    if (iconHolder) iconHolder.textContent = '★';
    // overwrite label
    const label =
      node.querySelector('.mantine-Menu-itemLabel') ||
      node.querySelector('[class*="itemLabel"]') ||
      node.querySelector('[class*="Label"]');
    if (label) {
      label.textContent = action.name;
    } else {
      // fallback: rewrite the first text node found
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      if (first) first.nodeValue = action.name;
    }
    // strip React listeners by re-cloning, then attach our own
    const fresh = node.cloneNode(true);
    fresh.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        runCustomLegacyAction(action);
      },
      true
    );
    fresh.addEventListener(
      'mousedown',
      (ev) => {
        // Mantine often closes on outside-click via mousedown — keep it open
        ev.stopPropagation();
      },
      true
    );
    dropdown.appendChild(fresh);
  }

  function runCustomLegacyAction(action) {
    const dropdown = findLegacyDropdown();
    if (!dropdown) {
      console.warn(TAG, 'legacy dropdown vanished before delegate');
      return;
    }
    const target = findLegacyItem(dropdown);
    if (!target) {
      console.warn(TAG, 'no legacy item to delegate to');
      return;
    }
    pendingActionOverride = action.prompt || '';
    console.log(TAG, 'custom legacy action →', action.name, '(via', target.textContent.trim(), ')');
    // dispatch a full pointer + click sequence so React's synthetic onClick fires
    const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.dispatchEvent(new MouseEvent('click', opts));
  }

  function syncLegacyDropdown() {
    const dropdown = findLegacyDropdown();
    if (!dropdown) return;
    if (!legacyLogged) {
      console.log(TAG, 'legacy dropdown detected:', dropdown);
      legacyLogged = true;
    }
    if (customActions.length === 0) {
      dropdown.querySelectorAll(`.${LEGACY_ACTION_CLASS}`).forEach((n) => n.remove());
      return;
    }
    const template = findLegacyItem(dropdown);
    if (!template) {
      console.warn(TAG, 'no legacy template item yet, will retry on next mutation');
      return;
    }
    const present = new Set(
      Array.from(dropdown.querySelectorAll(`.${LEGACY_ACTION_CLASS}`)).map((n) =>
        n.getAttribute(ACTION_INDEX_ATTR)
      )
    );
    for (const action of customActions) {
      if (present.has(action.id)) continue;
      injectLegacyAction(dropdown, template, action);
    }
    const wantedIds = new Set(customActions.map((a) => a.id));
    dropdown.querySelectorAll(`.${LEGACY_ACTION_CLASS}`).forEach((n) => {
      if (!wantedIds.has(n.getAttribute(ACTION_INDEX_ATTR))) n.remove();
    });
  }

  // run the action: prime override, fill input, dispatch Enter so BlockNote's
  // own onManualPromptSubmit pipeline runs (which calls invokeAI → /ai-proxy/
  // → applyDocumentOperations to actually edit the doc).
  function runCustomAction(action) {
    const input = document.querySelector('input[name="ai-prompt"]');
    if (!input) {
      console.warn(TAG, 'no ai-prompt input found');
      return;
    }
    pendingActionOverride = action.prompt || '';
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    setter.call(input, action.name || 'Apply.');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // submit
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      })
    );
    input.dispatchEvent(
      new KeyboardEvent('keypress', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      })
    );
    input.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      })
    );
  }

  // observe document for the suggestion menu mounting/re-rendering
  const docObserver = new MutationObserver(() => {
    syncCustomItems();
  });
  if (document.documentElement) {
    docObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      docObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
  }

  // ---- patched fetch -------------------------------------------------------
  const origFetch = window.fetch;

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';

    // 1) /ai-proxy/ override for custom actions — prepend system prompt and pass through
    if (
      pendingActionOverride !== null &&
      url.includes('/ai-proxy/') &&
      init &&
      typeof init.body === 'string'
    ) {
      const override = pendingActionOverride;
      pendingActionOverride = null;
      try {
        const body = JSON.parse(init.body);
        if (Array.isArray(body.messages)) {
          body.messages.unshift({
            id: crypto.randomUUID(),
            role: 'system',
            parts: [{ type: 'text', text: override }],
          });
          init = { ...init, body: JSON.stringify(body) };
          console.log(TAG, 'custom-action system prompt injected for /ai-proxy/');
        }
      } catch (err) {
        console.warn(TAG, 'failed to inject custom-action prompt:', err);
      }
      return origFetch(input, init);
    }

    // 2) /ai-transform/ → /ai-proxy/ rewrite. Runs when either the global
    //    intercept is enabled OR a legacy custom-action override is pending.
    //    The override wins for the prompt and bypasses the enabled gate.
    const isTransform =
      url.includes('/ai-transform/') && init && typeof init.body === 'string';
    const useOverride = pendingActionOverride !== null && isTransform;
    if (!isTransform || (!enabled && !useOverride)) {
      return origFetch(input, init);
    }

    let parsed;
    try {
      parsed = JSON.parse(init.body);
    } catch {
      return origFetch(input, init);
    }
    const userText = parsed && parsed.text;
    if (typeof userText !== 'string') return origFetch(input, init);

    const promptForRequest = useOverride
      ? pendingActionOverride
      : systemPrompt || 'You are a helpful assistant.';
    if (useOverride) {
      pendingActionOverride = null;
      console.log(TAG, '/ai-transform/ using custom-action override prompt');
    }

    const newUrl = url.replace('/ai-transform/', '/ai-proxy/');
    const newBody = JSON.stringify({
      trigger: 'submit-message',
      id: crypto.randomUUID(),
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'system',
          parts: [{ type: 'text', text: promptForRequest }],
        },
        {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: userText }],
        },
      ],
    });

    let sseRes;
    try {
      sseRes = await origFetch(newUrl, { ...init, body: newBody });
    } catch (err) {
      console.warn(TAG, 'proxy request failed, falling back:', err);
      return origFetch(input, init);
    }

    if (!sseRes.ok || !sseRes.body) {
      console.warn(TAG, 'proxy returned non-ok, falling back:', sseRes.status);
      return origFetch(input, init);
    }

    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let answer = '';
    let reasoning = '';
    let buf = '';
    let lastPaint = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      let touchedReasoning = false;
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'text-delta' && typeof ev.delta === 'string') {
            answer += ev.delta;
          } else if (ev.type === 'reasoning-delta' && typeof ev.delta === 'string') {
            reasoning += ev.delta;
            touchedReasoning = true;
          }
        } catch {}
      }
      const now = Date.now();
      if (touchedReasoning && now - lastPaint > 100) {
        showTip(reasoning, true);
        lastPaint = now;
      }
    }

    if (reasoning) showTip(reasoning, false);

    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  console.log(TAG, 'fetch interceptor installed');
})();
