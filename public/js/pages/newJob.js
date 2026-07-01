// New/Edit job controller. Populates master-data dropdowns, collects the form,
// supports editing an existing job via ?id=, and lets the user attach
// containers at creation time. Validation mirrors the server.
(() => {
  const form = document.getElementById('job-form');
  const editId = new URLSearchParams(location.search).get('id');
  const containerRows = [];
  let containerTypes = [];

  async function populateSelect(select, items, { valueKey = 'id', labelKey = 'name', placeholder } = {}) {
    select.innerHTML =
      (placeholder ? `<option value="">${placeholder}</option>` : '') +
      items.map((i) => `<option value="${i[valueKey]}">${i[labelKey]}</option>`).join('');
  }

  async function loadOptions() {
    const [clients, ports, commodities, cTypes] = await Promise.all([
      API.get('/clients?active=1'),
      API.get('/ports?active=1'),
      API.get('/commodities?active=1'),
      API.get('/container-types?active=1'),
    ]);
    containerTypes = cTypes;
    document.querySelectorAll('select[data-role="SHIPPER"]').forEach((s) => populateSelect(s, clients.filter((c) => c.type === 'SHIPPER'), { placeholder: '— select —' }));
    document.querySelectorAll('select[data-role="CONSIGNEE"]').forEach((s) => populateSelect(s, clients.filter((c) => c.type === 'CONSIGNEE'), { placeholder: '— select —' }));
    document.querySelectorAll('select[data-role="NOTIFY"]').forEach((s) => populateSelect(s, clients.filter((c) => c.type === 'NOTIFY'), { placeholder: '— none —' }));
    document.querySelectorAll('select[data-role="COMMODITY"]').forEach((s) => populateSelect(s, commodities, { placeholder: '— select —' }));
    document.querySelectorAll('select[data-role="PORT"]').forEach((s) => populateSelect(s, ports, { placeholder: '— select —' }));
  }

  function containerRowHtml(idx) {
    const opts = containerTypes.map((t) => `<option value="${t.id}">${t.code}</option>`).join('');
    return `<div class="grid grid-4" data-cidx="${idx}" style="margin-bottom:8px;">
      <div class="field"><label>Container #</label><input data-f="container_number" /></div>
      <div class="field"><label>Type</label><select data-f="container_type_id"><option value="">—</option>${opts}</select></div>
      <div class="field"><label>Seal #</label><input data-f="seal_number" /></div>
      <div class="field"><label>Status</label>
        <div style="display:flex;gap:6px;">
          <select data-f="status"><option>EMPTY</option><option>FULL</option><option>INTRANSIT</option><option>DELIVERED</option></select>
          <button type="button" class="btn btn-sm btn-danger" data-remove="${idx}">✕</button>
        </div>
      </div>
    </div>`;
  }

  function addContainerRow() {
    const idx = containerRows.length;
    containerRows.push(idx);
    const wrap = document.getElementById('new-containers');
    wrap.insertAdjacentHTML('beforeend', containerRowHtml(idx));
    wrap.querySelector(`[data-remove="${idx}"]`).addEventListener('click', (e) => {
      e.target.closest('[data-cidx]').remove();
    });
  }

  function collectContainers() {
    return [...document.querySelectorAll('#new-containers [data-cidx]')].map((row) => {
      const get = (f) => { const el = row.querySelector(`[data-f="${f}"]`); return el && el.value ? el.value : null; };
      return {
        container_number: get('container_number'),
        container_type_id: get('container_type_id'),
        seal_number: get('seal_number'),
        status: get('status') || 'EMPTY',
      };
    }).filter((c) => c.container_number || c.container_type_id);
  }

  function collectForm() {
    const data = {};
    let valid = true;
    new FormData(form).forEach((v, k) => { data[k] = v === '' ? null : v; });
    // Numeric checks mirror server.
    for (const f of ['packages', 'gross_weight', 'net_weight']) {
      const errEl = document.querySelector(`[data-err="${f}"]`);
      if (errEl) errEl.textContent = '';
      if (!Validate.nonNegative(data[f])) {
        if (errEl) errEl.textContent = 'Must be a number ≥ 0';
        valid = false;
      }
    }
    return valid ? data : null;
  }

  async function loadForEdit() {
    const job = await API.get(`/jobs/${editId}`);
    document.getElementById('title').textContent = `Edit Job ${job.job_number}`;
    document.getElementById('save-btn').textContent = 'Update Job';
    document.getElementById('containers-card').style.display = 'none'; // containers managed on detail page
    for (const [k, v] of Object.entries(job)) {
      const el = form.elements[k];
      if (el && v != null) el.value = v;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collectForm();
    if (!data) { Toast.error('Please fix the highlighted fields.'); return; }
    try {
      if (editId) {
        await API.put(`/jobs/${editId}`, data);
        Toast.success('Job updated.');
        setTimeout(() => (location.href = `job-detail.html?id=${editId}`), 500);
      } else {
        data.containers = collectContainers();
        const job = await API.post('/jobs', data);
        Toast.success(`Job ${job.job_number} created.`);
        setTimeout(() => (location.href = `job-detail.html?id=${job.id}`), 500);
      }
    } catch (err) { Toast.error(err.message); }
  });

  document.getElementById('add-container').addEventListener('click', addContainerRow);

  (async () => {
    try {
      await loadOptions();
      if (editId) await loadForEdit();
      else document.querySelector('[name="created_date"]').value = new Date().toISOString().slice(0, 10);
    } catch (e) { Toast.error(e.message); }
  })();
})();
