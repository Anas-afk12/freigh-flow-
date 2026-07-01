// Lightweight toast notifications.
const Toast = (() => {
  function stack() {
    let el = document.getElementById('toast-stack');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-stack';
      document.body.appendChild(el);
    }
    return el;
  }
  function show(message, type = 'info', ms = 3200) {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    stack().appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .3s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }, ms);
  }
  return {
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error', 4500),
    info: (m) => show(m, 'info'),
  };
})();
