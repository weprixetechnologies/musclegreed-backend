const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/memberAuth');
const { uploadImage } = require('../services/uploadService');

// Helper for local YYYY-MM-DD date string (independent of UTC conversion)
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to generate unique membership ID: e.g. MG-58291
async function generateUniqueMembershipId() {
  let isUnique = false;
  let membershipId = '';
  while (!isUnique) {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    membershipId = `MG-${randomDigits}`;
    const [rows] = await pool.query('SELECT id FROM memberships WHERE membership_id = ?', [membershipId]);
    if (rows.length === 0) {
      isUnique = true;
    }
  }
  return membershipId;
}

// Helper to generate unique order ID: e.g. ORD-71924
async function generateUniqueOrderId() {
  let isUnique = false;
  let orderId = '';
  while (!isUnique) {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    orderId = `ORD-${randomDigits}`;
    const [rows] = await pool.query('SELECT id FROM subscription_orders WHERE order_id = ?', [orderId]);
    if (rows.length === 0) {
      isUnique = true;
    }
  }
  return orderId;
}

// Helper to calculate days for interval
function getDaysForInterval(interval) {
  switch ((interval || '').toUpperCase()) {
    case 'WEEKLY':
      return 7;
    case 'YEARLY':
      return 365;
    case 'MONTHLY':
    default:
      return 30;
  }
}

// Reconcile user account on every accept / lookup:
// 1. Merges any duplicate memberships for the exact same service under the same user into a single canonical membership ID.
// 2. Re-points orders to the canonical membership.
// 3. Stacks approved durations sequentially so that multiple approved passes for the same service NEVER run concurrently in the same month.
async function reconcileUserAccount(userId) {
  if (!userId) return;

  try {
    const [memberships] = await pool.query(
      'SELECT * FROM memberships WHERE user_id = ? ORDER BY id ASC',
      [userId]
    );

    const byService = {};
    for (const m of memberships) {
      if (!byService[m.service_id]) byService[m.service_id] = [];
      byService[m.service_id].push(m);
    }

    for (const serviceId of Object.keys(byService)) {
      const list = byService[serviceId];
      const primary = list[0];

      // Merge duplicate secondary memberships for the exact same service into primary
      if (list.length > 1) {
        for (let i = 1; i < list.length; i++) {
          const secondary = list[i];
          console.log(`Reconciling user ${userId}: merging secondary ${secondary.membership_id} into ${primary.membership_id}`);
          await pool.query(
            'UPDATE subscription_orders SET membership_id = ? WHERE membership_id = ?',
            [primary.membership_id, secondary.membership_id]
          );
          await pool.query('DELETE FROM memberships WHERE id = ?', [secondary.id]);
        }
      }

      // Calculate timeline and ensure current active pass is displayed on the membership
      const timelineRes = await calculateMembershipTimeline(primary.membership_id);

      if (timelineRes.currentPass) {
        await pool.query(
          `UPDATE memberships 
           SET start_date = ?, end_date = ?, status = ?, plan_id = ?, plan_title = ?, interval_type = ?, price = ? 
           WHERE id = ?`,
          [
            timelineRes.currentPass.startDate,
            timelineRes.currentPass.endDate,
            timelineRes.status,
            timelineRes.currentPass.planId,
            timelineRes.currentPass.planTitle,
            timelineRes.currentPass.intervalType,
            timelineRes.currentPass.amount,
            primary.id
          ]
        );
      }
    }
  } catch (err) {
    console.error(`Error in reconcileUserAccount for user ${userId}:`, err);
  }
}

