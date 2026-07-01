// SQL for the ports master table.
const { createRepo } = require('./masterDataRepo');

module.exports = createRepo(
  'ports',
  ['name', 'code', 'country', 'is_active'],
  ['name', 'code', 'country']
);
