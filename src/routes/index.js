// API route wiring only — no logic. Mounts every resource under /api.
const express = require('express');
const jobs = require('./jobs');
const masterData = require('./masterData');
const reports = require('./reports');
const documents = require('./documents');
const settings = require('./settings');
const rateSheet = require('./rateSheet');

const router = express.Router();

router.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));
router.use('/jobs', jobs);
router.use('/rates', rateSheet.rates);
router.use('/shipping-lines', rateSheet.lines);
router.use('/import', require('./import'));
router.use('/rebates', require('./rebates'));
router.use('/reports', reports);
router.use('/documents', documents);
router.use('/settings', settings);
// Master data: /clients, /ports, /commodities, /container-types
router.use('/', masterData);

module.exports = router;
