const key = document.getElementById('key');
chrome.storage.sync.get('key').then((v) => { key.value = v.key || ''; });
key.addEventListener('change', () => chrome.storage.sync.set({ key: key.value.trim() }));
document.getElementById('page').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'sign-page' }); window.close(); });
