// Reusable client-side sortable table renderer. Server handles search/filter/
// pagination for large lists (jobs); this handles rendering + column sorting.
const DataTable = (() => {
  // columns: [{ key, header, num, render, sortable }]
  function render(container, columns, rows, { emptyText = 'No records.', rowClick } = {}) {
    const state = { sortKey: null, sortDir: 1, rows: rows.slice(), columns };
    draw();

    function draw() {
      if (!state.rows.length) {
        container.innerHTML = `<div class="empty">${emptyText}</div>`;
        return;
      }
      const thead = columns
        .map((c) => {
          const arrow = state.sortKey === c.key ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '';
          return `<th class="${c.num ? 'num' : ''}" data-key="${c.key}">${c.header}${arrow}</th>`;
        })
        .join('');
      const tbody = state.rows
        .map((r, i) => {
          const tds = columns
            .map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : cell(r[c.key])}</td>`)
            .join('');
          return `<tr data-i="${i}">${tds}</tr>`;
        })
        .join('');
      container.innerHTML = `<table class="data"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;

      container.querySelectorAll('th[data-key]').forEach((th) => {
        th.addEventListener('click', () => sortBy(th.dataset.key));
      });
      if (rowClick) {
        container.querySelectorAll('tbody tr').forEach((tr) => {
          tr.style.cursor = 'pointer';
          tr.addEventListener('click', (e) => {
            if (e.target.closest('button, a')) return;
            rowClick(state.rows[Number(tr.dataset.i)]);
          });
        });
      }
    }

    function sortBy(key) {
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = 1; }
      state.rows.sort((a, b) => {
        const va = a[key], vb = b[key];
        const na = Number(va), nb = Number(vb);
        const bothNum = !Number.isNaN(na) && !Number.isNaN(nb) && va !== '' && vb !== '';
        if (bothNum) return (na - nb) * state.sortDir;
        return String(va ?? '').localeCompare(String(vb ?? '')) * state.sortDir;
      });
      draw();
    }

    function cell(v) {
      if (v == null || v === '') return '<span class="muted">—</span>';
      return Modal.escapeHtml(v);
    }
  }

  return { render };
})();
