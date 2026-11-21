const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'musclegreed-member-secret-2026';

function memberAuth(req, res, next) {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.mg_member_token) {
      token = req.cookies.mg_member_token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please login with your phone number and password.',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, phone, name }
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session. Please log in again.',
    });
  }
}

module.exports = {
  memberAuth,
  JWT_SECRET,
};
