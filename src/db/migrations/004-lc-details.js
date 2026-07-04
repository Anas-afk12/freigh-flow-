// A5 — LC / bank details on jobs. All nullable; a job that never uses LC
// behaves identically to before. lc_amount is INTEGER minor units (B1).
// LC status is printed ONLY on the Invoice (and only when lc_number is set) —
// never on BL/Booking/CRO.
module.exports = {
  name: 'lc-details',
  up(db) {
    db.exec(`
      ALTER TABLE jobs ADD COLUMN lc_number TEXT;
      ALTER TABLE jobs ADD COLUMN lc_issuing_bank TEXT;
      ALTER TABLE jobs ADD COLUMN lc_expiry_date DATE;
      ALTER TABLE jobs ADD COLUMN lc_amount INTEGER;
      ALTER TABLE jobs ADD COLUMN lc_currency TEXT CHECK(lc_currency IN ('USD','PKR') OR lc_currency IS NULL);
      ALTER TABLE jobs ADD COLUMN lc_status TEXT
        CHECK(lc_status IN ('PENDING','ACTIVE','AMENDED','CLOSED','EXPIRED') OR lc_status IS NULL);
      ALTER TABLE jobs ADD COLUMN lc_beneficiary TEXT;
      ALTER TABLE jobs ADD COLUMN lc_terms TEXT;
      ALTER TABLE jobs ADD COLUMN lc_documents_required TEXT;
      ALTER TABLE jobs ADD COLUMN lc_last_shipment_date DATE;
    `);
  },
};
