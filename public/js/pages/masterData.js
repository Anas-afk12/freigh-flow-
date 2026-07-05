// Master data controller: tabbed CRUD for clients/ports/commodities/
// container-types with search, active/inactive toggling (soft, never hard
// delete where referenced).
(() => {
  const CONFIG = {
    clients: {
      endpoint: 'clients', label: 'Client',
      columns: ['name', 'type', 'contact_person', 'phone', 'email', 'tax_id'],
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'type', label: 'Type', type: 'select', required: true, options: ['SHIPPER', 'CONSIGNEE', 'NOTIFY', 'VENDOR'].map((v) => ({ value: v, label: v })) },
        { name: 'address', label: 'Address' },
        { name: 'phone', label: 'Phone' },
        { name: 'email', label: 'Email' },
        { name: 'contact_person', label: 'Contact Person' },
        { name: 'tax_id', label: 'Tax ID' },
        { name: 'is_agent', label: 'Is Agent (earns commission)', type: 'select', options: [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }] },
        { name: 'commission_rate', label: 'Commission Rate (%)', type: 'number', min: 0, step: '0.01' },
      ],
    },
    ports: {
      endpoint: 'ports', label: 'Port',
      columns: ['name', 'code', 'country'],
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'code', label: 'Code' },
        { name: 'country', label: 'Country' },
      ],
    },
    commodities: {
      endpoint: 'commodities', label: 'Commodity',
      columns: ['name', 'hs_code', 'description'],
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'hs_code', label: 'HS Code' },
        { name: 'description', label: 'Description' },
      ],
    },
    'container-types': {
      endpoint: 'container-types', label: 'Container Type',
      columns: ['code', 'description', 'weight_limit'],
      fields: [
        { name: 'code', label: 'Code', required: true },
        { name: 'description', label: 'Description' },
        { name: 'weight_limit', label: 'Weight Limit (KG)', type: 'number', min: 0 },
      ],
    },
  };

  let current = 'clients';
  const els = {
    search: document.getElementById('search'),
    activeOnly: document.getElementById('active-only'),
    table: document.getElementById('table'),
    addBtn: document.getElementById('add-btn'),
  };

  async function load() {
    const cfg = CONFIG[current];
    const params = new URLSearchParams({ search: els.search.value.trim(), active: els.activeOnly.checked ? '1' : '0' });
    try {
      const rows = await API.get(`/${cfg.endpoint}?${params.toString()}`);
      renderTable(cfg, rows);
    } catch (e) { Toast.error(e.message); }
  }

  function renderTable(cfg, rows) {
    const columns = cfg.columns.map((k) => ({ key: k, header: k.replace(/_/g, ' ') }));
    columns.push({ key: 'is_active', header: 'Active', render: (r) => (r.is_active ? '<span class="badge PAID">Active</span>' : '<span class="badge UNPAID">Inactive</span>') });
    columns.push({
      key: '_a', header: '',
      render: (r) => `<div class="btn-row"><button class="btn btn-sm btn-ghost" data-edit="${r.id}">Edit</button>
        <button class="btn btn-sm ${r.is_active ? 'btn-danger' : 'btn-accent'}" data-toggle="${r.id}" data-active="${r.is_active}">${r.is_active ? 'Deactivate' : 'Activate'}</button></div>`,
    });
    DataTable.render(els.table, columns, rows, { emptyText: `No ${cfg.label.toLowerCase()}s.` });
    els.table.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openForm(rows.find((r) => r.id === Number(b.dataset.edit))));
    els.table.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = () => toggle(Number(b.dataset.toggle), b.dataset.active === '1' ? 0 : 1));
  }

  async function openForm(row) {
    const cfg = CONFIG[current];
    const fields = cfg.fields.map((f) => ({ ...f, value: row ? row[f.name] : undefined }));
    const data = await Modal.form({ title: `${row ? 'Edit' : 'Add'} ${cfg.label}`, fields });
    if (!data) return;
    try {
      if (row) await API.put(`/${cfg.endpoint}/${row.id}`, data);
      else await API.post(`/${cfg.endpoint}`, data);
      Toast.success(`${cfg.label} saved.`);
      load();
    } catch (e) { Toast.error(e.message); }
  }

  async function toggle(id, active) {
    const cfg = CONFIG[current];
    try { await API.post(`/${cfg.endpoint}/${id}/active`, { is_active: active }); Toast.success('Updated.'); load(); }
    catch (e) { Toast.error(e.message); }
  }

  document.querySelectorAll('#tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      current = b.dataset.tab;
      load();
    };
  });
  els.addBtn.onclick = () => openForm(null);
  let t;
  els.search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  els.activeOnly.addEventListener('change', load);

  load();
})();
