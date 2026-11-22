const pool = require('../config/db');

async function initDb() {
  try {
    console.log('Initializing database tables for users, memberships, and subscription orders...');

    // 1. Users table (Members)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        status ENUM('active', 'banned') DEFAULT 'active',
        ban_reason TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Memberships table
    // A single user can hold multiple memberships.
    // Expired memberships become 'paused' (never canceled).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS memberships (
        id INT AUTO_INCREMENT PRIMARY KEY,
        membership_id VARCHAR(50) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        service_id VARCHAR(100) NOT NULL,
        service_title VARCHAR(200) NOT NULL,
        plan_id VARCHAR(100) NOT NULL,
        plan_title VARCHAR(200) NOT NULL,
        interval_type ENUM('WEEKLY', 'MONTHLY', 'YEARLY') NOT NULL,
        price VARCHAR(50) NOT NULL,
        status ENUM('pending', 'active', 'paused', 'banned') DEFAULT 'pending',
        start_date DATE NULL,
        end_date DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_membership_id (membership_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Subscription Orders / Payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscription_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(50) UNIQUE NOT NULL,
        membership_id VARCHAR(50) NOT NULL,
        user_id INT NOT NULL,
        type ENUM('new_subscription', 'renewal', 'extension') NOT NULL,
        service_id VARCHAR(100) NOT NULL,
        service_title VARCHAR(200) NOT NULL,
        plan_id VARCHAR(100) NOT NULL,
        plan_title VARCHAR(200) NOT NULL,
        interval_type ENUM('WEEKLY', 'MONTHLY', 'YEARLY') NOT NULL,
        amount VARCHAR(50) NOT NULL,
        utr_number VARCHAR(100) NOT NULL,
        screenshot_url VARCHAR(1000) NOT NULL,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        admin_remarks TEXT NULL,
        reviewed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_id (order_id),
        INDEX idx_order_membership_id (membership_id),
        INDEX idx_order_user_id (user_id),
        INDEX idx_order_status (status),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. Payment Settings (Scanner QR code, UPI details)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_settings (
        id INT PRIMARY KEY,
        qr_image_url VARCHAR(1000) NULL,
        upi_id VARCHAR(100) DEFAULT 'musclegreed@upi',
        merchant_name VARCHAR(150) DEFAULT 'MuscleGreed Gym & Fitness',
        instructions TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Seed default payment settings if not exists
    const [existingSettings] = await pool.query('SELECT id FROM payment_settings WHERE id = 1');
    if (existingSettings.length === 0) {
      await pool.query(`
        INSERT INTO payment_settings (id, qr_image_url, upi_id, merchant_name, instructions)
        VALUES (
          1,
          'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=musclegreed@upi%26pn=MuscleGreed%20Gym%26cu=INR',
          'musclegreed@upi',
          'MuscleGreed Elite Fitness Club',
          'Scan using Google Pay, PhonePe, Paytm or any UPI app. After payment, take a screenshot and enter the 12-digit UTR / Reference number.'
        )
      `);
      console.log('Seeded default payment settings.');
    }

    // 5. Modify admins role enum to include receptionist and trainer
    try {
      await pool.query(`
        ALTER TABLE admins MODIFY COLUMN role ENUM('superadmin', 'admin', 'receptionist', 'trainer') DEFAULT 'trainer'
      `);
    } catch (e) {
      // already modified
    }

    // 6. Attendance QR Settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_qr_settings (
        id INT PRIMARY KEY,
        qr_token VARCHAR(100) NOT NULL,
        qr_image_data LONGTEXT NULL,
        geofence_latitude DECIMAL(10, 8) NULL,
        geofence_longitude DECIMAL(11, 8) NULL,
        geofence_radius_meters INT DEFAULT 100,
        is_geofence_enabled BOOLEAN DEFAULT TRUE,
        location_name VARCHAR(255) DEFAULT 'MuscleGreed Main Facility',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 7. Staff Attendance Logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_attendance_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        staff_name VARCHAR(100) NOT NULL,
        staff_role VARCHAR(50) NOT NULL,
        punch_type ENUM('IN', 'OUT') NOT NULL,
        punch_time DATETIME NOT NULL,
        date DATE NOT NULL,
        latitude DECIMAL(10, 8) NULL,
        longitude DECIMAL(11, 8) NULL,
        distance_meters FLOAT NULL,
        qr_token VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_staff_date (staff_id, date),
        INDEX idx_date (date),
        FOREIGN KEY (staff_id) REFERENCES admins(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8. Member Attendance Logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS member_attendance_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        member_name VARCHAR(100) NOT NULL,
        member_phone VARCHAR(50) NOT NULL,
        membership_id VARCHAR(50) NULL,
        punch_type ENUM('IN', 'OUT') NOT NULL,
        punch_time DATETIME NOT NULL,
        date DATE NOT NULL,
        latitude DECIMAL(10, 8) NULL,
        longitude DECIMAL(11, 8) NULL,
        distance_meters FLOAT NULL,
        qr_token VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_member_date (user_id, date),
        INDEX idx_date (date),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure collations match across all existing tables
    await pool.query(`
      ALTER TABLE member_attendance_logs 
      CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `).catch(() => {});

    console.log('Database initialization for subscription flow & attendance finished successfully.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

module.exports = initDb;
