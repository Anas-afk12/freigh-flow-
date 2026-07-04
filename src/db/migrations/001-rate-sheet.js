// A3 — Master Rate Sheet: master_rates (per POD + container type), local
// charges (per container size), and shipping lines. All monetary columns are
// INTEGER minor units (B1). Seeds standard local charge types and known
// shipping lines; port/container-type ids are looked up by name, never
// hardcoded. INSERT OR IGNORE keeps the migration safe on any dataset.
module.exports = {
  name: 'rate-sheet',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shipping_lines (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        code       TEXT NOT NULL UNIQUE,
        name       TEXT,
        is_active  INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- One row per (destination port, container type); amounts in cents.
      CREATE TABLE IF NOT EXISTS master_rates (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        destination_port_id INTEGER NOT NULL,
        container_type_id   INTEGER NOT NULL,
        freight_buying      INTEGER, freight_selling     INTEGER,
        placement_buying    INTEGER, placement_selling   INTEGER,
        lifting_buying      INTEGER, lifting_selling     INTEGER,
        bl_charges_buying   INTEGER, bl_charges_selling  INTEGER,
        cro_buying          INTEGER, cro_selling         INTEGER,
        seal_buying         INTEGER, seal_selling        INTEGER,
        currency            TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','PKR')),
        created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(destination_port_id, container_type_id),
        FOREIGN KEY (destination_port_id) REFERENCES ports(id),
        FOREIGN KEY (container_type_id)   REFERENCES container_types(id)
      );

      -- Standard local charges priced per container size; amounts in cents.
      CREATE TABLE IF NOT EXISTS local_charges (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        charge_type TEXT NOT NULL UNIQUE,
        amount_20   INTEGER,
        amount_40   INTEGER,
        amount_40hc INTEGER,
        currency    TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','PKR')),
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_master_rates_lookup
        ON master_rates(destination_port_id, container_type_id);
    `);

    const insLine = db.prepare('INSERT OR IGNORE INTO shipping_lines (code, name) VALUES (?, ?)');
    for (const [code, name] of [
      ['WHL', 'Wan Hai Lines'],
      ['ACE', 'ACE Container Line'],
      ['RAV', 'RAV Shipping'],
      ['CELSIUS', 'Celsius Shipping'],
      ['FENGHAI', 'Fenghai Line'],
    ]) insLine.run(code, name);

    const insCharge = db.prepare('INSERT OR IGNORE INTO local_charges (charge_type) VALUES (?)');
    for (const t of ['PLACEMENT', 'LOTO', 'CRO', 'SEAL', 'DOCS', 'TLX']) insCharge.run(t);
  },
};
