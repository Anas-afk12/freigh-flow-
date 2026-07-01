// Standard success envelope: { success:true, data }. Errors are shaped by the
// centralized error handler. asyncHandler forwards thrown errors to Express.
function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { ok, asyncHandler };
