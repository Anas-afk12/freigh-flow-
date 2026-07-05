const express = require('express');
const c = require('../controllers/importController');

const router = express.Router();

router.post('/:target/preview', c.preview);
router.post('/:target/commit', c.commit);

module.exports = router;