// Calculate full sequential timeline and upcoming passes for a membership
async function calculateMembershipTimeline(membershipId) {
  const [approvedOrders] = await pool.query(
    'SELECT * FROM subscription_orders WHERE membership_id = ? AND status = "approved" ORDER BY reviewed_at ASC, created_at ASC',
    [membershipId]
  );

  const [pendingOrders] = await pool.query(
    'SELECT * FROM subscription_orders WHERE membership_id = ? AND status = "pending" ORDER BY created_at ASC',
    [membershipId]
  );

  const todayStr = getLocalDateString();
  let rollingEnd = null;
  const timeline = [];

  for (let i = 0; i < approvedOrders.length; i++) {
    const ord = approvedOrders[i];
    const days = getDaysForInterval(ord.interval_type);

    let pStart;
    const ordTime = ord.reviewed_at ? new Date(ord.reviewed_at) : new Date(ord.created_at);
    if (i === 0 || !rollingEnd) {
      pStart = ordTime;
    } else {
      // If previous pass already ended before this order was reviewed/created, this order starts at ordTime (fresh renewal)
      // Otherwise, if this is an extension while previous pass is active, stack it sequentially onto rollingEnd!
      if (ordTime > rollingEnd) {
        pStart = ordTime;
      } else {
        pStart = new Date(rollingEnd);
      }
    }

    const pEnd = new Date(pStart);
    pEnd.setDate(pEnd.getDate() + days);
    rollingEnd = new Date(pEnd);

    timeline.push({
      orderId: ord.order_id,
      planId: ord.plan_id,
      planTitle: ord.plan_title,
      intervalType: ord.interval_type,
      amount: ord.amount,
      startDate: pStart.toISOString().slice(0, 10),
      endDate: pEnd.toISOString().slice(0, 10),
      status: 'approved',
      statusLabel: 'Approved / Scheduled',
    });
  }

  if (timeline.length === 0) {
    // Check if membership table has existing start_date and end_date (e.g. seeded or manually updated)
    const [mRows] = await pool.query('SELECT * FROM memberships WHERE membership_id = ?', [membershipId]);
    if (mRows.length > 0 && mRows[0].start_date && mRows[0].end_date) {
      const m = mRows[0];
      const mEnd = new Date(m.end_date).toISOString().slice(0, 10);
      const isOngoing = todayStr <= mEnd;
      const currentPass = {
        orderId: null,
        planId: m.plan_id,
        planTitle: m.plan_title,
        intervalType: m.interval_type,
        amount: m.price,
        startDate: new Date(m.start_date).toISOString().slice(0, 10),
        endDate: mEnd,
        status: isOngoing ? 'active' : 'paused',
        statusLabel: isOngoing ? 'Active' : 'Paused',
      };

      let pendingRollingStart = new Date(mEnd);
      const upcomingPending = [];
      for (const pOrd of pendingOrders) {
        const pDays = getDaysForInterval(pOrd.interval_type);
        const pStart = new Date(pendingRollingStart);
        const pEnd = new Date(pStart);
        pEnd.setDate(pEnd.getDate() + pDays);
        pendingRollingStart = new Date(pEnd);

        upcomingPending.push({
          orderId: pOrd.order_id,
          planId: pOrd.plan_id,
          planTitle: pOrd.plan_title,
          intervalType: pOrd.interval_type,
          amount: pOrd.amount,
          startDate: pStart.toISOString().slice(0, 10),
          endDate: pEnd.toISOString().slice(0, 10),
          status: 'pending',
          statusLabel: 'Pending Admin Verification',
        });
      }

      return {
        currentPass,
        finalExpiryDate: mEnd,
        upcomingPasses: upcomingPending,
        status: isOngoing ? 'active' : 'paused',
      };
    }

    const upcomingPending = pendingOrders.map((pOrd) => ({
      orderId: pOrd.order_id,
      planId: pOrd.plan_id,
      planTitle: pOrd.plan_title,
      intervalType: pOrd.interval_type,
      amount: pOrd.amount,
      startDate: null,
      endDate: null,
      status: 'pending',
      statusLabel: 'Pending Admin Verification',
    }));

    return {
      currentPass: null,
      finalExpiryDate: null,
      upcomingPasses: upcomingPending,
      status: 'pending',
    };
  }

  // Active item: check if today falls into any period
  let activeIdx = timeline.findIndex((t) => todayStr >= t.startDate && todayStr < t.endDate);

  if (activeIdx === -1) {
    if (todayStr >= timeline[timeline.length - 1].endDate) {
      activeIdx = timeline.length - 1; // Expired / Paused
    } else {
      activeIdx = 0; // Starts in future
    }
  }

  const currentPass = timeline[activeIdx];
  const finalExpiryDate = timeline[timeline.length - 1].endDate;
  const isOngoing = todayStr < finalExpiryDate;
  const status = isOngoing ? 'active' : 'paused';

  // Upcoming approved passes (scheduled after current active pass)
  const upcomingApproved = timeline.slice(activeIdx + 1);

  // Upcoming pending orders (scheduled to start at finalExpiryDate)
  let pendingRollingStart = new Date(finalExpiryDate);
  const upcomingPending = [];

  for (const pOrd of pendingOrders) {
    const pDays = getDaysForInterval(pOrd.interval_type);
    const pStart = new Date(pendingRollingStart);
    const pEnd = new Date(pStart);
    pEnd.setDate(pEnd.getDate() + pDays);
    pendingRollingStart = new Date(pEnd);

    upcomingPending.push({
      orderId: pOrd.order_id,
      planId: pOrd.plan_id,
      planTitle: pOrd.plan_title,
      intervalType: pOrd.interval_type,
      amount: pOrd.amount,
      startDate: pStart.toISOString().slice(0, 10),
      endDate: pEnd.toISOString().slice(0, 10),
      status: 'pending',
      statusLabel: 'Pending Admin Verification',
    });
  }

  return {
    currentPass,
    finalExpiryDate,
    upcomingPasses: [...upcomingApproved, ...upcomingPending],
    status,
  };
}

