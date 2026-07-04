const express = require('express');
const c = require('../controllers/rebatesController');

const router = express.Router();

router.put('/:id', c.update);
router.delete('/:id', c.remove);
router.post('/:id/paid', c.markPaid);

module.exports = router;
