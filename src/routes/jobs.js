const express = require('express');
const c = require('../controllers/jobsController');

const router = express.Router();

router.get('/', c.list);
router.get('/stats', c.stats);
router.post('/', c.create);
router.get('/:id', c.getOne);
router.put('/:id', c.update);
router.delete('/:id', c.remove);
router.post('/:id/archive', c.archive);

router.get('/:id/containers', c.listContainers);
router.post('/:id/containers', c.addContainer);
router.get('/:id/rates', c.listRates);
router.post('/:id/rates', c.addRate);

router.get('/:id/profit', c.profit);
router.post('/:id/generate-taxes', c.generateTaxes);

module.exports = router;