// ================= PAYMENT SETTINGS =================

// 1. GET Payment Settings (Public)
async function getPaymentSettings(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM payment_settings WHERE id = 1');
    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          qr_image_url: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=musclegreed@upi%26pn=MuscleGreed%26cu=INR',
          upi_id: 'musclegreed@upi',
          merchant_name: 'MuscleGreed Gym & Fitness',
          instructions: 'Scan using any UPI app. Upload payment screenshot and enter 12-digit UTR.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error('Error fetching payment settings:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch payment settings.' });
  }
}

// 2. PUT Payment Settings (Admin only)
async function updatePaymentSettings(req, res) {
  try {
    const { qr_image_url, upi_id, merchant_name, instructions } = req.body;

    await pool.query(`
      INSERT INTO payment_settings (id, qr_image_url, upi_id, merchant_name, instructions)
      VALUES (1, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        qr_image_url = VALUES(qr_image_url),
        upi_id = VALUES(upi_id),
        merchant_name = VALUES(merchant_name),
        instructions = VALUES(instructions)
    `, [qr_image_url || null, upi_id || 'musclegreed@upi', merchant_name || 'MuscleGreed', instructions || '']);

    return res.status(200).json({
      success: true,
      message: 'Payment scanner & UPI settings updated successfully.',
      data: { qr_image_url, upi_id, merchant_name, instructions },
    });
  } catch (error) {
    console.error('Error updating payment settings:', error);
    return res.status(500).json({ success: false, message: 'Failed to update payment settings.' });
  }
}

// 3. POST Upload Payment Proof (Public/User)
async function uploadPaymentProof(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No screenshot file provided.' });
    }

    const uploadResult = await uploadImage(req.file, 'payment_proofs');
    return res.status(200).json({
      success: true,
      url: uploadResult.url,
      message: 'Payment proof screenshot uploaded successfully.',
    });
  } catch (error) {
    console.error('Error uploading payment proof:', error);
    return res.status(500).json({ success: false, message: 'Failed to upload screenshot.' });
  }
}

// ================= PUBLIC LOOKUP =================

