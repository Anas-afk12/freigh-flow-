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
router.post('/:id/clone', c.cloneJob);

router.get('/:id/containers', c.listContainers);
router.post('/:id/containers', c.addContainer);
router.get('/:id/rates', c.listRates);
router.post('/:id/rates', c.addRate);

router.post('/:id/bl-received', c.blReceived);
router.put('/:id/bl-forwarded', c.blForwarded);
router.put('/:id/lc', c.updateLc);

const rebates = require('../controllers/rebatesController');
router.get('/:id/rebates', rebates.listByJob);
router.post('/:id/rebates', rebates.create);

router.get('/:id/profit', c.profit);
router.post('/:id/generate-taxes', c.generateTaxes);

module.exports = router;
