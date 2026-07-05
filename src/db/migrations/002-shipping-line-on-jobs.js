// A4 — shipping_line_id on jobs. SQLite's ALTER TABLE cannot add an enforced
// FK to an existing table, so the reference is validated in the controller
// layer instead (same effect for a single-writer local app).
module.exports = {
  name: 'shipping-line-on-jobs',
  up(db) {
    db.exec(`
      ALTER TABLE jobs ADD COLUMN shipping_line_id INTEGER;
      CREATE INDEX IF NOT EXISTS idx_jobs_shipping_line ON jobs(shipping_line_id);
    `);
  },
};
