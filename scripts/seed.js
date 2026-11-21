require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function seed() {
  let connection;
  try {
    console.log('Connecting to MySQL via mysql2...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'rseditz@222',
    });

    console.log('Creating database if not exists...');
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'musclegreed'}\`;`);
    await connection.query(`USE \`${process.env.DB_NAME || 'musclegreed'}\`;`);

    console.log('Creating admins table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('superadmin', 'admin') DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('Creating refresh_tokens table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL,
        token VARCHAR(500) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token(255)),
        FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const defaultEmail = 'admin@musclegreed.com';
    const [existing] = await connection.query('SELECT id FROM admins WHERE email = ?', [defaultEmail]);

    if (existing.length === 0) {
      console.log('Seeding default admin user...');
      const hashedPassword = await bcrypt.hash('Admin@123', 10);
      await connection.query(
        'INSERT INTO admins (name, email, password, role) VALUES (?, ?, ?, ?)',
        ['Super Admin', defaultEmail, hashedPassword, 'superadmin']
      );
      console.log(`Default admin created: ${defaultEmail} / Admin@123`);
    } else {
      console.log('Default admin already exists.');
    }

    console.log('Database initialization & seeding completed successfully.');
  } catch (error) {
    console.error('Error during database setup:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

seed();
