// Creates every table, constraint, index and trigger for FreightFlow PRO.
// Idempotent (CREATE ... IF NOT EXISTS) — safe to run on every boot.
//
// Job_Number is the master key: jobs is the hub, and every child table
// (containers, rates, taxes, documents, bl_data) references it, cascading on
// delete. Master data (clients/ports/commodities/container_types) is
// referenced by jobs and toggled active/inactive rather than deleted.
const db = require('./connection');

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Atomic, gap-free per-year job number sequence (Improvement #9).
    CREATE TABLE IF NOT EXISTS job_number_sequence (
      year          INTEGER PRIMARY KEY,
      last_sequence INTEGER NOT NULL DEFAULT 0
    );

    -- Atomic per-(doc_type, year) sequence for generated documents (§12B).
    CREATE TABLE IF NOT EXISTS document_number_sequence (
      doc_type      TEXT NOT NULL,
      year          INTEGER NOT NULL,
      last_sequence INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (doc_type, year)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      type           TEXT NOT NULL CHECK(type IN ('SHIPPER','CONSIGNEE','NOTIFY','VENDOR')),
      address        TEXT,
      phone          TEXT,
      email          TEXT,
      contact_person TEXT,
      tax_id         TEXT,
      is_active      INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ports (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      code       TEXT,
      country    TEXT,
      is_active  INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS commodities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      hs_code     TEXT,
      description TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS container_types (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL UNIQUE,
      description  TEXT,
      weight_limit DECIMAL,
      is_active    INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      job_number           TEXT UNIQUE NOT NULL,
      job_type             TEXT NOT NULL DEFAULT 'FCL' CHECK(job_type IN ('FCL','LCL')),
      direction            TEXT NOT NULL DEFAULT 'EXPORT' CHECK(direction IN ('EXPORT','IMPORT')),
      created_date         DATE DEFAULT CURRENT_DATE,
      shipper_id           INTEGER,
      consignee_id         INTEGER,
      notify_1_id          INTEGER,
      notify_2_id          INTEGER,
      commodity_id         INTEGER,
      pol_id               INTEGER,
      pod_id               INTEGER,
      bl_number            TEXT,
      packages             INTEGER,
      gross_weight         DECIMAL,
      net_weight           DECIMAL,
      marks                TEXT,
      fin_number           TEXT,
      etd                  DATE,
      eta                  DATE,
      status               TEXT NOT NULL DEFAULT 'BOOKED'
                             CHECK(status IN ('BOOKED','SAILED','DELIVERED','CLOSED','CANCELLED')),
      notes                TEXT,
      internal_notes       TEXT,
      exchange_rate_locked DECIMAL,
      is_archived          INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),
      created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shipper_id)   REFERENCES clients(id),
      FOREIGN KEY (consignee_id) REFERENCES clients(id),
      FOREIGN KEY (notify_1_id)  REFERENCES clients(id),
      FOREIGN KEY (notify_2_id)  REFERENCES clients(id),
      FOREIGN KEY (commodity_id) REFERENCES commodities(id),
      FOREIGN KEY (pol_id)       REFERENCES ports(id),
      FOREIGN KEY (pod_id)       REFERENCES ports(id)
    );

    CREATE TABLE IF NOT EXISTS containers (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id            INTEGER NOT NULL,
      container_number  TEXT,
      container_type_id INTEGER,
      seal_number       TEXT,
      vessel            TEXT,
      voyage            TEXT,
      status            TEXT NOT NULL DEFAULT 'EMPTY'
                          CHECK(status IN ('EMPTY','FULL','INTRANSIT','DELIVERED')),
      pickup_location   TEXT,
      pickup_date       DATE,
      delivery_date     DATE,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id)            REFERENCES jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (container_type_id) REFERENCES container_types(id)
    );

    -- Monetary amounts are stored as INTEGER minor units (cents/paisa) — B1.
    CREATE TABLE IF NOT EXISTS rates (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id         INTEGER NOT NULL,
      rate_type      TEXT NOT NULL CHECK(rate_type IN ('BUYING','SELLING')),
      charge_type    TEXT NOT NULL,
      amount         INTEGER NOT NULL CHECK(amount >= 0),
      currency       TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','PKR')),
      vendor_id      INTEGER,
      invoice_number TEXT,
      paid_status    TEXT NOT NULL DEFAULT 'UNPAID' CHECK(paid_status IN ('UNPAID','PAID')),
      paid_date      DATE,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id)    REFERENCES jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (vendor_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS taxes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id      INTEGER NOT NULL,
      tax_type    TEXT NOT NULL CHECK(tax_type IN ('ZKT','KHRT')),
      percentage  DECIMAL NOT NULL,
      base_amount INTEGER NOT NULL, -- PKR paisa (minor units)
      amount      INTEGER NOT NULL, -- PKR paisa (minor units)
      paid_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(paid_status IN ('UNPAID','PAID')),
      paid_date   DATE,
      paid_ref    TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id         INTEGER NOT NULL,
      doc_type       TEXT NOT NULL CHECK(doc_type IN ('BL','INVOICE','BOOKING','CRO')),
      doc_number     TEXT,
      file_path      TEXT,
      generated_date DATE DEFAULT CURRENT_DATE,
      sent_date      DATE,
      sent_to        TEXT CHECK(sent_to IN ('CLIENT','CONSIGNEE','BANK') OR sent_to IS NULL),
      sent_method    TEXT CHECK(sent_method IN ('EMAIL','PRINT','COURIER') OR sent_method IS NULL),
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bl_data (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id         INTEGER NOT NULL UNIQUE,
      bl_number      TEXT,
      vessel         TEXT,
      voyage         TEXT,
      port_loading   TEXT,
      port_discharge TEXT,
      port_delivery  TEXT,
      freight_terms  TEXT CHECK(freight_terms IN ('PREPAID','COLLECT') OR freight_terms IS NULL),
      free_days      INTEGER,
      issued_date    DATE,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status        ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_shipper       ON jobs(shipper_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_consignee     ON jobs(consignee_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_pod           ON jobs(pod_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_pol           ON jobs(pol_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_archived      ON jobs(is_archived);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_date  ON jobs(created_date);
    CREATE INDEX IF NOT EXISTS idx_containers_job     ON containers(job_id);
    CREATE INDEX IF NOT EXISTS idx_containers_type    ON containers(container_type_id);
    CREATE INDEX IF NOT EXISTS idx_rates_job          ON rates(job_id);
    CREATE INDEX IF NOT EXISTS idx_rates_vendor       ON rates(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_rates_type         ON rates(rate_type);
    CREATE INDEX IF NOT EXISTS idx_taxes_job          ON taxes(job_id);
    CREATE INDEX IF NOT EXISTS idx_documents_job      ON documents(job_id);
    CREATE INDEX IF NOT EXISTS idx_bl_data_job        ON bl_data(job_id);
    CREATE INDEX IF NOT EXISTS idx_clients_type       ON clients(type);
    CREATE INDEX IF NOT EXISTS idx_clients_active     ON clients(is_active);

    CREATE TRIGGER IF NOT EXISTS trg_clients_updated_at
      AFTER UPDATE ON clients BEGIN
        UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    CREATE TRIGGER IF NOT EXISTS trg_ports_updated_at
      AFTER UPDATE ON ports BEGIN
        UPDATE ports SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    CREATE TRIGGER IF NOT EXISTS trg_commodities_updated_at
      AFTER UPDATE ON commodities BEGIN
        UPDATE commodities SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    CREATE TRIGGER IF NOT EXISTS trg_container_types_updated_at
      AFTER UPDATE ON container_types BEGIN
        UPDATE container_types SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    CREATE TRIGGER IF NOT EXISTS trg_jobs_updated_at
      AFTER UPDATE ON jobs BEGIN
        UPDATE jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    CREATE TRIGGER IF NOT EXISTS trg_containers_updated_at
      AFTER UPDATE ON containers BEGIN
        UPDATE containers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    CREATE TRIGGER IF NOT EXISTS trg_rates_updated_at
      AFTER UPDATE ON rates BEGIN
        UPDATE rates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    CREATE TRIGGER IF NOT EXISTS trg_taxes_updated_at
      AFTER UPDATE ON taxes BEGIN
        UPDATE taxes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    CREATE TRIGGER IF NOT EXISTS trg_bl_data_updated_at
      AFTER UPDATE ON bl_data BEGIN
        UPDATE bl_data SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
  `);
}

if (require.main === module) {
  createSchema();
  console.log(`Schema created successfully. (backend: ${db.__backend})`);
}

module.exports = { createSchema };
