// FreightFlow PRO — Express server. Serves the local REST API and the static
// frontend from /public. All data stays local in a single SQLite file; no
// external services are contacted. Electron spawns this as a child process.
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { seed } = require('./src/db/seed');
const db = require('./src/db/connection');
const logger = require('./src/middleware/logger');
const apiRoutes = require('./src/routes');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

// Ensure schema + seed exist on boot (idempotent).
seed();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(logger);

app.use('/api', apiRoutes);

// Static frontend.
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 404 for unknown /api routes, then centralized error handler.
app.use('/api', notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`FreightFlow PRO running at http://localhost:${PORT}  (db backend: ${db.__backend})`);
});

module.exports = { app, server };
