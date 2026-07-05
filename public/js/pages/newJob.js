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
    const [clients, ports, commodities, cTypes, lines] = await Promise.all([
      API.get('/clients?active=1'),
      API.get('/ports?active=1'),
      API.get('/commodities?active=1'),
      API.get('/container-types?active=1'),
      API.get('/shipping-lines?active=1'),
    ]);
    containerTypes = cTypes;
    document.querySelectorAll('select[data-role="LINE"]').forEach((s) => populateSelect(s, lines, { labelKey: 'code', placeholder: '— none —' }));
    document.querySelectorAll('select[data-role="SHIPPER"]').forEach((s) => populateSelect(s, clients.filter((c) => c.type === 'SHIPPER'), { placeholder: '— select —' }));
    document.querySelectorAll('select[data-role="CONSIGNEE"]').forEach((s) => populateSelect(s, clients.filter((c) => c.type === 'CONSIGNEE'), { placeholder: '— select —' }));
    document.querySelectorAll('select[data-role="NOTIFY"]').forEach((s) => populateSelect(s, clients.filter((c) => c.type === 'NOTIFY'), { placeholder: '— none —' }));
    document.querySelectorAll('select[data-role="COMMODITY"]').forEach((s) => populateSelect(s, commodities, { placeholder: '— select —' }));
    document.querySelectorAll('select[data-role="PORT"]').forEach((s) => populateSelect(s, ports, { placeholder: '— select —' }));
  }

  // ---- A3: rate auto-fill from the master rate sheet ----
  const RATE_CHARGES = [
    ['freight', 'FREIGHT'], ['placement', 'PLACEMENT'], ['lifting', 'LIFT ON'],
    ['bl_charges', 'BL CHARGES'], ['cro', 'CRO'], ['seal', 'SEAL'],
  ];

  function renderRateRows(match) {
    const wrap = document.getElementById('rate-rows');
    if (!wrap) return;
    wrap.innerHTML = RATE_CHARGES.map(([key, chargeType]) => `
      <div class="grid grid-3" data-rate-row="${chargeType}" style="margin-bottom:6px;">
        <div class="field"><label>${chargeType}</label><input value="${chargeType}" data-rf="charge_type" readonly /></div>
        <div class="field"><label>Buying</label><input type="number" min="0" step="0.01" data-rf="buying" value="${match && match[`${key}_buying`] != null ? match[`${key}_buying`] : ''}" /></div>
        <div class="field"><label>Selling</label><input type="number" min="0" step="0.01" data-rf="selling" value="${match && match[`${key}_selling`] != null ? match[`${key}_selling`] : ''}" /></div>
      </div>`).join('');
  }

  async function tryAutofill() {
    const status = document.getElementById('autofill-status');
    const podId = form.elements['pod_id'] && form.elements['pod_id'].value;
    const firstType = document.querySelector('#new-containers [data-f="container_type_id"]');
    const ctId = firstType && firstType.value;
    if (!podId || !ctId) return;
    try {
      const match = await API.get(`/rates/master/match?pod_id=${podId}&container_type_id=${ctId}`);
      if (match) {
        renderRateRows(match);
        status.textContent = 'Rates auto-filled from the rate sheet — edit freely before saving.';
      } else {
        status.textContent = 'No rate sheet entry for this POD + container type (enter rates manually or on the job page).';
      }
    } catch (e) { /* silent — auto-fill is a helper, never a blocker */ }
  }

  function collectRates() {
    const rates = [];
    document.querySelectorAll('#rate-rows [data-rate-row]').forEach((row) => {
      const charge = row.dataset.rateRow;
      const buying = row.querySelector('[data-rf="buying"]').value;
      const selling = row.querySelector('[data-rf="selling"]').value;
      if (buying !== '') rates.push({ rate_type: 'BUYING', charge_type: charge, amount: buying, currency: 'USD' });
      if (selling !== '') rates.push({ rate_type: 'SELLING', charge_type: charge, amount: selling, currency: 'USD' });
    });
    return rates;
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
    // First container's type participates in rate auto-fill (A3).
    const typeSel = wrap.querySelector(`[data-cidx="${idx}"] [data-f="container_type_id"]`);
    if (typeSel) typeSel.addEventListener('change', tryAutofill);
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

  // LC fields are stored via a dedicated endpoint (A5) — split them out.
  const LC_FIELDS = ['lc_number', 'lc_issuing_bank', 'lc_expiry_date', 'lc_amount', 'lc_currency',
    'lc_status', 'lc_beneficiary', 'lc_terms', 'lc_documents_required', 'lc_last_shipment_date'];

  function collectForm() {
    const data = {};
    let valid = true;
    new FormData(form).forEach((v, k) => { data[k] = v === '' ? null : v; });
    const lc = {};
    let lcUsed = false;
    for (const f of LC_FIELDS) {
      lc[f] = data[f];
      if (data[f] != null) lcUsed = true;
      delete data[f];
    }
    data._lc = lcUsed ? lc : null;
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
    const ratesCard = document.getElementById('rates-card');
    if (ratesCard) ratesCard.style.display = 'none'; // rates managed on detail page
    for (const [k, v] of Object.entries(job)) {
      const el = form.elements[k];
      if (el && v != null) el.value = v;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collectForm();
    if (!data) { Toast.error('Please fix the highlighted fields.'); return; }
    const lc = data._lc;
    delete data._lc;
    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true; // prevent duplicate jobs from double-clicks
    try {
      if (editId) {
        await API.put(`/jobs/${editId}`, data);
        // Always send LC on edit so clearing every LC field actually clears it.
        await API.put(`/jobs/${editId}/lc`, lc || {});
        Toast.success('Job updated.');
        setTimeout(() => (location.href = `job-detail.html?id=${editId}`), 500);
      } else {
        data.containers = collectContainers();
        data.rates = collectRates();
        const job = await API.post('/jobs', data);
        if (lc) await API.put(`/jobs/${job.id}/lc`, lc);
        Toast.success(`Job ${job.job_number} created.`);
        setTimeout(() => (location.href = `job-detail.html?id=${job.id}`), 500);
      }
    } catch (err) {
      Toast.error(err.message);
      saveBtn.disabled = false;
    }
  });

  document.getElementById('add-container').addEventListener('click', addContainerRow);

  (async () => {
    try {
      await loadOptions();
      if (editId) await loadForEdit();
      else {
        document.querySelector('[name="created_date"]').value = new Date().toISOString().slice(0, 10);
        renderRateRows(null);
        const podSel = form.elements['pod_id'];
        if (podSel) podSel.addEventListener('change', tryAutofill);
      }
    } catch (e) { Toast.error(e.message); }
  })();
})();
