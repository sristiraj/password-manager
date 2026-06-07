// Runs in MAIN world — intercepts programmatic clipboard writes (e.g. GitHub "Copy" buttons)
(function () {
  if (!navigator.clipboard?.writeText) return;
  const _orig = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = async function (text) {
    const result = await _orig(text);
    if (typeof text === "string" && text.length >= 20 && !/\s/.test(text)) {
      window.dispatchEvent(new CustomEvent("__pm_clipboard_write__", { detail: text }));
    }
    return result;
  };
})();
