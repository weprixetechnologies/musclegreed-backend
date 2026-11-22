const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const {
  getQRSettings,
  regenerateQR,
  updateGeofence,
  markAttendance,
  getAttendanceLogs,
  getMyAttendanceStatus,
  getMemberAttendanceSheet,
} = require('../controllers/attendanceController');
const {
  getStaffList,
  createStaffMember,
  updateStaffMember,
  deleteStaffMember,
} = require('../controllers/staffController');

// Role checking helper middleware
function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role?.toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: This action requires one of the following roles: ${roles.join(', ')}`,
      });
    }
    next();
  };
}

// ================= PUBLIC / HYBRID ATTENDANCE ENDPOINTS =================
// 1. Get current static QR settings (Publicly read by scanner or frontend)
router.get('/attendance/qr-settings', getQRSettings);

// 2. Mark Attendance via QR scan (Supports JWT token OR email/password in body)
router.post('/attendance/punch', markAttendance);

// ================= PROTECTED STAFF ATTENDANCE ENDPOINTS =================
// 3. Current logged in member or staff member's punch status today
router.get('/attendance/my-status', getMyAttendanceStatus);

// 4. Member Attendance Sheet (Superadmin, Admin, Receptionist)
router.get('/attendance/members', adminAuth, getMemberAttendanceSheet);
router.get('/admin/attendance/members', adminAuth, getMemberAttendanceSheet);

// 5. Staff Attendance Logs Report (Superadmin, Admin, Receptionist)
router.get('/attendance/logs', adminAuth, requireRoles('superadmin', 'admin', 'receptionist'), getAttendanceLogs);

// ================= ADMIN / RECEPTIONIST QR & GEOFENCE CONTROLS =================
// 5. Invalidate & Regenerate QR Scanner (Admin, Superadmin, Receptionist)
router.post('/attendance/regenerate-qr', adminAuth, requireRoles('superadmin', 'admin', 'receptionist'), regenerateQR);

// 6. Configure Geofencing (Admin, Superadmin)
router.put('/attendance/geofence', adminAuth, requireRoles('superadmin', 'admin'), updateGeofence);

// ================= STAFF MANAGEMENT (Admin, Superadmin) =================
router.get('/admin/staff', adminAuth, requireRoles('superadmin', 'admin'), getStaffList);
router.post('/admin/staff', adminAuth, requireRoles('superadmin', 'admin'), createStaffMember);
router.put('/admin/staff/:id', adminAuth, requireRoles('superadmin', 'admin'), updateStaffMember);
router.delete('/admin/staff/:id', adminAuth, requireRoles('superadmin', 'admin'), deleteStaffMember);

module.exports = router;
