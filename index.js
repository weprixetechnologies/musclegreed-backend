require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const adminAuthRoutes = require('./routes/adminAuth');
const homepageRoutes = require('./routes/homepageRoutes');
const servicesRoutes = require('./routes/servicesRoutes');
const subscriptionsRoutes = require('./routes/subscriptionsRoutes');
const memberRoutes = require('./routes/memberRoutes');
const membershipRoutes = require('./routes/membershipRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const requestLogger = require('./middleware/requestLogger');
const initDb = require('./models/initDb');
const { seedDefaultStaff } = require('./controllers/staffController');

const app = express();
const PORT = process.env.PORT || 5672;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(requestLogger);

// Static file serving for uploads fallback
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// CORS configuration for admin frontend and gymweb frontend
const allowedOrigins = [
  process.env.ADMIN_FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3001',
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // allow local gymweb origins
      }
    },
    credentials: true,
  })
);

// Routes
app.use('/api/admin', adminAuthRoutes);
app.use('/api', homepageRoutes);
app.use('/api', servicesRoutes);
app.use('/api', subscriptionsRoutes);
app.use('/api', memberRoutes);
app.use('/api', membershipRoutes);
app.use('/api', attendanceRoutes);

// Run DB setup & seed staff on server boot
initDb()
  .then(() => seedDefaultStaff())
  .catch(err => console.error('Error on initDb/seedDefaultStaff in index.js:', err));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'musclegreed-backend' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
