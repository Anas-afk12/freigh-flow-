// A1 — BL tracking (received / forwarded). Internal tracking only; never
// printed on any document. Status is DERIVED (NOT_RECEIVED / RECEIVED /
// FORWARDED), not stored.
module.exports = {
  name: 'bl-tracking',
  up(db) {
    db.exec(`
      ALTER TABLE jobs ADD COLUMN bl_received_date DATE;
      ALTER TABLE jobs ADD COLUMN bl_received_from TEXT;
      ALTER TABLE jobs ADD COLUMN bl_forwarded_date DATE;
      ALTER TABLE jobs ADD COLUMN bl_forwarded_method TEXT
        CHECK(bl_forwarded_method IN ('EMAIL','COURIER','HAND') OR bl_forwarded_method IS NULL);
      ALTER TABLE jobs ADD COLUMN bl_forwarded_to TEXT
        CHECK(bl_forwarded_to IN ('CLIENT','CONSIGNEE','BANK') OR bl_forwarded_to IS NULL);
    `);
  },
};
