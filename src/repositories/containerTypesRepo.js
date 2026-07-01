// SQL for the container_types master table. Ordered by code (no name column).
const { createRepo } = require('./masterDataRepo');

module.exports = createRepo(
  'container_types',
  ['code', 'description', 'weight_limit', 'is_active'],
  ['code', 'description'],
  'code'
);
