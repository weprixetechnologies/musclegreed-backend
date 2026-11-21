const pool = require('../config/db');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const FRONTEND_APP_URL = process.env.FRONTEND_APP_URL || 'http://localhost:3000';

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

// 4. POST Mark Attendance (Scan QR Punch IN / OUT)
async function markAttendance(req, res) {
  try {
    const { token, latitude, longitude, email, password } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Attendance QR token is required.' });
    }

    // 1. Authenticate Staff Member (either via token header or email/password)
    let staffUser = null;

    if (req.admin) {
      staffUser = req.admin;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const authToken = req.headers.authorization.split(' ')[1];
        staffUser = jwt.verify(authToken, process.env.JWT_ACCESS_SECRET);
      } catch (e) {
        // Token invalid, check body credentials
      }
    }

    if (!staffUser && email && password) {
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

    if (!staffUser) {
      return res.status(401).json({
        success: false,
        requiresLogin: true,
        message: 'Staff authentication required. Please log in with your Trainer / Receptionist account to mark attendance.',
      });
    }

    // Verify role
    const allowedRoles = ['trainer', 'receptionist', 'admin', 'superadmin'];
    if (!allowedRoles.includes(staffUser.role?.toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: `Role "${staffUser.role}" is not authorized for staff attendance tracking.`,
      });
    }

    // 2. Validate QR Token against active DB scanner
    const [settingsRows] = await pool.query('SELECT * FROM attendance_qr_settings WHERE id = 1');
    if (settingsRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Attendance system is not initialized.' });
    }

    const settings = settingsRows[0];
    if (token !== settings.qr_token) {
      return res.status(400).json({
        success: false,
        invalidToken: true,
        message: 'Invalid or invalidated attendance scanner QR code. The gym admin may have regenerated the poster. Please scan the latest official QR poster.',
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

    // 4. Determine Punch Type (IN or OUT toggle)
    const [lastPunchRows] = await pool.query(`
      SELECT * FROM staff_attendance_logs
      WHERE staff_id = ? AND date = CURDATE()
      ORDER BY punch_time DESC
      LIMIT 1
    `, [staffUser.id]);

    let punchType = 'IN';
    if (lastPunchRows.length > 0 && lastPunchRows[0].punch_type === 'IN') {
      punchType = 'OUT';
    } else {
      punchType = 'IN';
    }

    // 5. Insert Attendance Punch
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

    // 6. Fetch all punches for today to compute total hours
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

// 6. GET My Attendance Status (For Current Staff Member)
async function getMyAttendanceStatus(req, res) {
  try {
    const staffId = req.admin?.id;
    if (!staffId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const [todayPunches] = await pool.query(`
      SELECT 
        id, punch_type, punch_time, DATE_FORMAT(punch_time, '%h:%i %p') as time_formatted,
        distance_meters
      FROM staff_attendance_logs
      WHERE staff_id = ? AND date = CURDATE()
      ORDER BY punch_time ASC
    `, [staffId]);

    const { formatted, isCurrentlyIn } = calculateWorkingHours(todayPunches);

    let status = 'NOT PUNCHED';
    if (todayPunches.length > 0) {
      status = isCurrentlyIn ? 'CHECKED IN' : 'CHECKED OUT';
    }

    return res.status(200).json({
      success: true,
      data: {
        status,
        isCurrentlyIn,
        totalWorkingHoursToday: formatted,
        todayPunches,
      },
    });
  } catch (error) {
    console.error('Error fetching my attendance status:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch personal attendance.' });
  }
}

module.exports = {
  getQRSettings,
  regenerateQR,
  updateGeofence,
  markAttendance,
  getAttendanceLogs,
  getMyAttendanceStatus,
};
