const express = require('express');
const c = require('../controllers/reportsController');

const router = express.Router();

router.get('/gpsht', c.gpsht);
router.get('/gpsht/export', c.gpshtExport);
router.get('/jobgp', c.jobgp);
router.get('/jobgp/export', c.jobgpExport);

module.exports = router;
