// Domain Addendum — R2 (CBM for LCL W/M pricing), R4 (House BL vs Master BL),
// and the OPTIONAL plain-storage fields (customs / insurance / VGM /
// demurrage notes). Optional fields get columns + plain inputs only: no
// workflow, no alerts, no validation forcing their use. All nullable —
// a job using none of them behaves identically to before.
module.exports = {
  name: 'domain-addendum',
  up(db) {
    db.exec(`
      -- R2: LCL pricing needs CBM (W/M — per CBM or per tonne, whichever higher)
      ALTER TABLE jobs ADD COLUMN cbm DECIMAL;

      -- R4: House BL alongside the existing (Master) bl_number
      ALTER TABLE jobs ADD COLUMN house_bl_number TEXT;

      -- Optional: customs (free text — different offices use different terms)
      ALTER TABLE jobs ADD COLUMN customs_status TEXT;
      ALTER TABLE jobs ADD COLUMN customs_clearing_agent TEXT;
      ALTER TABLE jobs ADD COLUMN customs_reference TEXT;

      -- Optional: insurance (insured_value in INTEGER cents — B1)
      ALTER TABLE jobs ADD COLUMN insurance_policy_number TEXT;
      ALTER TABLE jobs ADD COLUMN insurance_insured_value INTEGER;
      ALTER TABLE jobs ADD COLUMN insurance_insurer TEXT;

      -- Optional: Verified Gross Mass record-keeping
      ALTER TABLE jobs ADD COLUMN vgm_kg DECIMAL;

      -- Optional: demurrage free text on containers
      ALTER TABLE containers ADD COLUMN demurrage_notes TEXT;
    `);
  },
};
