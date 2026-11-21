/**
 * MuscleGreed Backend Request Logging Middleware
 * Logs incoming HTTP requests, response statuses, timing, origin, and cookie/auth status.
 */

function requestLogger(req, res, next) {
  const start = Date.now();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const origin = req.headers.origin || req.headers.referer || 'direct';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const hasAuthHeader = Boolean(req.headers.authorization);
    const hasRefreshCookie = Boolean(req.cookies?.refreshToken);

    // Terminal color codes
    const statusColor =
      statusCode >= 500
        ? '\x1b[31m' // Red
        : statusCode >= 400
        ? '\x1b[33m' // Yellow
        : statusCode >= 300
        ? '\x1b[36m' // Cyan
        : '\x1b[32m'; // Green
    const resetColor = '\x1b[0m';

    const authDetails = [
      hasAuthHeader ? 'Bearer' : null,
      hasRefreshCookie ? 'Cookie(refreshToken)' : null,
    ].filter(Boolean).join(' | ') || 'No-Auth';

    console.log(
      `[${timestamp}] ${req.method.padEnd(6)} ${req.originalUrl || req.url} ${statusColor}${statusCode}${resetColor} (${duration}ms) | Origin: ${origin} | [${authDetails}]`
    );

    // Provide immediate diagnostic hints for debugging auth & errors
    if (statusCode >= 400 || req.originalUrl?.includes('/admin/')) {
      if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
        const sanitizedBody = { ...req.body };
        if (sanitizedBody.password) sanitizedBody.password = '***REDACTED***';
        console.log(`   └─ [Payload]: ${JSON.stringify(sanitizedBody)}`);
      }
      if (!hasRefreshCookie && req.originalUrl?.includes('refresh-token')) {
        console.log(`   └─ [Notice]: refresh-token request arrived without refreshToken cookie. Raw Cookie header: "${req.headers.cookie || '(empty)'}"`);
      }
    }
  });

  next();
}

module.exports = requestLogger;
