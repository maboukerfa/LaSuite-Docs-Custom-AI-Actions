(() => {
  const KEYS = ['systemPrompt', 'enabled', 'showReasoning'];

  const post = (state) => {
    window.postMessage(
      {
        __docsAiPrompt: true,
        systemPrompt: state.systemPrompt || '',
        enabled: !!state.enabled,
        showReasoning: state.showReasoning !== false, // default true
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
