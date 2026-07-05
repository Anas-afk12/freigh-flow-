const express = require('express');
const c = require('../controllers/rateSheetController');

const rates = express.Router();
rates.get('/master', c.listMaster);
rates.get('/master/match', c.matchMaster);
rates.post('/master', c.createMaster);
rates.put('/master/:id', c.updateMaster);
rates.delete('/master/:id', c.removeMaster);
rates.get('/local', c.listLocal);
rates.put('/local/:chargeType', c.upsertLocal);

const lines = express.Router();
lines.get('/', c.listLines);
lines.post('/', c.createLine);
lines.get('/:id', c.getLine);
lines.put('/:id', c.updateLine);
lines.delete('/:id', c.removeLine);
lines.post('/:id/active', c.setLineActive);

module.exports = { rates, lines };
