'use strict';
(() => {
  const button = document.getElementById('previousPageButton');
  if (!button) return;
  button.addEventListener('click', () => {
    if (button.dataset.returnAlways === 'true' && button.dataset.fallbackUrl) {
      window.location.assign(button.dataset.fallbackUrl);
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.assign(button.dataset.fallbackUrl);
    }
  });
})();
