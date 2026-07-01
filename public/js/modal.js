// Minimal modal dialog. Modal.form() renders labelled fields and resolves with
// the collected values (or null if cancelled).
const Modal = (() => {
  function open({ title, bodyHtml, onRender, footerButtons }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <header><span>${title}</span><button class="close" aria-label="Close">&times;</button></header>
        <div class="modal-body">${bodyHtml}</div>
        <footer></footer>
      </div>`;
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.querySelector('.close').addEventListener('click', close);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });

    const footer = backdrop.querySelector('footer');
    (footerButtons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = `btn ${b.className || ''}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => b.onClick(close, backdrop));
      footer.appendChild(btn);
    });

    if (onRender) onRender(backdrop, close);
    return { backdrop, close };
  }

  // Build a form modal. fields: [{name,label,type,options,value,required,step}]
  function form({ title, fields, submitLabel = 'Save' }) {
    return new Promise((resolve) => {
      const bodyHtml = `<form class="modal-form">${fields.map(fieldHtml).join('')}</form>`;
      const { close } = open({
        title,
        bodyHtml,
        footerButtons: [
          { label: 'Cancel', className: 'btn-ghost', onClick: (c) => { c(); resolve(null); } },
          {
            label: submitLabel,
            className: 'btn-primary',
            onClick: (c, backdrop) => {
              const data = collect(backdrop, fields);
              if (data === null) return; // validation failed, keep open
              c();
              resolve(data);
            },
          },
        ],
      });
      return close;
    });
  }

  function fieldHtml(f) {
    const val = f.value != null ? String(f.value) : '';
    let input;
    if (f.type === 'select') {
      input = `<select name="${f.name}">${(f.options || [])
        .map((o) => `<option value="${o.value}" ${String(o.value) === val ? 'selected' : ''}>${o.label}</option>`)
        .join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea name="${f.name}">${escapeHtml(val)}</textarea>`;
    } else {
      input = `<input type="${f.type || 'text'}" name="${f.name}" value="${escapeHtml(val)}" ${f.step ? `step="${f.step}"` : ''}>`;
    }
    return `<div class="field"><label>${f.label}${f.required ? ' *' : ''}</label>${input}<div class="err" data-err="${f.name}"></div></div>`;
  }

  function collect(backdrop, fields) {
    const data = {};
    let valid = true;
    for (const f of fields) {
      const el = backdrop.querySelector(`[name="${f.name}"]`);
      const errEl = backdrop.querySelector(`[data-err="${f.name}"]`);
      let v = el.value;
      if (errEl) errEl.textContent = '';
      if (f.required && (v == null || String(v).trim() === '')) {
        if (errEl) errEl.textContent = 'Required';
        valid = false;
        continue;
      }
      if ((f.type === 'number') && v !== '') {
        const n = Number(v);
        if (Number.isNaN(n) || (f.min != null && n < f.min)) {
          if (errEl) errEl.textContent = `Must be a number${f.min != null ? ` >= ${f.min}` : ''}`;
          valid = false;
          continue;
        }
        v = n;
      }
      data[f.name] = v === '' ? null : v;
    }
    return valid ? data : null;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function confirm(message, { danger = false } = {}) {
    return new Promise((resolve) => {
      open({
        title: 'Please confirm',
        bodyHtml: `<p>${escapeHtml(message)}</p>`,
        footerButtons: [
          { label: 'Cancel', className: 'btn-ghost', onClick: (c) => { c(); resolve(false); } },
          { label: 'Confirm', className: danger ? 'btn-danger' : 'btn-primary', onClick: (c) => { c(); resolve(true); } },
        ],
      });
    });
  }

  return { open, form, confirm, escapeHtml };
})();
