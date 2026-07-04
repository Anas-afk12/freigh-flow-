// Dashboard controller: quick stats + searchable/filterable/paginated job list.
(() => {
  let page = 1;
  const els = {
    stats: document.getElementById('stats'),
    search: document.getElementById('search'),
    status: document.getElementById('status'),
    line: document.getElementById('line'),
    archived: document.getElementById('archived'),
    table: document.getElementById('jobs-table'),
    pager: document.getElementById('pager'),
  };

  async function loadLines() {
    try {
      const lines = await API.get('/shipping-lines?active=1');
      els.line.innerHTML = '<option value="">All lines</option>' + lines.map((l) => `<option value="${l.id}">${l.code}</option>`).join('');
    } catch (e) { /* non-fatal */ }
  }

  async function loadStats() {
    try {
      const s = await API.get('/jobs/stats');
      const cards = [
        ['Total', s.total], ['Booked', s.BOOKED], ['Sailed', s.SAILED],
        ['Delivered', s.DELIVERED], ['Closed', s.CLOSED], ['Cancelled', s.CANCELLED],
      ];
      els.stats.innerHTML = cards.map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
    } catch (e) { Toast.error(e.message); }
  }

  async function loadJobs() {
    const params = new URLSearchParams({
      search: els.search.value.trim(),
      status: els.status.value,
      shippingLineId: els.line.value,
      includeArchived: els.archived.checked ? '1' : '0',
      page: String(page),
      limit: '25',
    });
    try {
      const data = await API.get('/jobs?' + params.toString());
      renderTable(data.rows);
      renderPager(data);
    } catch (e) { Toast.error(e.message); }
  }

  function renderTable(rows) {
    DataTable.render(
      els.table,
      [
        { key: 'job_number', header: 'Job #' },
        { key: 'created_date', header: 'Date' },
        { key: 'shipper_name', header: 'Shipper' },
        { key: 'consignee_name', header: 'Consignee' },
        { key: 'pol_name', header: 'POL' },
        { key: 'pod_name', header: 'POD' },
        { key: 'shipping_line_code', header: 'Line' },
        { key: 'etd', header: 'ETD' },
        { key: 'bl_status', header: 'BL', render: (r) => `<span class="badge ${r.bl_status === 'FORWARDED' ? 'DELIVERED' : r.bl_status === 'RECEIVED' ? 'SAILED' : 'CLOSED'}">${(r.bl_status || '').replace('_', ' ')}</span>` },
        { key: 'status', header: 'Status', render: (r) => `<span class="badge ${r.status}">${r.status}</span>${r.is_archived ? ' <span class="muted">(archived)</span>' : ''}` },
        { key: '_open', header: '', render: (r) => `<a class="btn btn-sm btn-ghost" href="job-detail.html?id=${r.id}">Open</a>` },
      ],
      rows,
      { emptyText: 'No jobs found.', rowClick: (r) => { location.href = `job-detail.html?id=${r.id}`; } }
    );
  }

  function renderPager(data) {
    if (data.pages <= 1) { els.pager.innerHTML = `<span class="muted">${data.total} job(s)</span>`; return; }
    els.pager.innerHTML = `
      <span class="muted">${data.total} job(s)</span>
      <button class="btn btn-sm" id="prev" ${data.page <= 1 ? 'disabled' : ''}>Prev</button>
      <span>Page ${data.page} / ${data.pages}</span>
      <button class="btn btn-sm" id="next" ${data.page >= data.pages ? 'disabled' : ''}>Next</button>`;
    const prev = document.getElementById('prev');
    const next = document.getElementById('next');
    if (prev) prev.onclick = () => { page = Math.max(1, page - 1); loadJobs(); };
    if (next) next.onclick = () => { page = data.page + 1; loadJobs(); };
  }

  let t;
  const debounced = () => { clearTimeout(t); t = setTimeout(() => { page = 1; loadJobs(); }, 250); };
  els.search.addEventListener('input', debounced);
  els.status.addEventListener('change', () => { page = 1; loadJobs(); });
  els.line.addEventListener('change', () => { page = 1; loadJobs(); });
  els.archived.addEventListener('change', () => { page = 1; loadJobs(); });

  loadLines();
  loadStats();
  loadJobs();
})();
