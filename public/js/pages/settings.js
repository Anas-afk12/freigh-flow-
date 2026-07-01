// Settings controller: load + save the editable settings map.
(() => {
  const form = document.getElementById('settings-form');

  async function load() {
    try {
      const s = await API.get('/settings');
      for (const [k, v] of Object.entries(s)) {
        if (form.elements[k]) form.elements[k].value = v;
      }
    } catch (e) { Toast.error(e.message); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = v; });
    const errEl = document.querySelector('[data-err="exchange_rate"]');
    if (errEl) errEl.textContent = '';
    if (Number(data.exchange_rate) <= 0 || Number.isNaN(Number(data.exchange_rate))) {
      if (errEl) errEl.textContent = 'Must be a positive number';
      return;
    }
    try { await API.put('/settings', data); Toast.success('Settings saved.'); }
    catch (err) { Toast.error(err.message); }
  });

  load();
})();
