const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'sti-cashier-secret-key-2024';

// Mock auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Mock pool
const pool = {};

// Try to load API routes
console.log('[TEST] Starting to load API routes...');
try {
  const setupApiRoutes = require('./routes/api');
  console.log('[TEST] setupApiRoutes type:', typeof setupApiRoutes);
  setupApiRoutes(app, pool, authenticateToken);
  console.log('[TEST] API routes loaded successfully');
} catch (err) {
  console.error('[TEST-ERROR] Failed to load API routes:', err.message);
  console.error(err.stack);
}

// List registered routes
console.log('[TEST] Listing all routes...');
app._router.stack.forEach(middleware => {
  if (middleware.route) {
    console.log(`  ${Object.keys(middleware.route.methods).join(',').toUpperCase()} ${middleware.route.path}`);
  } else if (middleware.name === 'router') {
    middleware.handle.stack.forEach(handler => {
      if (handler.route) {
        console.log(`  ${Object.keys(handler.route.methods).join(',').toUpperCase()} ${handler.route.path}`);
      }
    });
  }
});

// Start server
app.listen(6000, () => {
  console.log('[TEST] Server listening on port 6000');
});
