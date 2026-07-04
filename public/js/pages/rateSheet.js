// Rate Sheet controller (A3): three tabs — master freight rates (per POD +
// container type), local charges (per container size), shipping lines.
(() => {
  let current = 'master';
  let ports = [];
  let cTypes = [];

  const els = {
    table: document.getElementById('table'),
    addBtn: document.getElementById('add-btn'),
    hint: document.getElementById('tab-hint'),
  };

  const MR_CHARGES = [
    ['freight', 'Freight'], ['placement', 'Placement'], ['lifting', 'Lifting'],
    ['bl_charges', 'BL Charges'], ['cro', 'CRO'], ['seal', 'Seal'],
  ];

  const money = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 }));

  async function loadRefs() {
    [ports, cTypes] = await Promise.all([API.get('/ports?active=1'), API.get('/container-types?active=1')]);
  }

  async function load() {
    els.addBtn.style.display = current === 'local' ? 'none' : '';
    if (current === 'master') {
      els.hint.textContent = 'Auto-fills the new-job form when POD + container type match.';
      const rows = await API.get('/rates/master');
      DataTable.render(els.table, [
        { key: 'port_name', header: 'POD' },
        { key: 'container_type_code', header: 'Type' },
        ...MR_CHARGES.flatMap(([k, label]) => ([
          { key: `${k}_buying`, header: `${label} Buy`, num: true, render: (r) => money(r[`${k}_buying`]) },
          { key: `${k}_selling`, header: `${label} Sell`, num: true, render: (r) => money(r[`${k}_selling`]) },
        ])),
        { key: '_a', header: '', render: (r) => `<div class="btn-row"><button class="btn btn-sm btn-ghost" data-edit="${r.id}">Edit</button><button class="btn btn-sm btn-danger" data-del="${r.id}">✕</button></div>` },
      ], rows, { emptyText: 'No master rates yet — add one per POD + container type.' });
      els.table.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openMasterForm(rows.find((r) => r.id === Number(b.dataset.edit))));
      els.table.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
        if (!(await Modal.confirm('Delete this master rate row?', { danger: true }))) return;
        try { await API.del(`/rates/master/${b.dataset.del}`); Toast.success('Deleted.'); load(); } catch (e) { Toast.error(e.message); }
      });
    } else if (current === 'local') {
      els.hint.textContent = 'Standard charges per container size. Click a row to edit.';
      const rows = await API.get('/rates/local');
      DataTable.render(els.table, [
        { key: 'charge_type', header: 'Charge' },
        { key: 'amount_20', header: '20ft', num: true, render: (r) => money(r.amount_20) },
        { key: 'amount_40', header: '40ft', num: true, render: (r) => money(r.amount_40) },
        { key: 'amount_40hc', header: '40HC', num: true, render: (r) => money(r.amount_40hc) },
        { key: 'currency', header: 'Cur.' },
      ], rows, { emptyText: 'No local charges.', rowClick: openLocalForm });
    } else {
      els.hint.textContent = 'Carriers available on the new-job form.';
      const rows = await API.get('/shipping-lines');
      DataTable.render(els.table, [
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'is_active', header: 'Active', render: (r) => r.is_active ? '<span class="badge PAID">Active</span>' : '<span class="badge UNPAID">Inactive</span>' },
        { key: '_a', header: '', render: (r) => `<div class="btn-row"><button class="btn btn-sm btn-ghost" data-edit="${r.id}">Edit</button><button class="btn btn-sm ${r.is_active ? 'btn-danger' : 'btn-accent'}" data-toggle="${r.id}" data-active="${r.is_active}">${r.is_active ? 'Deactivate' : 'Activate'}</button></div>` },
      ], rows, { emptyText: 'No shipping lines.' });
      els.table.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openLineForm(rows.find((r) => r.id === Number(b.dataset.edit))));
      els.table.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => {
        try { await API.post(`/shipping-lines/${b.dataset.toggle}/active`, { is_active: b.dataset.active === '1' ? 0 : 1 }); load(); } catch (e) { Toast.error(e.message); }
      });
    }
  }

  async function openMasterForm(row) {
    const fields = [
      { name: 'destination_port_id', label: 'Destination Port (POD)', type: 'select', required: true, value: row && row.destination_port_id, options: ports.map((p) => ({ value: p.id, label: p.name })) },
      { name: 'container_type_id', label: 'Container Type', type: 'select', required: true, value: row && row.container_type_id, options: cTypes.map((t) => ({ value: t.id, label: t.code })) },
      ...MR_CHARGES.flatMap(([k, label]) => ([
        { name: `${k}_buying`, label: `${label} — Buying`, type: 'number', min: 0, step: '0.01', value: row && row[`${k}_buying`] },
        { name: `${k}_selling`, label: `${label} — Selling`, type: 'number', min: 0, step: '0.01', value: row && row[`${k}_selling`] },
      ])),
    ];
    const data = await Modal.form({ title: `${row ? 'Edit' : 'Add'} Master Rate`, fields });
    if (!data) return;
    try {
      if (row) await API.put(`/rates/master/${row.id}`, data);
      else await API.post('/rates/master', data);
      Toast.success('Master rate saved.');
      load();
    } catch (e) { Toast.error(e.message); }
  }

  async function openLocalForm(row) {
    const data = await Modal.form({
      title: `Edit ${row.charge_type}`,
      fields: [
        { name: 'amount_20', label: '20ft Amount', type: 'number', min: 0, step: '0.01', value: row.amount_20 },
        { name: 'amount_40', label: '40ft Amount', type: 'number', min: 0, step: '0.01', value: row.amount_40 },
        { name: 'amount_40hc', label: '40HC Amount', type: 'number', min: 0, step: '0.01', value: row.amount_40hc },
        { name: 'currency', label: 'Currency', type: 'select', value: row.currency, options: [{ value: 'USD', label: 'USD' }, { value: 'PKR', label: 'PKR' }] },
      ],
    });
    if (!data) return;
    try { await API.put(`/rates/local/${row.charge_type}`, data); Toast.success('Saved.'); load(); }
    catch (e) { Toast.error(e.message); }
  }

  async function openLineForm(row) {
    const data = await Modal.form({
      title: `${row ? 'Edit' : 'Add'} Shipping Line`,
      fields: [
        { name: 'code', label: 'Code', required: true, value: row && row.code },
        { name: 'name', label: 'Name', value: row && row.name },
      ],
    });
    if (!data) return;
    try {
      if (row) await API.put(`/shipping-lines/${row.id}`, data);
      else await API.post('/shipping-lines', data);
      Toast.success('Shipping line saved.');
      load();
    } catch (e) { Toast.error(e.message); }
  }

  document.querySelectorAll('#tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      current = b.dataset.tab;
      load();
    };
  });
  els.addBtn.onclick = () => (current === 'master' ? openMasterForm(null) : openLineForm(null));

  loadRefs().then(load).catch((e) => Toast.error(e.message));
})();
