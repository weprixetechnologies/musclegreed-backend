const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// 1. GET All Staff Members
async function getStaffList(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, email, role, phone, status, DATE_FORMAT(created_at, '%Y-%m-%d') as joined_date
      FROM admins
      ORDER BY role ASC, name ASC
    `);

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error('Error in getStaffList:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve staff list.' });
  }
}

// 2. POST Create New Staff Member
async function createStaffMember(req, res) {
  try {
    const { name, email, password, role, phone } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and role are required.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanRole = role.trim().toLowerCase();

    if (!['superadmin', 'admin', 'receptionist', 'trainer'].includes(cleanRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Allowed roles are: trainer, receptionist, admin, superadmin.',
      });
    }

    // Check email uniqueness
    const [existing] = await pool.query('SELECT id FROM admins WHERE email = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `A staff account with email "${cleanEmail}" already exists.`,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(`
      INSERT INTO admins (name, email, password, role, phone, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `, [name.trim(), cleanEmail, hashedPassword, cleanRole, phone ? phone.trim() : null]);

    return res.status(201).json({
      success: true,
      message: `Staff member "${name}" registered successfully as ${cleanRole}.`,
      data: {
        id: result.insertId,
        name: name.trim(),
        email: cleanEmail,
        role: cleanRole,
        phone: phone ? phone.trim() : null,
      },
    });
  } catch (error) {
    console.error('Error creating staff member:', error);
    return res.status(500).json({ success: false, message: 'Failed to create staff member.' });
  }
}

// 3. PUT Update Staff Member
async function updateStaffMember(req, res) {
  try {
    const { id } = req.params;
    const { name, email, password, role, phone, status } = req.body;

    const [staff] = await pool.query('SELECT * FROM admins WHERE id = ?', [id]);
    if (staff.length === 0) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }

    const updates = [];
    const params = [];

    if (name) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const [existing] = await pool.query('SELECT id FROM admins WHERE email = ? AND id != ?', [cleanEmail, id]);
      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: `Email "${cleanEmail}" is already in use.` });
      }
      updates.push('email = ?');
      params.push(cleanEmail);
    }

    if (role) {
      const cleanRole = role.trim().toLowerCase();
      if (!['superadmin', 'admin', 'receptionist', 'trainer'].includes(cleanRole)) {
        return res.status(400).json({ success: false, message: 'Invalid role.' });
      }
      updates.push('role = ?');
      params.push(cleanRole);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone ? phone.trim() : null);
    }

    if (status) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Status must be active or inactive.' });
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (password && password.trim().length >= 6) {
      const hashedPassword = await bcrypt.hash(password.trim(), 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }

    if (updates.length > 0) {
      params.push(id);
      await pool.query(`UPDATE admins SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return res.status(200).json({
      success: true,
      message: 'Staff member updated successfully.',
    });
  } catch (error) {
    console.error('Error updating staff member:', error);
    return res.status(500).json({ success: false, message: 'Failed to update staff member.' });
  }
}

// 4. DELETE Staff Member
async function deleteStaffMember(req, res) {
  try {
    const { id } = req.params;

    if (parseInt(id, 10) === req.admin?.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own active administrator account.' });
    }

    await pool.query('DELETE FROM admins WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Staff member deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting staff member:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete staff member.' });
  }
}

// 5. Seed default staff accounts (Trainer, Receptionist) if missing
async function seedDefaultStaff() {
  try {
    // 1. Receptionist
    const [rec] = await pool.query('SELECT id FROM admins WHERE email = ?', ['reception@musclegreed.com']);
    if (rec.length === 0) {
      const hashedPassword = await bcrypt.hash('Reception@123', 10);
      await pool.query(`
        INSERT INTO admins (name, email, password, role, phone, status)
        VALUES ('Sarah Jenkins', 'reception@musclegreed.com', ?, 'receptionist', '+91 98765 00001', 'active')
      `, [hashedPassword]);
      console.log('Seeded default receptionist: reception@musclegreed.com / Reception@123');
    }

    // 2. Trainer
    const [tr] = await pool.query('SELECT id FROM admins WHERE email = ?', ['trainer@musclegreed.com']);
    if (tr.length === 0) {
      const hashedPassword = await bcrypt.hash('Trainer@123', 10);
      await pool.query(`
        INSERT INTO admins (name, email, password, role, phone, status)
        VALUES ('Marcus Blade', 'trainer@musclegreed.com', ?, 'trainer', '+91 98765 00002', 'active')
      `, [hashedPassword]);
      console.log('Seeded default trainer: trainer@musclegreed.com / Trainer@123');
    }
  } catch (err) {
    console.error('Error seeding default staff:', err);
  }
}

module.exports = {
  getStaffList,
  createStaffMember,
  updateStaffMember,
  deleteStaffMember,
  seedDefaultStaff,
};
