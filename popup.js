const promptEl = document.getElementById('prompt');
const enabledEl = document.getElementById('enabled');
const reasoningEl = document.getElementById('showReasoning');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save');
const resetBtn = document.getElementById('reset');
const listEl = document.getElementById('actions-list');
const addBtn = document.getElementById('addAction');

let actions = []; // [{id, name, prompt}]

const flash = (msg) => {
  statusEl.textContent = msg;
  setTimeout(() => {
    statusEl.textContent = '';
  }, 1500);
};

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  Math.random().toString(36).slice(2);

function renderActions() {
  listEl.innerHTML = '';
  if (!actions.length) {
    const empty = document.createElement('div');
    empty.className = 'actions-empty';
    empty.textContent = 'No custom actions yet.';
    listEl.appendChild(empty);
    return;
  }
  for (const action of actions) {
    const row = document.createElement('div');
    row.className = 'action-row';
    row.dataset.id = action.id;
    row.innerHTML = `
      <div class="action-head">
        <input type="text" class="action-name" placeholder="Name (e.g. Pirate)" />
        <button type="button" class="action-delete" title="Delete">×</button>
      </div>
      <textarea class="action-prompt" placeholder="System prompt..."></textarea>
    `;
    const nameEl = row.querySelector('.action-name');
    const promptInput = row.querySelector('.action-prompt');
    const delBtn = row.querySelector('.action-delete');
    nameEl.value = action.name || '';
    promptInput.value = action.prompt || '';
    nameEl.addEventListener('input', () => {
      action.name = nameEl.value;
    });
    promptInput.addEventListener('input', () => {
      action.prompt = promptInput.value;
    });
    delBtn.addEventListener('click', () => {
      actions = actions.filter((a) => a.id !== action.id);
      renderActions();
    });
    listEl.appendChild(row);
  }
}

addBtn.addEventListener('click', () => {
  actions.push({ id: uid(), name: '', prompt: '' });
  renderActions();
  // focus the new name field
  const last = listEl.querySelector('.action-row:last-child .action-name');
  if (last) last.focus();
});

chrome.storage.local.get(
  ['systemPrompt', 'enabled', 'showReasoning', 'customActions'],
  (s) => {
    promptEl.value = s.systemPrompt || '';
    enabledEl.checked = !!s.enabled;
    reasoningEl.checked = s.showReasoning !== false; // default on
    actions = Array.isArray(s.customActions) ? s.customActions.map((a) => ({ ...a })) : [];
    renderActions();
  }
);

saveBtn.addEventListener('click', () => {
  // strip out empty rows on save
  const cleaned = actions
    .filter((a) => (a.name && a.name.trim()) || (a.prompt && a.prompt.trim()))
    .map((a) => ({
      id: a.id || uid(),
      name: (a.name || '').trim(),
      prompt: a.prompt || '',
    }));
  actions = cleaned;
  renderActions();
  chrome.storage.local.set(
    {
      systemPrompt: promptEl.value,
      enabled: enabledEl.checked,
      showReasoning: reasoningEl.checked,
      customActions: cleaned,
    },
    () => flash('Saved')
  );
});

resetBtn.addEventListener('click', () => {
  promptEl.value = '';
  enabledEl.checked = false;
  reasoningEl.checked = true;
  actions = [];
  renderActions();
  chrome.storage.local.set(
    { systemPrompt: '', enabled: false, showReasoning: true, customActions: [] },
    () => flash('Reset')
  );
});

enabledEl.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabledEl.checked });
});

reasoningEl.addEventListener('change', () => {
  chrome.storage.local.set({ showReasoning: reasoningEl.checked });
});
