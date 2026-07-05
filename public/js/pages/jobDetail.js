// Job detail controller — the operational hub. Shows the job, containers,
// buying/selling rates, live currency-aware profit, taxes and generated
// documents, with actions to edit each and generate PDFs.
(() => {
  const root = document.getElementById('root');
  const jobId = new URLSearchParams(location.search).get('id');
  let job = null;
  let masters = { clients: [], containerTypes: [] };

  const esc = Modal.escapeHtml;
  const money = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function load() {
    try {
      [job, masters.clients, masters.containerTypes] = await Promise.all([
        API.get(`/jobs/${jobId}`),
        API.get('/clients?active=1'),
        API.get('/container-types?active=1'),
      ]);
      render();
    } catch (e) {
      root.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }

  function render() {
    const p = job.profit || {};
    const profitClass = (p.profit_usd || 0) >= 0 ? 'profit-pos' : 'profit-neg';
    root.innerHTML = `
      <div class="page-head">
        <h1>${esc(job.job_number)} <span class="badge ${job.status}">${job.status}</span>${job.is_archived ? ' <span class="muted">archived</span>' : ''}</h1>
        <div class="btn-row">
          <a href="new-job.html?id=${job.id}" class="btn btn-ghost">Edit</a>
          <button class="btn btn-accent" id="clone-btn">Duplicate Job</button>
          <button class="btn btn-ghost" id="archive-btn">${job.is_archived ? 'Unarchive' : 'Archive'}</button>
          <a href="index.html" class="btn btn-ghost">← Back</a>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card"><h2>Shipment</h2><div class="card-body">
          <dl class="kv">
            <dt>Type / Direction</dt><dd>${job.job_type} / ${job.direction}</dd>
            <dt>Shipper</dt><dd>${esc(job.shipper_name || '—')}</dd>
            <dt>Consignee</dt><dd>${esc(job.consignee_name || '—')}</dd>
            <dt>Notify 1 / 2</dt><dd>${esc(job.notify_1_name || '—')} / ${esc(job.notify_2_name || '—')}</dd>
            <dt>Commodity</dt><dd>${esc(job.commodity_name || '—')}</dd>
            <dt>POL → POD</dt><dd>${esc(job.pol_name || '—')} → ${esc(job.pod_name || '—')}</dd>
            <dt>Shipping Line</dt><dd>${esc(job.shipping_line_code || '—')}${job.shipping_line_name ? ' — ' + esc(job.shipping_line_name) : ''}</dd>
            <dt>Master BL / House BL</dt><dd>${esc(job.bl_number || '—')} / ${esc(job.house_bl_number || '—')}</dd>
            <dt>FIN</dt><dd>${esc(job.fin_number || '—')}</dd>
            <dt>ETD / ETA</dt><dd>${esc(job.etd || '—')} / ${esc(job.eta || '—')}</dd>
            <dt>Packages / CBM</dt><dd>${job.packages ?? '—'} / ${job.cbm ?? '—'}</dd>
            <dt>Gross / Net Wt</dt><dd>${job.gross_weight ?? '—'} / ${job.net_weight ?? '—'} KG</dd>
            <dt>BL Tracking</dt><dd>
              <span class="badge ${job.bl_status === 'FORWARDED' ? 'DELIVERED' : job.bl_status === 'RECEIVED' ? 'SAILED' : 'CANCELLED'}">${job.bl_status.replace('_', ' ')}</span>
              ${job.bl_received_date ? `<span class="muted">recv ${esc(job.bl_received_date)}${job.bl_received_from ? ' from ' + esc(job.bl_received_from) : ''}</span>` : ''}
              ${job.bl_forwarded_date ? `<span class="muted">fwd ${esc(job.bl_forwarded_date)} ${esc(job.bl_forwarded_method || '')} → ${esc(job.bl_forwarded_to || '')}</span>` : ''}
            </dd>
          </dl>
          <div class="btn-row" style="margin-top:10px;">
            ${job.bl_status === 'NOT_RECEIVED' ? '<button class="btn btn-sm btn-accent" id="bl-received-btn">Mark BL Received</button>' : ''}
            ${job.bl_status === 'RECEIVED' ? '<button class="btn btn-sm btn-accent" id="bl-forwarded-btn">Mark BL Forwarded</button>' : ''}
          </div>
        </div></div>

        <div class="card"><h2>Financials (currency-safe, USD)</h2><div class="card-body">
          <dl class="kv">
            <dt>Locked Exch. Rate</dt><dd>${p.exchange_rate ?? '—'} PKR/USD ${job.exchange_rate_locked == null ? '<span class="muted">(not yet locked)</span>' : ''}</dd>
            <dt>Freight Received</dt><dd>USD ${money(p.total_selling)}</dd>
            <dt>Freight Paid</dt><dd>USD ${money(p.total_buying)}</dd>
            <dt>Profit</dt><dd class="${profitClass}">USD ${money(p.profit_usd)} &nbsp;/&nbsp; PKR ${money(p.profit_pkr)}</dd>
          </dl>
          <div class="btn-row" style="margin-top:12px;">
            <button class="btn btn-accent btn-sm" id="gen-taxes">Generate ZKT/KHRT Taxes</button>
          </div>
          <div id="taxes-box" style="margin-top:10px;"></div>
        </div></div>
      </div>

      ${lcOrExtrasHtml()}

      <div class="card"><h2>Rebates &amp; Commissions <span class="muted" style="font-weight:400;">(internal — never printed)</span></h2><div class="card-body">
        <div class="toolbar">
          <span id="rebates-impact" class="muted"></span>
          <span class="spacer"></span>
          <button class="btn btn-sm btn-primary" data-add-rebate="CLIENT_REBATE">+ Client Rebate</button>
          <button class="btn btn-sm btn-primary" data-add-rebate="LINE_REBATE">+ Line Rebate</button>
          <button class="btn btn-sm btn-primary" data-add-rebate="AGENT_COMMISSION">+ Agent Commission</button>
        </div>
        <div id="rebates-table"></div>
      </div></div>

      <div class="card"><h2>Containers</h2><div class="card-body">
        <div class="toolbar"><span class="spacer"></span><button class="btn btn-sm btn-primary" id="add-container">+ Add Container</button></div>
        <div id="containers-table"></div>
      </div></div>

      <div class="card"><h2>Rates</h2><div class="card-body">
        <div class="toolbar">
          <span class="spacer"></span>
          <button class="btn btn-sm btn-primary" id="add-buying">+ Buying Rate</button>
          <button class="btn btn-sm btn-primary" id="add-selling">+ Selling Rate</button>
        </div>
        <div id="rates-table"></div>
      </div></div>

      <div class="card"><h2>Documents</h2><div class="card-body">
        <div class="btn-row" style="margin-bottom:12px;">
          <button class="btn btn-sm btn-accent" data-doc="bl">Bill of Lading</button>
          <button class="btn btn-sm btn-accent" data-doc="invoice">Invoice</button>
          <button class="btn btn-sm btn-accent" data-doc="booking">Booking Note</button>
          <button class="btn btn-sm btn-accent" data-doc="cro">CRO Request</button>
        </div>
        <div id="documents-table"></div>
      </div></div>
    `;

    renderTaxes();
    renderContainers();
    renderRates();
    renderRebates();
    renderDocuments();
    wire();
  }

  // LC + Additional Details — shown only when at least one field is filled,
  // collapsed by default, so the common case stays uncluttered.
  function lcOrExtrasHtml() {
    const lcFields = [
      ['LC Number', job.lc_number], ['Issuing Bank', job.lc_issuing_bank],
      ['Amount', job.lc_amount != null ? `${money(job.lc_amount)} ${job.lc_currency || ''}` : null],
      ['Status', job.lc_status], ['Expiry', job.lc_expiry_date],
      ['Last Shipment', job.lc_last_shipment_date], ['Beneficiary', job.lc_beneficiary],
      ['Terms', job.lc_terms], ['Documents Required', job.lc_documents_required],
    ].filter(([, v]) => v != null && v !== '');
    const extraFields = [
      ['Customs Status', job.customs_status], ['Clearing Agent', job.customs_clearing_agent],
      ['Customs Ref', job.customs_reference], ['Insurance Policy', job.insurance_policy_number],
      ['Insured Value', job.insurance_insured_value != null ? money(job.insurance_insured_value) : null],
      ['Insurer', job.insurance_insurer], ['VGM (KG)', job.vgm_kg],
    ].filter(([, v]) => v != null && v !== '');

    let html = '';
    if (lcFields.length) {
      html += `<div class="card"><div class="card-body" style="padding:0;"><details>
        <summary>LC Details</summary>
        <div><dl class="kv">${lcFields.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
      </details></div></div>`;
    }
    if (extraFields.length) {
      html += `<div class="card"><div class="card-body" style="padding:0;"><details>
        <summary>Additional Details</summary>
        <div><dl class="kv">${extraFields.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
      </details></div></div>`;
    }
    return html;
  }

  async function renderRebates() {
    try {
      const data = await API.get(`/jobs/${jobId}/rebates`);
      const p = data.profit;
      document.getElementById('rebates-impact').innerHTML =
        `Adjusted profit: <strong class="${p.adjusted_profit_usd >= 0 ? 'profit-pos' : 'profit-neg'}">USD ${money(p.adjusted_profit_usd)}</strong>`
        + ` <span class="muted">(− client ${money(p.client_rebates)} + line ${money(p.line_rebates)} − commission ${money(p.agent_commissions)})</span>`;
      DataTable.render(document.getElementById('rebates-table'),
        [
          { key: 'type', header: 'Type', render: (r) => r.type.replace('_', ' ') },
          { key: 'party_name', header: 'Party' },
          { key: 'amount', header: 'Amount', num: true, render: (r) => money(r.amount) },
          { key: 'currency', header: 'Cur.' },
          { key: 'paid_status', header: 'Paid', render: (r) => `<span class="badge ${r.paid_status}">${r.paid_status}</span>` },
          { key: '_a', header: '', render: (r) => `<div class="btn-row">${r.paid_status === 'UNPAID' ? `<button class="btn btn-sm btn-accent" data-rb-paid="${r.id}">Mark Paid</button>` : ''}<button class="btn btn-sm btn-danger" data-rb-del="${r.id}">✕</button></div>` },
        ], data.rows, { emptyText: 'No rebates or commissions.' });
      document.querySelectorAll('[data-rb-paid]').forEach((b) => b.onclick = async () => {
        try { await API.post(`/rebates/${b.dataset.rbPaid}/paid`, {}); Toast.success('Marked paid.'); load(); } catch (e) { Toast.error(e.message); }
      });
      document.querySelectorAll('[data-rb-del]').forEach((b) => b.onclick = async () => {
        if (!(await Modal.confirm('Delete this rebate/commission?', { danger: true }))) return;
        try { await API.del(`/rebates/${b.dataset.rbDel}`); Toast.success('Deleted.'); load(); } catch (e) { Toast.error(e.message); }
      });
    } catch (e) { /* rebates are optional; ignore */ }
  }

  function renderTaxes() {
    const box = document.getElementById('taxes-box');
    if (!job.taxes || !job.taxes.length) { box.innerHTML = '<span class="muted">No taxes generated yet.</span>'; return; }
    const zkt = job.taxes.find((t) => t.tax_type === 'ZKT') || {};
    const khrt = job.taxes.find((t) => t.tax_type === 'KHRT') || {};
    const net = (job.profit.profit_pkr || 0) - (zkt.amount || 0) - (khrt.amount || 0);
    box.innerHTML = `<dl class="kv">
      <dt>ZKT (${zkt.percentage ?? '—'}%)</dt><dd>PKR ${money(zkt.amount)}</dd>
      <dt>KHRT (${khrt.percentage ?? '—'}%)</dt><dd>PKR ${money(khrt.amount)}</dd>
      <dt>Net GP</dt><dd class="${net >= 0 ? 'profit-pos' : 'profit-neg'}">PKR ${money(net)}</dd>
    </dl>`;
  }

  function renderContainers() {
    DataTable.render(document.getElementById('containers-table'),
      [
        { key: 'container_number', header: 'Container #' },
        { key: 'container_type_code', header: 'Type' },
        { key: 'seal_number', header: 'Seal #' },
        { key: 'vessel', header: 'Vessel' },
        { key: 'voyage', header: 'Voyage' },
        { key: 'status', header: 'Status', render: (r) => `<span class="badge ${r.status}">${r.status}</span>` },
      ], job.containers, { emptyText: 'No containers.' });
  }

  function renderRates() {
    DataTable.render(document.getElementById('rates-table'),
      [
        { key: 'rate_type', header: 'Type', render: (r) => `<strong>${r.rate_type}</strong>` },
        { key: 'charge_type', header: 'Charge' },
        { key: 'amount', header: 'Amount', num: true, render: (r) => money(r.amount) },
        { key: 'currency', header: 'Cur.' },
        { key: 'vendor_name', header: 'Vendor' },
        { key: 'paid_status', header: 'Paid', render: (r) => `<span class="badge ${r.paid_status}">${r.paid_status}</span>` },
      ], job.rates, { emptyText: 'No rates yet.' });
  }

  function renderDocuments() {
    DataTable.render(document.getElementById('documents-table'),
      [
        { key: 'doc_type', header: 'Type' },
        { key: 'doc_number', header: 'Number' },
        { key: 'generated_date', header: 'Generated' },
      ], job.documents, { emptyText: 'No documents generated yet.' });
  }

  function wire() {
    document.getElementById('archive-btn').onclick = async () => {
      try {
        await API.post(`/jobs/${jobId}/archive`, { unarchive: job.is_archived === 1 });
        Toast.success(job.is_archived ? 'Job unarchived.' : 'Job archived.');
        load();
      } catch (e) { Toast.error(e.message); }
    };

    document.getElementById('gen-taxes').onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; // prevent double generation from double-clicks
      try {
        await API.post(`/jobs/${jobId}/generate-taxes`, {});
        Toast.success('Taxes generated (exchange rate locked).');
        load();
      } catch (err) {
        Toast.error(err.message);
        btn.disabled = false;
      }
    };

    document.getElementById('clone-btn').onclick = async () => {
      if (!(await Modal.confirm('Duplicate this job as a new job? Parties, route and rates are copied; dates, BL and containers start blank.'))) return;
      try {
        const newJob = await API.post(`/jobs/${jobId}/clone`, {});
        Toast.success(`Created ${newJob.job_number} from this job.`);
        setTimeout(() => (location.href = `new-job.html?id=${newJob.id}`), 400);
      } catch (e) { Toast.error(e.message); }
    };

    const blRecBtn = document.getElementById('bl-received-btn');
    if (blRecBtn) blRecBtn.onclick = async () => {
      const data = await Modal.form({
        title: 'Mark BL Received',
        fields: [
          { name: 'date', label: 'Date Received', type: 'date', value: new Date().toISOString().slice(0, 10) },
          { name: 'from', label: 'Received From' },
        ],
      });
      if (!data) return;
      try { await API.post(`/jobs/${jobId}/bl-received`, data); Toast.success('BL marked received.'); load(); }
      catch (e) { Toast.error(e.message); }
    };

    const blFwdBtn = document.getElementById('bl-forwarded-btn');
    if (blFwdBtn) blFwdBtn.onclick = async () => {
      const data = await Modal.form({
        title: 'Mark BL Forwarded',
        fields: [
          { name: 'date', label: 'Date Forwarded', type: 'date', value: new Date().toISOString().slice(0, 10) },
          { name: 'method', label: 'Method', type: 'select', options: ['EMAIL', 'COURIER', 'HAND'].map((v) => ({ value: v, label: v })) },
          { name: 'to', label: 'Forwarded To', type: 'select', options: ['CLIENT', 'CONSIGNEE', 'BANK'].map((v) => ({ value: v, label: v })) },
        ],
      });
      if (!data) return;
      try { await API.put(`/jobs/${jobId}/bl-forwarded`, data); Toast.success('BL marked forwarded.'); load(); }
      catch (e) { Toast.error(e.message); }
    };

    document.querySelectorAll('[data-add-rebate]').forEach((b) => {
      b.onclick = () => addRebate(b.dataset.addRebate);
    });

    document.getElementById('add-container').onclick = addContainer;
    document.getElementById('add-buying').onclick = () => addRate('BUYING');
    document.getElementById('add-selling').onclick = () => addRate('SELLING');
    document.querySelectorAll('[data-doc]').forEach((b) => {
      b.onclick = () => window.open(API.url(`/documents/${jobId}/${b.dataset.doc}`), '_blank');
    });
  }

  async function addContainer() {
    const data = await Modal.form({
      title: 'Add Container',
      fields: [
        { name: 'container_number', label: 'Container Number' },
        { name: 'container_type_id', label: 'Type', type: 'select', options: [{ value: '', label: '—' }, ...masters.containerTypes.map((t) => ({ value: t.id, label: t.code }))] },
        { name: 'seal_number', label: 'Seal Number' },
        { name: 'vessel', label: 'Vessel' },
        { name: 'voyage', label: 'Voyage' },
        { name: 'status', label: 'Status', type: 'select', options: ['EMPTY', 'FULL', 'INTRANSIT', 'DELIVERED'].map((s) => ({ value: s, label: s })) },
        // A6 — transporter details (all optional; printed on the CRO)
        { name: 'pickup_location', label: 'Pickup Location / Empty Depot' },
        { name: 'pickup_terminal', label: 'Pickup Terminal' },
        { name: 'delivery_location', label: 'Delivery Location' },
        { name: 'transporter', label: 'Transporter' },
        { name: 'transporter_contact', label: 'Transporter Contact' },
        { name: 'pickup_contact_person', label: 'Pickup Contact Person' },
        { name: 'delivery_contact_person', label: 'Delivery Contact Person' },
        { name: 'pickup_instructions', label: 'Pickup Instructions', type: 'textarea' },
        { name: 'delivery_instructions', label: 'Delivery Instructions', type: 'textarea' },
        { name: 'demurrage_notes', label: 'Demurrage Notes (optional)', type: 'textarea' },
      ],
    });
    if (!data) return;
    try { await API.post(`/jobs/${jobId}/containers`, data); Toast.success('Container added.'); load(); }
    catch (e) { Toast.error(e.message); }
  }

  async function addRebate(type) {
    const label = type.replace('_', ' ');
    const parties = type === 'AGENT_COMMISSION'
      ? masters.clients.filter((c) => c.is_agent || c.type === 'VENDOR')
      : masters.clients;
    const data = await Modal.form({
      title: `Add ${label}`,
      fields: [
        { name: 'party_id', label: 'Party', type: 'select', options: [{ value: '', label: '—' }, ...parties.map((p) => ({ value: p.id, label: p.name }))] },
        { name: 'amount', label: 'Amount', type: 'number', min: 0, required: true, step: '0.01' },
        { name: 'currency', label: 'Currency', type: 'select', options: [{ value: 'USD', label: 'USD' }, { value: 'PKR', label: 'PKR' }] },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
    });
    if (!data) return;
    data.type = type;
    try { await API.post(`/jobs/${jobId}/rebates`, data); Toast.success(`${label} added.`); load(); }
    catch (e) { Toast.error(e.message); }
  }

  async function addRate(rateType) {
    const vendors = masters.clients.filter((c) => c.type === 'VENDOR');
    const fields = [
      { name: 'charge_type', label: 'Charge Type', required: true },
      { name: 'amount', label: 'Amount', type: 'number', min: 0, required: true, step: '0.01' },
      { name: 'currency', label: 'Currency', type: 'select', options: [{ value: 'USD', label: 'USD' }, { value: 'PKR', label: 'PKR' }] },
      { name: 'paid_status', label: 'Paid Status', type: 'select', options: [{ value: 'UNPAID', label: 'UNPAID' }, { value: 'PAID', label: 'PAID' }] },
    ];
    if (rateType === 'BUYING') {
      fields.push({ name: 'vendor_id', label: 'Vendor', type: 'select', options: [{ value: '', label: '—' }, ...vendors.map((v) => ({ value: v.id, label: v.name }))] });
    }
    const data = await Modal.form({ title: `Add ${rateType} Rate`, fields });
    if (!data) return;
    data.rate_type = rateType;
    try { await API.post(`/jobs/${jobId}/rates`, data); Toast.success('Rate added.'); load(); }
    catch (e) { Toast.error(e.message); }
  }

  load();
})();