// 4. GET Lookup Membership by ID (Public, for "Renew Member without login")
async function lookupMembership(req, res) {
  try {
    const { membershipId } = req.params;
    if (!membershipId) {
      return res.status(400).json({ success: false, message: 'Membership ID is required.' });
    }

    const cleanId = membershipId.trim().toUpperCase();

    // Auto-pause if expired
    await pool.query(`
      UPDATE memberships
      SET status = 'paused'
      WHERE membership_id = ?
        AND status = 'active'
        AND end_date IS NOT NULL
        AND end_date < CURDATE()
    `, [cleanId]);

    const [rows] = await pool.query(`
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
        u.name as user_name,
        u.phone as user_phone,
        u.status as user_status
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      WHERE m.membership_id = ?
    `, [cleanId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No membership found matching ID "${cleanId}". Please check and try again.`,
      });
    }

    const m = rows[0];

    if (m.user_status === 'banned' || m.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: 'This membership or associated member account has been suspended by gym management.',
      });
    }

    // Mask user name for privacy (e.g. Rahul Sharma -> R**** S****)
    const nameParts = (m.user_name || '').split(' ');
    const maskedName = nameParts
      .map(part => (part.length > 1 ? part[0] + '*'.repeat(Math.max(1, part.length - 1)) : part))
      .join(' ');

    const timeline = await calculateMembershipTimeline(cleanId);
    const currentPass = timeline.currentPass;

    const isExpired = (timeline.status === 'paused') || (m.end_date && new Date(m.end_date) < new Date());
    const isOngoing = (timeline.status === 'active') || (m.status === 'active' && !isExpired);

    // Fetch available plans for this service so user can choose renewal plan
    let availablePlans = [];
    try {
      const [configRows] = await pool.query('SELECT data FROM subscriptions_config WHERE id = 1');
      if (configRows.length > 0) {
        const data = typeof configRows[0].data === 'string' ? JSON.parse(configRows[0].data) : configRows[0].data;
        availablePlans = data[m.service_id] || [];
      }
    } catch (e) {
      console.warn('Could not fetch available plans from subscriptions_config:', e);
    }

    return res.status(200).json({
      success: true,
      data: {
        membershipId: m.membership_id,
        userName: maskedName,
        userPhoneLast4: m.user_phone ? m.user_phone.slice(-4) : '',
        serviceId: m.service_id,
        serviceTitle: m.service_title,
        currentPlanId: currentPass ? currentPass.planId : m.plan_id,
        currentPlanTitle: currentPass ? currentPass.planTitle : m.plan_title,
        currentInterval: currentPass ? currentPass.intervalType : m.interval_type,
        currentPrice: currentPass ? currentPass.amount : m.price,
        status: timeline.status || m.status,
        startDate: currentPass ? currentPass.startDate : m.start_date,
        endDate: currentPass ? currentPass.endDate : m.end_date,
        finalExpiryDate: timeline.finalExpiryDate || m.end_date,
        upcomingPasses: timeline.upcomingPasses || [],
        isOngoing,
        isExpired: Boolean(isExpired),
        actionType: isOngoing ? 'extension' : 'renewal',
        availablePlans,
      },
    });
  } catch (error) {
    console.error('Error in lookupMembership:', error);
    return res.status(500).json({ success: false, message: 'Failed to look up membership.' });
  }
}

// ================= ENROLLMENT FLOW =================

// 5. POST Enroll Subscription (Modal Enrollment Flow)
async function enrollSubscription(req, res) {
  try {
    const {
      name,
      phone,
      password,
      serviceId,
      serviceTitle,
      planId,
      planTitle,
      interval,
      amount,
      utrNumber,
      screenshotUrl,
    } = req.body;

    if (!phone || !serviceId || !planId || !amount || !utrNumber || !screenshotUrl) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: phone, plan details, UTR number, and screenshot are mandatory.',
      });
    }

    const cleanPhone = phone.trim().replace(/\s+/g, '');
    const cleanUtr = utrNumber.trim();

    // Check if UTR number was already used
    const [existingUtr] = await pool.query(
      'SELECT id, order_id FROM subscription_orders WHERE utr_number = ?',
      [cleanUtr]
    );
    if (existingUtr.length > 0) {
      return res.status(400).json({
        success: false,
        message: `UTR / Reference Number "${cleanUtr}" has already been submitted under order ${existingUtr[0].order_id}.`,
      });
    }

    // 1. Check if user already exists
    const [existingUsers] = await pool.query('SELECT * FROM users WHERE phone = ?', [cleanPhone]);
    let userId = null;
    let finalUserName = name ? name.trim() : '';

    if (existingUsers.length > 0) {
      const user = existingUsers[0];
      if (user.status === 'banned') {
        return res.status(403).json({
          success: false,
          message: 'This account is suspended by gym management. Cannot enroll new passes.',
        });
      }

      // If password provided, verify password
      if (password) {
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            message: 'An account with this phone already exists, but the password was incorrect. Please enter your valid password.',
          });
        }
      }

      userId = user.id;
      finalUserName = user.name;
    } else {
      // Register as new user
      if (!finalUserName) {
        return res.status(400).json({
          success: false,
          message: 'Full Name is required for new registration.',
        });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password is required for new registration (minimum 6 characters).',
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [insertUser] = await pool.query(
        'INSERT INTO users (name, phone, password) VALUES (?, ?, ?)',
        [finalUserName, cleanPhone, hashedPassword]
      );
      userId = insertUser.insertId;
    }

    // 2. Determine Membership ID
    // If user already holds a pass for this service, attach to that Membership ID!
    // Otherwise, generate a new unique Membership ID.
    const [existingMembershipsForService] = await pool.query(
      'SELECT * FROM memberships WHERE user_id = ? AND service_id = ? ORDER BY id ASC',
      [userId, serviceId]
    );

    let membershipId = null;
    let orderType = 'new_subscription';
    const intervalType = (interval || 'MONTHLY').toUpperCase();

    if (existingMembershipsForService.length > 0) {
      const existingM = existingMembershipsForService[0];
      membershipId = existingM.membership_id;
      const isOngoing = existingM.status === 'active' && existingM.end_date && new Date(existingM.end_date) >= new Date();
      orderType = isOngoing ? 'extension' : 'renewal';
    } else {
      membershipId = await generateUniqueMembershipId();
      orderType = 'new_subscription';

      // Create Membership record with status 'pending'
      await pool.query(`
        INSERT INTO memberships (
          membership_id,
          user_id,
          service_id,
          service_title,
          plan_id,
          plan_title,
          interval_type,
          price,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `, [
        membershipId,
        userId,
        serviceId,
        serviceTitle || 'Gym Training Pass',
        planId,
        planTitle || 'Standard Pass',
        intervalType,
        amount,
      ]);
    }

    const orderId = await generateUniqueOrderId();

    // 4. Create Subscription Order with status 'pending'
    await pool.query(`
      INSERT INTO subscription_orders (
        order_id,
        membership_id,
        user_id,
        type,
        service_id,
        service_title,
        plan_id,
        plan_title,
        interval_type,
        amount,
        utr_number,
        screenshot_url,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      orderId,
      membershipId,
      userId,
      orderType,
      serviceId,
      serviceTitle || 'Gym Training Pass',
      planId,
      planTitle || 'Standard Pass',
      intervalType,
      amount,
      cleanUtr,
      screenshotUrl,
    ]);

    // Issue user JWT token
    const token = jwt.sign(
      { id: userId, phone: cleanPhone, name: finalUserName },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Subscription submitted successfully. Payment is pending admin verification.',
      membershipId,
      orderId,
      status: 'pending',
      token,
      user: {
        id: userId,
        name: finalUserName,
        phone: cleanPhone,
      },
    });
  } catch (error) {
    console.error('Error in enrollSubscription:', error);
    return res.status(500).json({ success: false, message: 'Failed to process enrollment submission.' });
  }
}

// ================= RENEWAL FLOW =================

// 6. POST Renew Membership (With or Without Login)
async function renewMembership(req, res) {
  try {
    const {
      membershipId,
      planId,
      planTitle,
      interval,
      amount,
      utrNumber,
      screenshotUrl,
    } = req.body;

    if (!membershipId || !planId || !amount || !utrNumber || !screenshotUrl) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: Membership ID, plan details, UTR number, and screenshot are mandatory.',
      });
    }

    const cleanId = membershipId.trim().toUpperCase();
    const cleanUtr = utrNumber.trim();

    // Check if UTR was already used
    const [existingUtr] = await pool.query(
      'SELECT id, order_id FROM subscription_orders WHERE utr_number = ?',
      [cleanUtr]
    );
    if (existingUtr.length > 0) {
      return res.status(400).json({
        success: false,
        message: `UTR / Reference Number "${cleanUtr}" has already been submitted under order ${existingUtr[0].order_id}.`,
      });
    }

    // Lookup membership
    const [memberships] = await pool.query(`
      SELECT m.*, u.status as user_status, u.id as user_id, u.name as user_name
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      WHERE m.membership_id = ?
    `, [cleanId]);

    if (memberships.length === 0) {
      return res.status(404).json({ success: false, message: `Membership ID "${cleanId}" not found.` });
    }

    const m = memberships[0];

    if (m.status === 'banned' || m.user_status === 'banned') {
      return res.status(403).json({
        success: false,
        message: 'This membership or user account is suspended by gym admin. Renewal not allowed.',
      });
    }

    // Determine type: extension or renewal
    const isOngoing = m.status === 'active' && m.end_date && new Date(m.end_date) >= new Date();
    const orderType = isOngoing ? 'extension' : 'renewal';

    const orderId = await generateUniqueOrderId();
    const intervalType = (interval || 'MONTHLY').toUpperCase();

    // Create Subscription Order with status 'pending'
    await pool.query(`
      INSERT INTO subscription_orders (
        order_id,
        membership_id,
        user_id,
        type,
        service_id,
        service_title,
        plan_id,
        plan_title,
        interval_type,
        amount,
        utr_number,
        screenshot_url,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      orderId,
      m.membership_id,
      m.user_id,
      orderType,
      m.service_id,
      m.service_title,
      planId,
      planTitle || 'Renewal Pass',
      intervalType,
      amount,
      cleanUtr,
      screenshotUrl,
    ]);

    return res.status(200).json({
      success: true,
      message: `Membership ${orderType === 'extension' ? 'extension' : 'renewal'} submitted for review.`,
      membershipId: m.membership_id,
      orderId,
      type: orderType,
      status: 'pending',
    });
  } catch (error) {
    console.error('Error in renewMembership:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit renewal request.' });
  }
}

// ================= ADMIN MANAGEMENT =================

// 7. GET Subscription Orders (Admin)
async function getAdminSubscriptionOrders(req, res) {
  try {
    const { status, search } = req.query;

    let query = `
      SELECT 
        o.id,
        o.order_id,
        o.membership_id,
        o.user_id,
        o.type,
        o.service_id,
        o.service_title,
        o.plan_id,
        o.plan_title,
        o.interval_type,
        o.amount,
        o.utr_number,
        o.screenshot_url,
        o.status,
        o.admin_remarks,
        DATE_FORMAT(o.reviewed_at, '%Y-%m-%d %H:%i') as reviewed_at,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i') as created_at,
        u.name as member_name,
        u.phone as member_phone,
        m.status as membership_status,
        DATE_FORMAT(m.end_date, '%Y-%m-%d') as current_end_date
      FROM subscription_orders o
      JOIN users u ON o.user_id = u.id
      JOIN memberships m ON o.membership_id = m.membership_id
    `;

    const conditions = [];
    const params = [];

    if (status && status !== 'ALL') {
      conditions.push('o.status = ?');
      params.push(status.toLowerCase());
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(o.order_id LIKE ? OR o.membership_id LIKE ? OR u.name LIKE ? OR u.phone LIKE ? OR o.utr_number LIKE ?)');
      params.push(term, term, term, term, term);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY o.created_at DESC';

    const [orders] = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error('Error in getAdminSubscriptionOrders:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch subscription orders.' });
  }
}

// 8. PUT Review Subscription Order (Approve or Reject with optional remarks)
async function reviewSubscriptionOrder(req, res) {
  try {
    const { orderId } = req.params;
    const { action, remarks } = req.body;

    if (!orderId || !action || !['approve', 'reject'].includes(action.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "approve" or "reject".',
      });
    }

    const [orders] = await pool.query(
      'SELECT * FROM subscription_orders WHERE order_id = ?',
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Subscription order not found.' });
    }

    const order = orders[0];
    const isApprove = action.toLowerCase() === 'approve';
    const newStatus = isApprove ? 'approved' : 'rejected';

    // Update the order record
    await pool.query(`
      UPDATE subscription_orders
      SET status = ?, admin_remarks = ?, reviewed_at = NOW()
      WHERE order_id = ?
    `, [newStatus, remarks || null, orderId]);

    // If Approved, reconcile user account on EVERY accept:
    // Merges duplicate passes for the same service, stacks durations sequentially,
    // and keeps the current active pass displayed while queueing extensions into upcoming_passes!
    if (isApprove) {
      await reconcileUserAccount(order.user_id);
    } else {
      // If rejected and was a brand-new subscription, we can keep status as 'pending' or 'rejected'
      // but for paused renewal, membership remains paused.
      console.log(`Order ${orderId} rejected with remarks: ${remarks || 'None'}`);
    }

    return res.status(200).json({
      success: true,
      message: `Order ${orderId} has been ${newStatus}.`,
      status: newStatus,
    });
  } catch (error) {
    console.error('Error in reviewSubscriptionOrder:', error);
    return res.status(500).json({ success: false, message: 'Failed to review order.' });
  }
}

// 9. GET Admin Members Directory (Real database integration)
async function getAdminMembers(req, res) {
  try {
    const { search } = req.query;

    let query = `
      SELECT 
        u.id,
        u.name,
        u.phone,
        u.status,
        u.ban_reason,
        DATE_FORMAT(u.created_at, '%Y-%m-%d') as joined_date,
        COUNT(m.id) as total_memberships
      FROM users u
      LEFT JOIN memberships m ON u.id = m.user_id
    `;

    const params = [];
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ' WHERE (u.name LIKE ? OR u.phone LIKE ?)';
      params.push(term, term);
    }

    query += ' GROUP BY u.id ORDER BY u.created_at DESC';

    const [members] = await pool.query(query, params);

    // Fetch all memberships for all users
    const [allMemberships] = await pool.query(`
      SELECT 
        membership_id,
        user_id,
        service_id,
        service_title,
        plan_id,
        plan_title,
        interval_type,
        price,
        status,
        DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
        DATE_FORMAT(end_date, '%Y-%m-%d') as end_date
      FROM memberships
      ORDER BY created_at DESC
    `);

    const enrichedAllMemberships = await Promise.all(
      allMemberships.map(async (m) => {
        const timeline = await calculateMembershipTimeline(m.membership_id);
        return {
          ...m,
          plan_title: timeline.currentPass ? timeline.currentPass.planTitle : m.plan_title,
          plan_id: timeline.currentPass ? timeline.currentPass.planId : m.plan_id,
          interval_type: timeline.currentPass ? timeline.currentPass.intervalType : m.interval_type,
          price: timeline.currentPass ? timeline.currentPass.amount : m.price,
          start_date: timeline.currentPass ? timeline.currentPass.startDate : m.start_date,
          end_date: timeline.currentPass ? timeline.currentPass.endDate : m.end_date,
          final_expiry_date: timeline.finalExpiryDate || m.end_date,
          upcoming_passes: timeline.upcomingPasses || [],
          status: timeline.status || m.status,
        };
      })
    );

    const membershipsByUser = {};
    for (const m of enrichedAllMemberships) {
      if (!membershipsByUser[m.user_id]) {
        membershipsByUser[m.user_id] = [];
      }
      membershipsByUser[m.user_id].push(m);
    }

    const result = members.map(u => ({
      ...u,
      memberships: membershipsByUser[u.id] || [],
    }));

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error in getAdminMembers:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch members.' });
  }
}

// 10. PUT Ban / Unban Member
async function updateMemberStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, ban_reason } = req.body;

    if (!['active', 'banned'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be active or banned.' });
    }

    await pool.query(
      'UPDATE users SET status = ?, ban_reason = ? WHERE id = ?',
      [status, ban_reason || null, id]
    );

    // If banned, also mark all memberships as banned
    if (status === 'banned') {
      await pool.query('UPDATE memberships SET status = "banned" WHERE user_id = ?', [id]);
    } else {
      // If unbanned, unban memberships back to paused
      await pool.query('UPDATE memberships SET status = "paused" WHERE user_id = ? AND status = "banned"', [id]);
    }

    return res.status(200).json({
      success: true,
      message: `Member status updated to ${status}.`,
    });
  } catch (error) {
    console.error('Error updating member status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update member status.' });
  }
}

// 11. PUT Update Membership Status Manually
async function updateMembershipStatus(req, res) {
  try {
    const { membershipId } = req.params;
    const { status } = req.body;

    if (!['active', 'paused', 'banned'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    await pool.query(
      'UPDATE memberships SET status = ? WHERE membership_id = ?',
      [status, membershipId]
    );

    return res.status(200).json({
      success: true,
      message: `Membership ${membershipId} status set to ${status}.`,
    });
  } catch (error) {
    console.error('Error updating membership status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update membership status.' });
  }
}

module.exports = {
  reconcileUserAccount,
  calculateMembershipTimeline,
  getPaymentSettings,
  updatePaymentSettings,
  uploadPaymentProof,
  lookupMembership,
  enrollSubscription,
  renewMembership,
  getAdminSubscriptionOrders,
  reviewSubscriptionOrder,
  getAdminMembers,
  updateMemberStatus,
  updateMembershipStatus,
};
