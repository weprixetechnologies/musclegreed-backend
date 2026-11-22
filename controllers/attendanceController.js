const pool = require('../config/db');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/memberAuth');

const FRONTEND_APP_URL = process.env.FRONTEND_APP_URL || 'http://localhost:3001';

// Helper: Haversine distance in meters
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of the Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: Calculate total working hours from an array of ordered punches for today
function calculateWorkingHours(punches) {
  if (!punches || punches.length === 0) {
    return { totalMinutes: 0, formatted: '0 hrs 0 mins', isCurrentlyIn: false };
  }

  let totalMs = 0;
  let lastInTime = null;

  for (const p of punches) {
    const time = new Date(p.punch_time).getTime();
    if (p.punch_type === 'IN') {
      lastInTime = time;
    } else if (p.punch_type === 'OUT' && lastInTime) {
      totalMs += (time - lastInTime);
      lastInTime = null;
    }
  }

  const isCurrentlyIn = Boolean(lastInTime);
  if (lastInTime) {
    const now = Date.now();
    totalMs += Math.max(0, now - lastInTime);
  }

  const totalMinutes = Math.floor(totalMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const formatted = `${hours} hrs ${minutes} mins`;

  return { totalMinutes, formatted, isCurrentlyIn };
}

// 1. GET Attendance QR Settings
async function getQRSettings(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM attendance_qr_settings WHERE id = 1');

    let settings;
    if (rows.length === 0) {
      // Initialize default settings
      const initialToken = `MG-ATT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const attendanceUrl = `${FRONTEND_APP_URL}/attendance?token=${initialToken}`;
      const qrImageData = await QRCode.toDataURL(attendanceUrl, {
        width: 600,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',
      });

      await pool.query(`
        INSERT INTO attendance_qr_settings (
          id, qr_token, qr_image_data, geofence_latitude, geofence_longitude, geofence_radius_meters, is_geofence_enabled, location_name
        ) VALUES (1, ?, ?, 22.57264500, 88.36389200, 100, 1, 'MuscleGreed Main Facility')
      `, [initialToken, qrImageData]);

      const [newRows] = await pool.query('SELECT * FROM attendance_qr_settings WHERE id = 1');
      settings = newRows[0];
    } else {
      settings = rows[0];
    }

    return res.status(200).json({
      success: true,
      data: {
        qrToken: settings.qr_token,
        qrImageData: settings.qr_image_data,
        attendanceUrl: `${FRONTEND_APP_URL}/attendance?token=${settings.qr_token}`,
        geofenceLatitude: settings.geofence_latitude,
        geofenceLongitude: settings.geofence_longitude,
        geofenceRadiusMeters: settings.geofence_radius_meters,
        isGeofenceEnabled: Boolean(settings.is_geofence_enabled),
        locationName: settings.location_name,
        updatedAt: settings.updated_at,
      },
    });
  } catch (error) {
    console.error('Error fetching attendance QR settings:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve attendance QR settings.' });
  }
}

// 2. POST Regenerate & Invalidate QR Scanner
async function regenerateQR(req, res) {
  try {
    const newToken = `MG-ATT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const attendanceUrl = `${FRONTEND_APP_URL}/attendance?token=${newToken}`;
    const qrImageData = await QRCode.toDataURL(attendanceUrl, {
      width: 600,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    });

    await pool.query(`
      UPDATE attendance_qr_settings
      SET qr_token = ?, qr_image_data = ?, updated_at = NOW()
      WHERE id = 1
    `, [newToken, qrImageData]);

    return res.status(200).json({
      success: true,
      message: 'New attendance scanner QR code generated. All previous scanners and posters have been invalidated immediately.',
      data: {
        qrToken: newToken,
        qrImageData,
        attendanceUrl,
      },
    });
  } catch (error) {
    console.error('Error regenerating QR scanner:', error);
    return res.status(500).json({ success: false, message: 'Failed to regenerate attendance QR.' });
  }
}

// 3. PUT Configure Geofencing
async function updateGeofence(req, res) {
  try {
    const { latitude, longitude, radiusMeters, isEnabled, locationName } = req.body;

    if (latitude === undefined || longitude === undefined || !radiusMeters) {
      return res.status(400).json({
        success: false,
        message: 'Latitude, longitude, and radius (in meters) are required.',
      });
    }

    const radius = Math.max(10, parseInt(radiusMeters, 10) || 100);
    const enabled = isEnabled === undefined ? true : Boolean(isEnabled);
    const locName = locationName ? locationName.trim() : 'MuscleGreed Main Facility';

    await pool.query(`
      UPDATE attendance_qr_settings
      SET 
        geofence_latitude = ?,
        geofence_longitude = ?,
        geofence_radius_meters = ?,
        is_geofence_enabled = ?,
        location_name = ?,
        updated_at = NOW()
      WHERE id = 1
    `, [latitude, longitude, radius, enabled ? 1 : 0, locName]);

    return res.status(200).json({
      success: true,
      message: 'Gym geofence settings updated successfully.',
      data: {
        geofenceLatitude: latitude,
        geofenceLongitude: longitude,
        geofenceRadiusMeters: radius,
        isGeofenceEnabled: enabled,
        locationName: locName,
      },
    });
  } catch (error) {
    console.error('Error updating geofence:', error);
    return res.status(500).json({ success: false, message: 'Failed to update geofence configuration.' });
  }
}

// 4. POST Mark Attendance (Scan QR Punch IN / OUT for Members & Staff)
async function markAttendance(req, res) {
  try {
    const { token, latitude, longitude, email, password, phone } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Attendance QR token is required.' });
    }

    // 1. Identify User (Athlete Member or Staff)
    let memberUser = null;
    let staffUser = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      const authToken = req.headers.authorization.split(' ')[1];
      // Try Member token first
      try {
        const decodedMember = jwt.verify(authToken, JWT_SECRET);
        if (decodedMember && decodedMember.id) {
          memberUser = decodedMember;
        }
      } catch (e) {}

      // If not a member, try Staff token
      if (!memberUser) {
        try {
          const decodedAdmin = jwt.verify(authToken, process.env.JWT_ACCESS_SECRET);
          if (decodedAdmin && decodedAdmin.id) {
            staffUser = decodedAdmin;
          }
        } catch (e) {}
      }
    }

    // If still not authenticated, check credentials in body
    if (!memberUser && !staffUser) {
      // Check phone/password for members
      if (phone && password) {
        const cleanPhone = phone.trim().replace(/\s+/g, '');
        const [users] = await pool.query('SELECT * FROM users WHERE phone = ?', [cleanPhone]);
        if (users.length > 0) {
          const match = await bcrypt.compare(password, users[0].password);
          if (match) {
            memberUser = {
              id: users[0].id,
              name: users[0].name,
              phone: users[0].phone,
              status: users[0].status,
            };
          }
        }
      }

      // Check email/password for staff
      if (!memberUser && email && password) {
        const [admins] = await pool.query('SELECT * FROM admins WHERE email = ?', [email.trim()]);
        if (admins.length > 0) {
          const match = await bcrypt.compare(password, admins[0].password);
          if (match) {
            staffUser = {
              id: admins[0].id,
              name: admins[0].name,
              email: admins[0].email,
              role: admins[0].role,
            };
          }
        }
      }
    }

    if (!memberUser && !staffUser) {
      return res.status(401).json({
        success: false,
        requiresLogin: true,
        message: 'Authentication required. Please sign in to mark attendance.',
      });
    }

    // If Member: check banned status
    if (memberUser && memberUser.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: 'Your athlete account has been suspended by gym management.',
      });
    }

    // If Staff: verify staff role
    if (staffUser) {
      const allowedRoles = ['trainer', 'receptionist', 'admin', 'superadmin'];
      if (!allowedRoles.includes(staffUser.role?.toLowerCase())) {
        return res.status(403).json({
          success: false,
          message: `Role "${staffUser.role}" is not authorized for staff attendance tracking.`,
        });
      }
    }

    // 2. Validate QR Token against active DB settings
    const [settingsRows] = await pool.query('SELECT * FROM attendance_qr_settings WHERE id = 1');
    if (settingsRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Attendance system is not initialized.' });
    }

    const settings = settingsRows[0];
    if (token !== settings.qr_token) {
      return res.status(400).json({
        success: false,
        invalidToken: true,
        message: 'Invalid or invalidated attendance scanner QR code. Please scan the official gym poster.',
      });
    }

    // 3. Geofencing check
    let distanceMeters = null;
    if (settings.is_geofence_enabled && settings.geofence_latitude && settings.geofence_longitude) {
      if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
        return res.status(400).json({
          success: false,
          requiresLocation: true,
          message: 'Location (GPS) permission is required to verify that you are on gym premises. Please enable location on your device.',
        });
      }

      distanceMeters = getHaversineDistance(
        parseFloat(settings.geofence_latitude),
        parseFloat(settings.geofence_longitude),
        parseFloat(latitude),
        parseFloat(longitude)
      );

      const maxRadius = settings.geofence_radius_meters || 100;
      if (distanceMeters > maxRadius) {
        return res.status(403).json({
          success: false,
          geofenceViolation: true,
          distanceMeters: Math.round(distanceMeters),
          maxRadius,
          message: `Geofence check failed: You are ${Math.round(distanceMeters)}m away from ${settings.location_name || 'the gym premises'}. Maximum allowed radius is ${maxRadius}m. Please mark attendance inside the gym.`,
        });
      }
    }

    // ================= BRANCH A: MEMBER ATTENDANCE PUNCH =================
    if (memberUser) {
      // Find active membership pass if any
      const [mRows] = await pool.query(
        "SELECT membership_id, plan_title, status FROM memberships WHERE user_id = ? ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1",
        [memberUser.id]
      );
      const membershipId = mRows.length > 0 ? mRows[0].membership_id : null;

      // Determine Punch Type (IN or OUT toggle)
      const [lastPunchRows] = await pool.query(`
        SELECT * FROM member_attendance_logs
        WHERE user_id = ? AND date = CURDATE()
        ORDER BY punch_time DESC
        LIMIT 1
      `, [memberUser.id]);

      let punchType = (lastPunchRows.length > 0 && lastPunchRows[0].punch_type === 'IN') ? 'OUT' : 'IN';

      // Insert Attendance Punch
      await pool.query(`
        INSERT INTO member_attendance_logs (
          user_id, member_name, member_phone, membership_id, punch_type, punch_time, date, latitude, longitude, distance_meters, qr_token
        ) VALUES (?, ?, ?, ?, ?, NOW(), CURDATE(), ?, ?, ?, ?)
      `, [
        memberUser.id,
        memberUser.name || 'Member Athlete',
        memberUser.phone || '',
        membershipId,
        punchType,
        latitude || null,
        longitude || null,
        distanceMeters !== null ? Math.round(distanceMeters) : null,
        token,
      ]);

      // Fetch all punches for today to compute total workout hours
      const [allTodayPunches] = await pool.query(`
        SELECT 
          id, punch_type, DATE_FORMAT(punch_time, '%h:%i %p') as time_formatted,
          punch_time, distance_meters
        FROM member_attendance_logs
        WHERE user_id = ? AND date = CURDATE()
        ORDER BY punch_time ASC
      `, [memberUser.id]);

      const { formatted: totalHoursFormatted } = calculateWorkingHours(allTodayPunches);

      return res.status(200).json({
        success: true,
        isMember: true,
        punchType,
        punchTimeFormatted: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        memberName: memberUser.name,
        staffName: memberUser.name,
        membershipId,
        distanceMeters: distanceMeters !== null ? Math.round(distanceMeters) : null,
        totalWorkingHoursToday: totalHoursFormatted,
        todayPunches: allTodayPunches,
        message: `Successfully recorded check-${punchType.toLowerCase()}! Workout session duration today: ${totalHoursFormatted}.`,
      });
    }

    // ================= BRANCH B: STAFF ATTENDANCE PUNCH =================
    const [lastPunchRows] = await pool.query(`
      SELECT * FROM staff_attendance_logs
      WHERE staff_id = ? AND date = CURDATE()
      ORDER BY punch_time DESC
      LIMIT 1
    `, [staffUser.id]);

    let punchType = (lastPunchRows.length > 0 && lastPunchRows[0].punch_type === 'IN') ? 'OUT' : 'IN';

    await pool.query(`
      INSERT INTO staff_attendance_logs (
        staff_id, staff_name, staff_role, punch_type, punch_time, date, latitude, longitude, distance_meters, qr_token
      ) VALUES (?, ?, ?, ?, NOW(), CURDATE(), ?, ?, ?, ?)
    `, [
      staffUser.id,
      staffUser.name || 'Staff Member',
      staffUser.role || 'staff',
      punchType,
      latitude || null,
      longitude || null,
      distanceMeters !== null ? Math.round(distanceMeters) : null,
      token,
    ]);

    const [allTodayPunches] = await pool.query(`
      SELECT 
        id, punch_type, DATE_FORMAT(punch_time, '%h:%i %p') as time_formatted,
        punch_time, distance_meters
      FROM staff_attendance_logs
      WHERE staff_id = ? AND date = CURDATE()
      ORDER BY punch_time ASC
    `, [staffUser.id]);

    const { formatted: totalHoursFormatted } = calculateWorkingHours(allTodayPunches);

    return res.status(200).json({
      success: true,
      isStaff: true,
      punchType,
      punchTimeFormatted: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      staffName: staffUser.name,
      staffRole: staffUser.role,
      distanceMeters: distanceMeters !== null ? Math.round(distanceMeters) : null,
      totalWorkingHoursToday: totalHoursFormatted,
      todayPunches: allTodayPunches,
      message: `Successfully punched ${punchType}! Total working hours today: ${totalHoursFormatted}.`,
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    return res.status(500).json({ success: false, message: 'Failed to record attendance.' });
  }
}

