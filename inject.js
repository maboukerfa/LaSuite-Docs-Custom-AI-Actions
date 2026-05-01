(() => {
  const TAG = '[docs-ai-prompt]';
  let systemPrompt = '';
  let enabled = false;
  let showReasoning = true;

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.__docsAiPrompt !== true) return;
    if (typeof data.systemPrompt === 'string') systemPrompt = data.systemPrompt;
    if (typeof data.enabled === 'boolean') enabled = data.enabled;
    if (typeof data.showReasoning === 'boolean') showReasoning = data.showReasoning;
  });

  // ---- minimal markdown → HTML ---------------------------------------------
  const escapeHtml = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function md(text) {
    let t = escapeHtml(text);
    // fenced code blocks ```lang\n...\n```
    t = t.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, _lang, code) =>
      `<pre><code>${code.replace(/\n$/, '')}</code></pre>`
    );
    // headings
    t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    t = t.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    t = t.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // bold / italic / inline code
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // unordered list lines
    t = t.replace(/(?:^|\n)((?:- .+(?:\n|$))+)/g, (m, block) => {
      const items = block
        .trim()
        .split('\n')
        .map((l) => `<li>${l.replace(/^- /, '')}</li>`)
        .join('');
      return `\n<ul>${items}</ul>`;
    });
    // paragraphs
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
      // page may not be fully ready at document_start, defer
      window.addEventListener('DOMContentLoaded', () => showTip(reasoning, streaming), { once: true });
      return;
    }
    ensureTip();
    tipEl.style.display = 'flex';
    tipEl.classList.remove('dap-collapsed');
    tipBodyEl.innerHTML = md(reasoning || '_(no reasoning emitted)_');
    tipBodyEl.classList.toggle('dap-streaming', !!streaming);
  }

  // ---- patched fetch -------------------------------------------------------
  const origFetch = window.fetch;

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';

    if (!enabled || !url.includes('/ai-transform/') || !init || !init.body) {
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

    const newUrl = url.replace('/ai-transform/', '/ai-proxy/');
    const newBody = JSON.stringify({
      trigger: 'submit-message',
      id: crypto.randomUUID(),
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'system',
          parts: [{ type: 'text', text: systemPrompt || 'You are a helpful assistant.' }],
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
      // throttle repaints to ~10fps
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
