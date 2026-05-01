const promptEl = document.getElementById('prompt');
const enabledEl = document.getElementById('enabled');
const reasoningEl = document.getElementById('showReasoning');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save');
const resetBtn = document.getElementById('reset');

const flash = (msg) => {
  statusEl.textContent = msg;
  setTimeout(() => {
    statusEl.textContent = '';
  }, 1500);
};

chrome.storage.local.get(['systemPrompt', 'enabled', 'showReasoning'], (s) => {
  promptEl.value = s.systemPrompt || '';
  enabledEl.checked = !!s.enabled;
  reasoningEl.checked = s.showReasoning !== false; // default on
});

saveBtn.addEventListener('click', () => {
  chrome.storage.local.set(
    {
      systemPrompt: promptEl.value,
      enabled: enabledEl.checked,
      showReasoning: reasoningEl.checked,
    },
    () => flash('Saved')
  );
});

resetBtn.addEventListener('click', () => {
  promptEl.value = '';
  enabledEl.checked = false;
  reasoningEl.checked = true;
  chrome.storage.local.set(
    { systemPrompt: '', enabled: false, showReasoning: true },
    () => flash('Reset')
  );
});

enabledEl.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabledEl.checked });
});

reasoningEl.addEventListener('change', () => {
  chrome.storage.local.set({ showReasoning: reasoningEl.checked });
});
