// Wires the four master-data resources through the generic controller factory.
const express = require('express');
const { createController } = require('../controllers/masterDataController');
const clientsRepo = require('../repositories/clientsRepo');
const portsRepo = require('../repositories/portsRepo');
const commoditiesRepo = require('../repositories/commoditiesRepo');
const containerTypesRepo = require('../repositories/containerTypesRepo');

const router = express.Router();

function mount(path, controller) {
  router.get(`/${path}`, controller.list);
  router.post(`/${path}`, controller.create);
  router.get(`/${path}/:id`, controller.getOne);
  router.put(`/${path}/:id`, controller.update);
  router.delete(`/${path}/:id`, controller.remove);
  router.post(`/${path}/:id/active`, controller.setActive);
}

mount('clients', createController({
  repo: clientsRepo,
  requiredFields: ['name', 'type'],
  enums: [{ field: 'type', values: ['SHIPPER', 'CONSIGNEE', 'NOTIFY', 'VENDOR'] }],
}));

mount('ports', createController({ repo: portsRepo, requiredFields: ['name'] }));

mount('commodities', createController({ repo: commoditiesRepo, requiredFields: ['name'] }));

mount('container-types', createController({ repo: containerTypesRepo, requiredFields: ['code'] }));

module.exports = router;
