// Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). No external
// dependency. Returns { headers: [...], rows: [ {header: value} ] }.
function parseCsv(text) {
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;

  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => {
    // Skip fully empty lines.
    if (record.length === 1 && record[0].trim() === '') { record = []; return; }
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushField(); pushRecord();
    } else if (ch === '\r') {
      // handled by following \n (or ignored)
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length) { pushField(); pushRecord(); }

  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
  return { headers, rows };
}

module.exports = { parseCsv };
