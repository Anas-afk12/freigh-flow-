// Client-side validation mirroring the server rules (server remains source of
// truth). Used by the new-job form.
const Validate = (() => {
  function nonNegative(value) {
    if (value === '' || value == null) return true;
    const n = Number(value);
    return !Number.isNaN(n) && n >= 0;
  }
  function required(value) {
    return value != null && String(value).trim() !== '';
  }
  function inEnum(value, allowed) {
    return value == null || value === '' || allowed.includes(value);
  }
  return { nonNegative, required, inEnum };
})();
