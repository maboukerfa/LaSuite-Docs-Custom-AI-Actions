# LaSuite Docs Custom AI Actions

Browser extension that adds user-defined AI actions to
[docs.numerique.gouv.fr](https://docs.numerique.gouv.fr) (la suite docs). Each
action is a name + custom system prompt, injected into both the BlockNote
"Ask AI" menu and the legacy "Actions IA" toolbar dropdown. Click one to apply
its prompt to the current selection.

## Install (Chrome / Edge / Brave)

1. Clone this repo.
2. Open `chrome://extensions`, enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. The extension icon should now appear in the toolbar.

## Usage

1. Click the extension icon to open the popup.
2. Click **+ Add action**, give it a name (e.g. `Pirate`) and a system prompt
   (e.g. `Rewrite the user's selection in pirate speak. Only output the rewritten text.`).
3. Click **Save**.
4. Open a doc on `docs.numerique.gouv.fr`, select some text, then either:
   - Open the **Ask AI** menu (BlockNote) — your action appears at the top with a `★` prefix.
   - Open the **Actions IA** toolbar dropdown (legacy) — same.
5. Click your action. The selection is replaced by the model's response,
   generated with your custom system prompt.

The popup also has a **Show reasoning tip** toggle: when on, a floating panel
appears in the bottom-right while the model is responding, displaying its
reasoning trace (when the model emits one).

## How it works

- A content script in MAIN world (`inject.js`) patches `window.fetch` and
  watches the DOM for the two AI menus.
- When either menu mounts, the script clones an existing item per custom
  action so styling matches automatically and inserts them at the top.
- Clicking a custom action sets a one-shot system-prompt override and either:
  - **Ask AI menu** — fills the AI input with the action name and dispatches
    Enter, so BlockNote's normal `invokeAI` → `/ai-proxy/` →
    `applyDocumentOperations` flow runs. The fetch patch prepends the
    override as a `system` message.
  - **Actions IA dropdown** — synthetically clicks an existing legacy item
    so BlockNote's `editor.blocksToMarkdownLossy → POST /ai-transform/ →
    editor.replaceBlocks` flow runs. The fetch patch rewrites the request
    to `/ai-proxy/` and uses the override as the system prompt.
- A bridge script in ISOLATED world (`bridge.js`) syncs settings from
  `chrome.storage.local` to the page via `window.postMessage`.

No global "intercept everything" mode — the patch only touches a request
when one of your custom actions was just clicked.

## Files

- `manifest.json` — MV3 manifest, host-permitted to `docs.numerique.gouv.fr`.
- `bridge.js` — content script (ISOLATED world), bridges storage ↔ page.
- `inject.js` — content script (MAIN world), DOM injection + fetch patch.
- `popup.html` / `popup.js` — popup UI to manage custom actions.

## Caveats

- DOM-injection is fragile by design: a frontend release that renames
  `#ai-suggestion-menu`, `mantine-Menu-item`, or `--docs--ai-actions-menu`
  will silently break injection. Open the DevTools console to see
  `[docs-ai-prompt]` log lines that indicate which step failed.
- The legacy dropdown delegates to an existing item (e.g. "Use as prompt"),
  so its loading spinner briefly appears on the wrong row — the request
  itself uses your custom prompt.
- Tested against la suite docs `v4.8.6`. Earlier or later versions may differ.

## License

MIT.
