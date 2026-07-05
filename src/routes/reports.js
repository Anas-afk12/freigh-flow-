const express = require('express');
const c = require('../controllers/reportsController');

const router = express.Router();

router.get('/gpsht', c.gpsht);
router.get('/gpsht/export', c.gpshtExport);
router.get('/jobgp', c.jobgp);
router.get('/jobgp/export', c.jobgpExport);
router.get('/payables-aging', c.payablesAging);
router.get('/payables-aging/export', c.payablesExport);

module.exports = router;