// 5. GET Staff Attendance Logs & Daily Summary (Protected)
async function getAttendanceLogs(req, res) {
  try {
    const { date, staffId } = req.query;

    // Get active date (either provided date or MySQL CURDATE())
    let targetDate = date ? date.trim() : null;
    if (!targetDate) {
      const [todayRow] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') as today");
      targetDate = todayRow[0].today;
    }

    // Fetch all active staff
    const [staffList] = await pool.query(`
      SELECT id, name, email, role, phone
      FROM admins
      ORDER BY role ASC, name ASC
    `);

    // Fetch all punches for target date
    const [punches] = await pool.query(`
      SELECT 
        id, staff_id, staff_name, staff_role, punch_type,
        punch_time, DATE_FORMAT(punch_time, '%h:%i %p') as time_formatted,
        distance_meters
      FROM staff_attendance_logs
      WHERE date = ?
      ORDER BY punch_time ASC
    `, [targetDate]);

    const punchesByStaff = {};
    for (const p of punches) {
      if (!punchesByStaff[p.staff_id]) punchesByStaff[p.staff_id] = [];
      punchesByStaff[p.staff_id].push(p);
    }

    const report = staffList.map((staff) => {
      const staffPunches = punchesByStaff[staff.id] || [];
      const { formatted, isCurrentlyIn } = calculateWorkingHours(staffPunches);

      let status = 'ABSENT';
      if (staffPunches.length > 0) {
        status = isCurrentlyIn ? 'CHECKED IN' : 'CHECKED OUT';
      }

      const firstIn = staffPunches.find((p) => p.punch_type === 'IN');
      const lastOut = [...staffPunches].reverse().find((p) => p.punch_type === 'OUT');

      return {
        staffId: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        phone: staff.phone || 'N/A',
        status,
        isCurrentlyIn,
        firstInTime: firstIn ? firstIn.time_formatted : 'N/A',
        lastOutTime: lastOut ? lastOut.time_formatted : 'N/A',
        totalWorkingHours: formatted,
        totalPunchesCount: staffPunches.length,
        punches: staffPunches,
      };
    });

    return res.status(200).json({
      success: true,
      date: targetDate,
      data: report,
    });
  } catch (error) {
    console.error('Error fetching attendance logs:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve attendance logs.' });
  }
}

