// Date helpers. Dates are stored as ISO 'YYYY-MM-DD' strings in SQLite.

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentYear() {
  return new Date().getFullYear();
}

// Format an ISO date for display (e.g. '2026-01-20' -> '20-Jan-2026').
function formatDisplay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getUTCDate()).padStart(2, '0')}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

module.exports = { today, currentYear, formatDisplay };
