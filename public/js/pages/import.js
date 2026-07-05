// CSV Import controller (A7): upload → preview with adjustable column
// mapping → commit. Duplicates are skipped server-side and reported.
(() => {
  let csvText = '';
  let previewData = null;

  const els = {
    target: document.getElementById('target'),
    file: document.getElementById('file'),
    previewBtn: document.getElementById('preview-btn'),
    mappingCard: document.getElementById('mapping-card'),
    mappingRows: document.getElementById('mapping-rows'),
    previewInfo: document.getElementById('preview-info'),
    sampleTable: document.getElementById('sample-table'),
    commitBtn: document.getElementById('commit-btn'),
    resultCard: document.getElementById('result-card'),
    resultBody: document.getElementById('result-body'),
  };

  els.previewBtn.addEventListener('click', async () => {
    const f = els.file.files[0];
    if (!f) { Toast.error('Choose a CSV file first.'); return; }
    csvText = await f.text();
    try {
      previewData = await API.post(`/import/${els.target.value}/preview`, { csv: csvText });
      renderMapping();
      els.mappingCard.style.display = '';
      els.resultCard.style.display = 'none';
    } catch (e) { Toast.error(e.message); }
  });

  function renderMapping() {
    const { headers, fields, required, suggested_mapping, row_count, duplicate_count, sample_rows } = previewData;
    els.mappingRows.innerHTML = headers.map((h) => `
      <div class="field">
        <label>CSV column: <strong>${Modal.escapeHtml(h)}</strong></label>
        <select data-header="${Modal.escapeHtml(h)}">
          <option value="">— ignore —</option>
          ${fields.map((f) => `<option value="${f}" ${suggested_mapping[h] === f ? 'selected' : ''}>${f}${required.includes(f) ? ' *' : ''}</option>`).join('')}
        </select>
      </div>`).join('');
    els.previewInfo.textContent = `${row_count} row(s) found — ${duplicate_count} look like duplicates and will be skipped. First rows:`;

    if (sample_rows.length) {
      const cols = headers.map((h) => ({ key: h, header: h }));
      DataTable.render(els.sampleTable, cols, sample_rows, { emptyText: '' });
    }
  }

  els.commitBtn.addEventListener('click', async () => {
    if (!previewData) return;
    // Re-parse the full CSV client-side using the (possibly adjusted) mapping.
    const mapping = {};
    els.mappingRows.querySelectorAll('select[data-header]').forEach((s) => {
      if (s.value) mapping[s.dataset.header] = s.value;
    });
    const missingRequired = previewData.required.filter((f) => !Object.values(mapping).includes(f));
    if (missingRequired.length) {
      Toast.error(`Map the required field(s): ${missingRequired.join(', ')}`);
      return;
    }
    const records = parseCsvClient(csvText).map((row) => {
      const rec = {};
      for (const [h, f] of Object.entries(mapping)) rec[f] = row[h];
      return rec;
    });
    try {
      const result = await API.post(`/import/${els.target.value}/commit`, { records });
      els.resultCard.style.display = '';
      els.resultBody.innerHTML = `
        <p><strong>${result.inserted}</strong> inserted, <strong>${result.skipped_count}</strong> skipped (duplicates), <strong>${result.error_count}</strong> errors.</p>
        ${result.errors.length ? `<div class="section-title">Errors</div><ul>${result.errors.map((e) => `<li>Row ${e.row}: ${Modal.escapeHtml(e.reason)}</li>`).join('')}</ul>` : ''}
      `;
      Toast.success(`Imported ${result.inserted} record(s).`);
    } catch (e) { Toast.error(e.message); }
  });

  // Same CSV semantics as the server parser (quotes, escaped quotes, CRLF).
  function parseCsvClient(text) {
    const records = [];
    let field = '', record = [], inQuotes = false;
    const pushField = () => { record.push(field); field = ''; };
    const pushRecord = () => {
      if (record.length === 1 && record[0].trim() === '') { record = []; return; }
      records.push(record); record = [];
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
        else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') pushField();
      else if (ch === '\n') { pushField(); pushRecord(); }
      else if (ch !== '\r') field += ch;
    }
    if (field !== '' || record.length) { pushField(); pushRecord(); }
    const headers = (records[0] || []).map((h) => h.trim());
    return records.slice(1).map((r) => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
      return obj;
    });
  }
})();
