const express = require('express');
const c = require('../controllers/settingsController');

const router = express.Router();

router.get('/', c.get);
router.put('/', c.update);

module.exports = router;
