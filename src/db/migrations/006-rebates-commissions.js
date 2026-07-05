// A2 — rebates & commissions. amount is INTEGER minor units (B1). Totals are
// NEVER cached on jobs — always computed from this table. Never printed on
// any document. Also adds agent flags to clients.
module.exports = {
  name: 'rebates-commissions',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rebates_commissions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id      INTEGER NOT NULL,
        type        TEXT NOT NULL CHECK(type IN ('CLIENT_REBATE','LINE_REBATE','AGENT_COMMISSION')),
        party_id    INTEGER,
        amount      INTEGER NOT NULL CHECK(amount >= 0),
        currency    TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','PKR')),
        paid_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(paid_status IN ('UNPAID','PAID')),
        paid_date   DATE,
        paid_ref    TEXT,
        notes       TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id)   REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (party_id) REFERENCES clients(id)
      );
      CREATE INDEX IF NOT EXISTS idx_rebates_job ON rebates_commissions(job_id);

      ALTER TABLE clients ADD COLUMN is_agent INTEGER NOT NULL DEFAULT 0 CHECK(is_agent IN (0,1));
      ALTER TABLE clients ADD COLUMN commission_rate DECIMAL;
    `);
  },
};