// 6. GET Personal Attendance Status & Logs (For Members & Staff)
async function getMyAttendanceStatus(req, res) {
  try {
    let memberUser = null;
    let staffUser = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      const authToken = req.headers.authorization.split(' ')[1];
      try {
        const decodedMember = jwt.verify(authToken, JWT_SECRET);
        if (decodedMember && decodedMember.id) {
          memberUser = decodedMember;
        }
      } catch (e) {}

      if (!memberUser) {
        try {
          const decodedAdmin = jwt.verify(authToken, process.env.JWT_ACCESS_SECRET);
          if (decodedAdmin && decodedAdmin.id) {
            staffUser = decodedAdmin;
          }
        } catch (e) {}
      }
    }

    if (!memberUser && !staffUser) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { date } = req.query;
    let targetDate = date ? date.trim() : null;
    let dateCondition = targetDate ? 'date = ?' : 'date = CURDATE()';

    // Member attendance logs
    if (memberUser) {
      const params = targetDate ? [memberUser.id, targetDate] : [memberUser.id];
      const [todayPunches] = await pool.query(`
        SELECT 
          id, punch_type, punch_time, DATE_FORMAT(punch_time, '%h:%i %p') as time_formatted,
          DATE_FORMAT(date, '%Y-%m-%d') as date_formatted,
          distance_meters
        FROM member_attendance_logs
        WHERE user_id = ? AND ${dateCondition}
        ORDER BY punch_time ASC
      `, params);

      const { formatted, isCurrentlyIn } = calculateWorkingHours(todayPunches);

      let status = 'NOT CHECKED IN';
      if (todayPunches.length > 0) {
        status = isCurrentlyIn ? 'CHECKED IN' : 'CHECKED OUT';
      }

      const [recentLogs] = await pool.query(`
        SELECT 
          id, punch_type, punch_time, 
          DATE_FORMAT(punch_time, '%h:%i %p') as time_formatted,
          DATE_FORMAT(date, '%Y-%m-%d') as date_formatted,
          distance_meters
        FROM member_attendance_logs
        WHERE user_id = ?
        ORDER BY punch_time DESC
        LIMIT 30
      `, [memberUser.id]);

      return res.status(200).json({
        success: true,
        isMember: true,
        data: {
          status,
          isCurrentlyIn,
          totalWorkingHoursToday: formatted,
          todayPunches,
          recentLogs,
          member: {
            id: memberUser.id,
            name: memberUser.name,
            phone: memberUser.phone,
          },
        },
      });
    }

    // Staff attendance logs
    const params = targetDate ? [staffUser.id, targetDate] : [staffUser.id];
    const [todayPunches] = await pool.query(`
      SELECT 
        id, punch_type, punch_time, DATE_FORMAT(punch_time, '%h:%i %p') as time_formatted,
        DATE_FORMAT(date, '%Y-%m-%d') as date_formatted,
        distance_meters
      FROM staff_attendance_logs
      WHERE staff_id = ? AND ${dateCondition}
      ORDER BY punch_time ASC
    `, params);

    const { formatted, isCurrentlyIn } = calculateWorkingHours(todayPunches);

    let status = 'NOT PUNCHED';
    if (todayPunches.length > 0) {
      status = isCurrentlyIn ? 'CHECKED IN' : 'CHECKED OUT';
    }

    const [recentLogs] = await pool.query(`
      SELECT 
        id, punch_type, punch_time, 
        DATE_FORMAT(punch_time, '%h:%i %p') as time_formatted,
        DATE_FORMAT(date, '%Y-%m-%d') as date_formatted,
        distance_meters
      FROM staff_attendance_logs
      WHERE staff_id = ?
      ORDER BY punch_time DESC
      LIMIT 30
    `, [staffUser.id]);

    return res.status(200).json({
      success: true,
      isStaff: true,
      data: {
        status,
        isCurrentlyIn,
        totalWorkingHoursToday: formatted,
        todayPunches,
        recentLogs,
        staff: {
          id: staffUser.id,
          name: staffUser.name,
          email: staffUser.email,
          role: staffUser.role,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching attendance status:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch personal attendance.' });
  }
}

// 7. GET Member Attendance Sheet for Admin Dashboard
async function getMemberAttendanceSheet(req, res) {
  try {
    const { date, search } = req.query;

    let targetDate = date ? date.trim() : null;
    if (!targetDate) {
      const [todayRow] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') as today");
      targetDate = todayRow[0].today;
    }

    // Query member_attendance_logs for targetDate
    const [punches] = await pool.query(`
      SELECT 
        mal.id,
        mal.user_id,
        mal.member_name,
        mal.member_phone,
        mal.membership_id,
        mal.punch_type,
        mal.punch_time,
        DATE_FORMAT(mal.punch_time, '%h:%i %p') as time_formatted,
        DATE_FORMAT(mal.date, '%Y-%m-%d') as date_formatted,
        mal.distance_meters,
        m.plan_title,
        m.service_title,
        m.status as membership_status
      FROM member_attendance_logs mal
      LEFT JOIN memberships m ON m.membership_id = mal.membership_id COLLATE utf8mb4_unicode_ci
      WHERE mal.date = ?
      ORDER BY mal.punch_time ASC
    `, [targetDate]);

    // Group punches by user_id
    const punchesByUser = {};
    for (const p of punches) {
      if (!punchesByUser[p.user_id]) punchesByUser[p.user_id] = [];
      punchesByUser[p.user_id].push(p);
    }

    // Transform into attendance records
    const attendanceRecords = Object.keys(punchesByUser).map((userId) => {
      const userPunches = punchesByUser[userId];
      const { formatted, isCurrentlyIn } = calculateWorkingHours(userPunches);

      const firstPunch = userPunches[0];
      const firstIn = userPunches.find((p) => p.punch_type === 'IN');
      const lastOut = [...userPunches].reverse().find((p) => p.punch_type === 'OUT');
      const latestPunch = userPunches[userPunches.length - 1];

      return {
        userId: Number(userId),
        name: firstPunch.member_name,
        phone: firstPunch.member_phone,
        membershipId: firstPunch.membership_id || 'N/A',
        planTitle: firstPunch.plan_title || 'General Athlete',
        serviceTitle: firstPunch.service_title || 'Gym Facility',
        membershipStatus: firstPunch.membership_status || 'active',
        status: isCurrentlyIn ? 'CHECKED IN' : 'CHECKED OUT',
        isCurrentlyIn,
        firstInTime: firstIn ? firstIn.time_formatted : 'N/A',
        lastOutTime: lastOut && !isCurrentlyIn ? lastOut.time_formatted : (isCurrentlyIn ? 'Active Now' : 'N/A'),
        totalWorkoutDuration: formatted,
        totalPunchesCount: userPunches.length,
        distanceMeters: latestPunch?.distance_meters,
        punches: userPunches,
      };
    });

    const currentlyInCount = attendanceRecords.filter((r) => r.isCurrentlyIn).length;
    const completedCount = attendanceRecords.filter((r) => !r.isCurrentlyIn).length;

    return res.status(200).json({
      success: true,
      date: targetDate,
      totalCount: attendanceRecords.length,
      currentlyInCount,
      completedCount,
      data: attendanceRecords,
    });
  } catch (error) {
    console.error('Error fetching member attendance sheet:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve member attendance sheet.' });
  }
}

module.exports = {
  getQRSettings,
  regenerateQR,
  updateGeofence,
  markAttendance,
  getAttendanceLogs,
  getMyAttendanceStatus,
  getMemberAttendanceSheet,
};
