const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/memberAuth');
const { reconcileUserAccount, calculateMembershipTimeline } = require('./membershipController');

// 1. Check if phone exists (for enrollment modal dynamic flow)
async function checkPhone(req, res) {
  try {
    const { phone } = req.body;
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const cleanPhone = phone.trim().replace(/\s+/g, '');
    const [rows] = await pool.query(
      'SELECT id, name, status FROM users WHERE phone = ?',
      [cleanPhone]
    );

    if (rows.length > 0) {
      return res.status(200).json({
        success: true,
        exists: true,
        name: rows[0].name,
        isBanned: rows[0].status === 'banned',
      });
    }

    return res.status(200).json({
      success: true,
      exists: false,
    });
  } catch (error) {
    console.error('Error in checkPhone:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify phone number.' });
  }
}

// 2. Member Login
async function login(req, res) {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone number and password are required.' });
    }

    const cleanPhone = phone.trim().replace(/\s+/g, '');
    const [users] = await pool.query(
      'SELECT id, name, phone, password, status, ban_reason FROM users WHERE phone = ?',
      [cleanPhone]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'No registered member found with this phone number.' });
    }

    const user = users[0];
    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: `Your account has been suspended: ${user.ban_reason || 'Violation of gym terms'}. Please contact reception.`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Error in member login:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during login.' });
  }
}

// 3. Get Logged-in Member Profile
async function getMe(req, res) {
  try {
    const [users] = await pool.query(
      'SELECT id, name, phone, status, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      user: users[0],
    });
  } catch (error) {
    console.error('Error in getMe:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
}

// 4. Get Current User's Memberships (with auto-pause on expiration & account reconciliation)
async function getMyMemberships(req, res) {
  try {
    const userId = req.user.id;

    // Reconcile user account: merge duplicate passes for same service and stack durations
    await reconcileUserAccount(userId);

    // Auto-pause any active memberships whose end_date is in the past!
    // ("if for example membership of 1month have EXPIRED then it wont cancel it will be paused.")
    await pool.query(`
      UPDATE memberships
      SET status = 'paused'
      WHERE user_id = ?
        AND status = 'active'
        AND end_date IS NOT NULL
        AND end_date < CURDATE()
    `, [userId]);

    // Fetch memberships
    const [memberships] = await pool.query(`
      SELECT 
        m.id,
        m.membership_id,
        m.service_id,
        m.service_title,
        m.plan_id,
        m.plan_title,
        m.interval_type,
        m.price,
        m.status,
        DATE_FORMAT(m.start_date, '%Y-%m-%d') as start_date,
        DATE_FORMAT(m.end_date, '%Y-%m-%d') as end_date,
        m.created_at,
        m.updated_at
      FROM memberships m
      WHERE m.user_id = ?
      ORDER BY m.created_at DESC
    `, [userId]);

    // Fetch recent orders / payment submissions for these memberships
    const [orders] = await pool.query(`
      SELECT 
        o.order_id,
        o.membership_id,
        o.type,
        o.plan_title,
        o.interval_type,
        o.amount,
        o.utr_number,
        o.screenshot_url,
        o.status,
        o.admin_remarks,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i') as created_at
      FROM subscription_orders o
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `, [userId]);

    // Group orders by membership_id
    const ordersByMembership = {};
    for (const order of orders) {
      if (!ordersByMembership[order.membership_id]) {
        ordersByMembership[order.membership_id] = [];
      }
      ordersByMembership[order.membership_id].push(order);
    }

    const enrichedMemberships = await Promise.all(
      memberships.map(async (m) => {
        const timeline = await calculateMembershipTimeline(m.membership_id);
        const isExpired = m.end_date && new Date(m.end_date) < new Date();

        const currentPlanTitle = timeline.currentPass ? timeline.currentPass.planTitle : m.plan_title;
        const currentPlanId = timeline.currentPass ? timeline.currentPass.planId : m.plan_id;
        const currentInterval = timeline.currentPass ? timeline.currentPass.intervalType : m.interval_type;
        const currentPrice = timeline.currentPass ? timeline.currentPass.amount : m.price;
        const currentStartDate = timeline.currentPass ? timeline.currentPass.startDate : m.start_date;
        const currentEndDate = timeline.currentPass ? timeline.currentPass.endDate : m.end_date;
        const membershipStatus = timeline.status || m.status;

        return {
          ...m,
          plan_title: currentPlanTitle,
          plan_id: currentPlanId,
          interval_type: currentInterval,
          price: currentPrice,
          start_date: currentStartDate,
          end_date: currentEndDate,
          final_expiry_date: timeline.finalExpiryDate || currentEndDate,
          upcoming_passes: timeline.upcomingPasses || [],
          status: membershipStatus,
          isExpired: Boolean(isExpired),
          recentOrders: ordersByMembership[m.membership_id] || [],
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: enrichedMemberships,
    });
  } catch (error) {
    console.error('Error in getMyMemberships:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch memberships.' });
  }
}

module.exports = {
  checkPhone,
  login,
  getMe,
  getMyMemberships,
};
