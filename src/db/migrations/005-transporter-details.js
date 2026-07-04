// A6 — transporter details on containers. pickup_location already exists in
// the baseline schema; the rest are added here, all nullable.
module.exports = {
  name: 'transporter-details',
  up(db) {
    db.exec(`
      ALTER TABLE containers ADD COLUMN transporter TEXT;
      ALTER TABLE containers ADD COLUMN pickup_terminal TEXT;
      ALTER TABLE containers ADD COLUMN delivery_location TEXT;
      ALTER TABLE containers ADD COLUMN transporter_contact TEXT;
      ALTER TABLE containers ADD COLUMN pickup_contact_person TEXT;
      ALTER TABLE containers ADD COLUMN delivery_contact_person TEXT;
      ALTER TABLE containers ADD COLUMN pickup_instructions TEXT;
      ALTER TABLE containers ADD COLUMN delivery_instructions TEXT;
    `);
  },
};
