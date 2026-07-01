const express = require('express');
const c = require('../controllers/documentsController');

const router = express.Router();

router.post('/:jobId/bl', c.bl);
router.post('/:jobId/invoice', c.invoice);
router.post('/:jobId/booking', c.booking);
router.post('/:jobId/cro', c.cro);
// GET aliases so a browser link can open a PDF directly.
router.get('/:jobId/bl', c.bl);
router.get('/:jobId/invoice', c.invoice);
router.get('/:jobId/booking', c.booking);
router.get('/:jobId/cro', c.cro);

module.exports = router;
