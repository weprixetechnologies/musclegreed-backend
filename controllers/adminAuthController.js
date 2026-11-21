const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  expires: new Date(0),
  maxAge: 0,
};

function generateAccessToken(admin) {
  return jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      name: admin.name,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}

function generateRefreshToken(admin) {
  return jwt.sign(
    {
      id: admin.id,
      tokenId: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

// 1. Admin Login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
      });
    }

    const [admins] = await pool.query('SELECT * FROM admins WHERE email = ?', [email]);
    if (admins.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const admin = admins[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const accessToken = generateAccessToken(admin);
    const refreshToken = generateRefreshToken(admin);

    // Save refresh token in database
    await pool.query(
      'INSERT INTO refresh_tokens (admin_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [admin.id, refreshToken]
    );

    // Set HttpOnly cookie for refresh token
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      accessToken,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during login',
    });
  }
}

// 2. Refresh Token
async function refreshToken(req, res) {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      });
    }

    // Verify token exists in database and is not expired
    const [rows] = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = ? AND admin_id = ? AND expires_at > NOW()',
      [token, decoded.id]
    );

    if (rows.length === 0) {
      res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
      return res.status(401).json({
        success: false,
        message: 'Refresh token revoked or expired',
      });
    }

    // Token rotation with 30-second grace period:
    // Instead of deleting immediately, set the old refresh token to expire in 30 seconds.
    // This allows concurrent in-flight requests (e.g. initial page load) to succeed
    // without triggering false "revoked or expired" 401 errors.
    await pool.query(
      'UPDATE refresh_tokens SET expires_at = DATE_ADD(NOW(), INTERVAL 30 SECOND) WHERE token = ?',
      [token]
    );

    // Asynchronously cleanup old expired tokens
    pool.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()').catch(() => {});

    // Fetch fresh admin details
    const [admins] = await pool.query('SELECT id, name, email, role FROM admins WHERE id = ?', [decoded.id]);
    if (admins.length === 0) {
      res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
      return res.status(401).json({
        success: false,
        message: 'Admin account not found',
      });
    }

    const admin = admins[0];
    const newAccessToken = generateAccessToken(admin);
    const newRefreshToken = generateRefreshToken(admin);

    // Insert new rotated refresh token
    await pool.query(
      'INSERT INTO refresh_tokens (admin_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [admin.id, newRefreshToken]
    );

    // Set new cookie
    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
    });
  }
}

// 3. Admin Logout
async function logout(req, res) {
  try {
    const token = req.cookies.refreshToken;

    if (token) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = ?', [token]);
    }

    res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
}

// 4. Get Current Admin Profile
async function getMe(req, res) {
  try {
    const adminId = req.admin.id;
    const [admins] = await pool.query(
      'SELECT id, name, email, role, created_at FROM admins WHERE id = ?',
      [adminId]
    );

    if (admins.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    return res.status(200).json({
      success: true,
      admin: admins[0],
    });
  } catch (error) {
    console.error('getMe error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin profile',
    });
  }
}

module.exports = {
  login,
  refreshToken,
  logout,
  getMe,
};
