// SQL for the clients master table (shippers, consignees, notify parties, vendors).
const { createRepo } = require('./masterDataRepo');

module.exports = createRepo(
  'clients',
  ['name', 'type', 'address', 'phone', 'email', 'contact_person', 'tax_id', 'is_active', 'is_agent', 'commission_rate'],
  ['name', 'email', 'contact_person', 'tax_id']
);
