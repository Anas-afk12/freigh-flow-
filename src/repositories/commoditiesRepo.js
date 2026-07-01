// SQL for the commodities master table.
const { createRepo } = require('./masterDataRepo');

module.exports = createRepo(
  'commodities',
  ['name', 'hs_code', 'description', 'is_active'],
  ['name', 'hs_code', 'description']
);
