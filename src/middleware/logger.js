// Minimal request logger — method, path, status, duration. No external deps.
function logger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const stamp = new Date().toISOString();
    console.log(`[${stamp}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}

module.exports = logger;
