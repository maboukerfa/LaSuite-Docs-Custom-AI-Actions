(() => {
  const KEYS = ['showReasoning', 'customActions'];

  const post = (state) => {
    window.postMessage(
      {
        __docsAiPrompt: true,
        showReasoning: state.showReasoning !== false, // default true
        customActions: Array.isArray(state.customActions) ? state.customActions : [],
      },
      '*'
    );
  };

  chrome.storage.local.get(KEYS, post);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    chrome.storage.local.get(KEYS, post);
  });
})();
