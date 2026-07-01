// Shared reports controller — driven by window.REPORT ('gpsht' | 'jobgp').
// Columns come from the server so UI + Excel stay in lockstep. Filters, sort
// (via DataTable), print (window.print) and Excel export.
(() => {
  const report = window.REPORT;
  const NUMERIC_KEYS = new Set(['freight_received', 'freight_paid', 'profit_usd', 'profit_pkr', 'zkt', 'khrt', 'net_gp']);
  const els = {
    table: document.getElementById('table'),
    status: document.getElementById('status'),
    archived: document.getElementById('archived'),
    exportBtn: document.getElementById('export'),
  };

  function queryString() {
    const p = new URLSearchParams();
    if (els.status.value) p.set('status', els.status.value);
    if (els.archived.checked) p.set('includeArchived', '1');
    if (report === 'gpsht') {
      const pod = document.getElementById('pod');
      const etdFrom = document.getElementById('etdFrom');
      const etdTo = document.getElementById('etdTo');
      if (pod && pod.value) p.set('podId', pod.value);
      if (etdFrom && etdFrom.value) p.set('etdFrom', etdFrom.value);
      if (etdTo && etdTo.value) p.set('etdTo', etdTo.value);
    } else {
      const dFrom = document.getElementById('dateFrom');
      const dTo = document.getElementById('dateTo');
      if (dFrom && dFrom.value) p.set('dateFrom', dFrom.value);
      if (dTo && dTo.value) p.set('dateTo', dTo.value);
    }
    return p.toString();
  }

  function money(n) { return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  async function load() {
    try {
      const data = await API.get(`/reports/${report}?${queryString()}`);
      const columns = data.columns.map((c) => {
        const num = NUMERIC_KEYS.has(c.key);
        const col = { key: c.key, header: c.header, num };
        if (num) col.render = (r) => money(r[c.key]);
        else if (c.key === 'status') col.render = (r) => `<span class="badge ${r.status}">${r.status}</span>`;
        return col;
      });
      DataTable.render(els.table, columns, data.rows, { emptyText: 'No data for these filters.' });
    } catch (e) { Toast.error(e.message); }
  }

  async function loadPods() {
    const pod = document.getElementById('pod');
    if (!pod) return;
    try {
      const ports = await API.get('/ports?active=1');
      pod.innerHTML = '<option value="">All PODs</option>' + ports.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
    } catch (e) { /* non-fatal */ }
  }

  els.status.addEventListener('change', load);
  els.archived.addEventListener('change', load);
  document.querySelectorAll('input[type="date"], #pod').forEach((el) => el.addEventListener('change', load));
  els.exportBtn.addEventListener('click', () => {
    window.location = API.url(`/reports/${report}/export?${queryString()}`);
  });

  loadPods();
  load();
})();
