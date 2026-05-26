require('dotenv').config();
process.stderr.write('[MODULE-LOAD] server.js is loading...\n');
process.stdout.write('[DEBUG] server.js starting execution\n');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'sti-cashier-secret-key-2024';

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.options('*', cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// PostgreSQL Connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sti_cashier',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
};

console.log(`[DB] config host=${dbConfig.host} port=${dbConfig.port} database=${dbConfig.database} user=${dbConfig.user}`);

const pool = new Pool(dbConfig);

// Database initialization
const initDB = async () => {
  console.log('[DB] initializing connection...');
  const client = await pool.connect();
  try {
    // Create users table (for both students and admins)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'admin', 'cashier')),
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        balance DECIMAL(10, 2) DEFAULT 0.00,
        student_id VARCHAR(20) UNIQUE,
        archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure the archived flag exists for older schemas
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE');
    await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE');

    // Create products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        category VARCHAR(50),
        stock INT DEFAULT 0,
        image_url VARCHAR(255),
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        type VARCHAR(20) NOT NULL CHECK (type IN ('purchase', 'topup', 'refund')),
        amount DECIMAL(10, 2) NOT NULL,
        description TEXT,
        reference_number VARCHAR(50) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create cart_items table for temporary cart storage
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id) ON DELETE CASCADE,
        quantity INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    // Create students table for student profile information
    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        student_number VARCHAR(20) UNIQUE NOT NULL,
        first_name VARCHAR(50) NOT NULL,
        middle_name VARCHAR(50),
        last_name VARCHAR(50) NOT NULL,
        suffix VARCHAR(10),
        gender VARCHAR(20),
        birthdate DATE,
        contact_number VARCHAR(20),
        email VARCHAR(100),
        address TEXT,
        guardian_name VARCHAR(100),
        guardian_contact VARCHAR(20),
        year_level INT,
        course VARCHAR(50),
        enrollment_status VARCHAR(30) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create subjects table for curriculum data
    await client.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        subject_code VARCHAR(20) UNIQUE NOT NULL,
        subject_name VARCHAR(100) NOT NULL,
        description TEXT,
        units INT,
        course VARCHAR(50),
        year_level INT,
        semester VARCHAR(20),
        lecture_hours INT,
        lab_hours INT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create enrollments table for student subject enrollments
    await client.query(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id) ON DELETE CASCADE,
        subject_id INT REFERENCES subjects(id) ON DELETE CASCADE,
        enrollment_date DATE,
        semester VARCHAR(20),
        school_year VARCHAR(20),
        grade VARCHAR(10),
        status VARCHAR(30) DEFAULT 'enrolled',
        payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, subject_id, semester, school_year)
      )
    `);

    // Create fees table for fees and charges
    await client.query(`
      CREATE TABLE IF NOT EXISTS fees (
        id SERIAL PRIMARY KEY,
        fee_name VARCHAR(100) NOT NULL,
        description TEXT,
        amount DECIMAL(10, 2) NOT NULL,
        fee_type VARCHAR(50),
        category VARCHAR(50),
        school_year VARCHAR(20),
        semester VARCHAR(20),
        is_required BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create fee_items table for student fee assignments
    await client.query(`
      CREATE TABLE IF NOT EXISTS fee_items (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id) ON DELETE CASCADE,
        fee_id INT REFERENCES fees(id) ON DELETE CASCADE,
        enrollment_id INT REFERENCES enrollments(id) ON DELETE CASCADE,
        semester VARCHAR(20),
        school_year VARCHAR(20),
        amount DECIMAL(10, 2) NOT NULL,
        balance DECIMAL(10, 2) NOT NULL,
        due_date DATE,
        discount DECIMAL(10, 2) DEFAULT 0.00,
        waiver DECIMAL(10, 2) DEFAULT 0.00,
        status VARCHAR(30) DEFAULT 'pending',
        fee_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, fee_id, semester, school_year)
      )
    `);

    await client.query(`
      ALTER TABLE fee_items ADD COLUMN IF NOT EXISTS semester VARCHAR(20);
      ALTER TABLE fee_items ADD COLUMN IF NOT EXISTS school_year VARCHAR(20);
    `);

    // Create payments table for payment transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id) ON DELETE SET NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50),
        payment_type VARCHAR(50),
        reference_number VARCHAR(50) UNIQUE,
        or_number VARCHAR(50) UNIQUE,
        received_by INT REFERENCES users(id) ON DELETE SET NULL,
        remarks TEXT,
        transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_voided BOOLEAN DEFAULT false,
        void_reason TEXT,
        voided_by INT REFERENCES users(id) ON DELETE SET NULL,
        voided_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create payment_details table for payment line items
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_details (
        id SERIAL PRIMARY KEY,
        payment_id INT REFERENCES payments(id) ON DELETE CASCADE,
        fee_item_id INT REFERENCES fee_items(id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create receipts table for generated receipts
    await client.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        payment_id INT REFERENCES payments(id) ON DELETE CASCADE,
        receipt_number VARCHAR(50) UNIQUE,
        student_id INT REFERENCES students(id) ON DELETE SET NULL,
        student_name VARCHAR(150),
        total_amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50),
        items_paid JSONB,
        issued_by INT REFERENCES users(id) ON DELETE SET NULL,
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // NOTE: No hardcoded admin/cashier users inserted here.
    // This prevents confusing/duplicated records when the app starts.
    // Create initial users via /api/seed or via the Admin panel.

    // If you need initial bootstrapping, implement it via proper environment variables.
    
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
};

// Auth Middleware
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

// Generate reference number
const generateRefNumber = () => {
  return 'TXN-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

// Load extended API routes - call the external module function directly
console.log('[ROUTES] Starting to load API routes module...');
try {
  console.log('[ROUTES] __dirname:', __dirname);
  console.log('[ROUTES] Module path:', path.join(__dirname, 'routes', 'api'));
  const setupApiRoutes = require('./routes/api');
  console.log('[ROUTES-INIT] setupApiRoutes type:', typeof setupApiRoutes);
  console.log('[ROUTES-INIT] Calling setupApiRoutes function...');
  setupApiRoutes(app, pool, authenticateToken);
  console.log('[ROUTES-INIT] setupApiRoutes completed successfully');
  console.log('[ROUTES-DONE] All routes loaded');
} catch (err) {
  console.error('[ROUTES-ERROR] Failed to load routes:', err.message);
  console.error('[ROUTES-ERROR] Stack:', err.stack);
}

// Fallback student routes in case the external API route module fails to attach
app.get('/api/students', authenticateToken, async (req, res) => {
  try {
    const { search, course, year_level, status } = req.query;
    let query = `
      SELECT s.*, u.username, u.email as user_email, u.balance
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.archived = false
    `;
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (
        s.student_number ILIKE $${paramCount}
        OR s.first_name ILIKE $${paramCount}
        OR s.middle_name ILIKE $${paramCount}
        OR s.last_name ILIKE $${paramCount}
        OR s.suffix ILIKE $${paramCount}
        OR u.username ILIKE $${paramCount}
        OR u.student_id ILIKE $${paramCount}
        OR u.email ILIKE $${paramCount}
        OR CONCAT(s.first_name, ' ', s.middle_name, ' ', s.last_name) ILIKE $${paramCount}
        OR CONCAT(s.first_name, ' ', s.last_name) ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }
    if (course) {
      paramCount++;
      query += ` AND s.course = $${paramCount}`;
      params.push(course);
    }
    if (year_level) {
      paramCount++;
      query += ` AND s.year_level = $${paramCount}`;
      params.push(year_level);
    }
    if (status) {
      paramCount++;
      query += ` AND s.enrollment_status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY s.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Fallback get students error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/students/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT s.*, u.username, u.email as user_email, u.balance
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = $1 AND s.archived = false
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fallback get student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/students/test-route', (req, res) => {
  res.json({ message: 'student route attached' });
});

// Fallback assessment route
app.post('/api/assessments/generate', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'cashier') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { student_id, semester, school_year } = req.body;
    if (!student_id || !semester || !school_year) {
      return res.status(400).json({ error: 'student_id, semester, and school_year are required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Simple assessment generation - just return empty array for now
      const items = [];
      
      await client.query('COMMIT');
      res.status(201).json({ items });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Generate assessment error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Generate assessment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const loginValue = String(username || '').trim();

    if (!loginValue || !password) {
      return res.status(400).json({ error: 'Username or email and password are required' });
    }

    const result = await pool.query(
      `SELECT id, username, password, role, full_name, email, balance, student_id, archived
       FROM users
       WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
      [loginValue]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (user.archived) {
      return res.status(403).json({ error: 'Account is archived' });
    }
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    delete user.password;
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register (Admin only can create new users)
app.post('/api/auth/register', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create users' });
    }

    const {
      username,
      password,
      role,
      fullName,
      email,
      studentId,
      initialBalance,
      contact_number,
      gender,
      birthdate,
      address,
      guardian_name,
      guardian_contact,
      year_level,
      course,
      semester
    } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password, role, full_name, email, student_id, balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, role, full_name, email, student_id, balance`,
      [username, hashedPassword, role, fullName, email, studentId, initialBalance || 0]
    );

    // If creating a student account, also create/update the matching row in `students`
    // so the student appears in all student-based queries.
    if (String(role) === 'student') {
      const nameParts = String(fullName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      const first_name = nameParts[0] || username;
      const last_name = nameParts.length > 1 ? nameParts[nameParts.length - 1] : username;
      const middle_name = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : null;

      // Ensure studentId/student_number is present.
      if (!studentId || String(studentId).trim() === '') {
        return res.status(400).json({ error: 'studentId is required for student role' });
      }

      const studentNumber = String(studentId).trim();
      const enrollment_status = 'active';

      await pool.query(
        `INSERT INTO students (
          user_id,
          student_number,
          first_name,
          middle_name,
          last_name,
          gender,
          birthdate,
          contact_number,
          email,
          address,
          guardian_name,
          guardian_contact,
          year_level,
          course,
          enrollment_status,
          archived
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, false)
        ON CONFLICT (student_number) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          first_name = EXCLUDED.first_name,
          middle_name = EXCLUDED.middle_name,
          last_name = EXCLUDED.last_name,
          gender = COALESCE(EXCLUDED.gender, students.gender),
          birthdate = COALESCE(EXCLUDED.birthdate, students.birthdate),
          contact_number = COALESCE(EXCLUDED.contact_number, students.contact_number),
          email = COALESCE(EXCLUDED.email, students.email),
          address = COALESCE(EXCLUDED.address, students.address),
          guardian_name = COALESCE(EXCLUDED.guardian_name, students.guardian_name),
          guardian_contact = COALESCE(EXCLUDED.guardian_contact, students.guardian_contact),
          year_level = COALESCE(EXCLUDED.year_level, students.year_level),
          course = COALESCE(EXCLUDED.course, students.course),
          archived = false,
          enrollment_status = $15,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          result.rows[0].id,
          studentNumber,
          first_name,
          middle_name,
          last_name,
          gender,
          birthdate,
          contact_number,
          email,
          address,
          guardian_name,
          guardian_contact,
          year_level,
          course,
          enrollment_status
        ]
      );

      console.log('[REGISTER->STUDENTS] upsert ok', {
        user_id: result.rows[0].id,
        student_number: studentNumber,
        first_name,
        middle_name,
        last_name,
        email
      });
    }


    res.json({ message: 'User created successfully', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username or student ID already exists' });
    }
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
app.get('/api/app/info', (req, res) => {
  res.json({
    appName: 'STI Cashier System',
    subtitle: 'Sign in to continue',
    loginHint: 'Use your username or email to access your account.'
  });
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, full_name, email, balance, student_id, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== USER ROUTES ====================

// Get all users (Admin only)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const archived = req.query.archived === 'true';
    const result = await pool.query(
      'SELECT id, username, role, full_name, email, balance, student_id, created_at, archived FROM users WHERE archived = $1 ORDER BY created_at DESC',
      [archived]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/users/:id/archive', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const archived = req.body.archived === true;
    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE users SET archived = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username, role, full_name, email, balance, student_id, archived',
      [archived, req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    await client.query(
      'UPDATE students SET archived = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [archived, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ message: `User ${archived ? 'archived' : 'restored'} successfully`, user: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Archive user error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Get single user
app.get('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, full_name, email, balance, student_id, created_at FROM users WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const { fullName, email, balance } = req.body;

    // Only admin can update other users, or user can update themselves
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    let query, params;
    if (req.user.role === 'admin') {
      query = 'UPDATE users SET full_name = $1, email = $2, balance = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, username, role, full_name, email, balance, student_id';
      params = [fullName, email, balance, req.params.id];
    } else {
      query = 'UPDATE users SET full_name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, username, role, full_name, email, balance, student_id';
      params = [fullName, email, req.params.id];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User updated successfully', user: result.rows[0] });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (Admin only)
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== PRODUCT ROUTES ====================

// Get all products
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE is_available = true ORDER BY category, name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get products by category
app.get('/api/products/category/:category', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE category = $1 AND is_available = true ORDER BY name',
      [req.params.category]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get products by category error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single product
app.get('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create product (Admin only)
app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, description, price, category, stock, imageUrl } = req.body;

    const result = await pool.query(
      `INSERT INTO products (name, description, price, category, stock, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description, price, category, stock || 0, imageUrl]
    );

    res.json({ message: 'Product created successfully', product: result.rows[0] });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update product (Admin only)
app.put('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, description, price, category, stock, imageUrl, isAvailable } = req.body;

    const result = await pool.query(
      `UPDATE products SET name = $1, description = $2, price = $3, category = $4, stock = $5, image_url = $6, is_available = $7
       WHERE id = $8
       RETURNING *`,
      [name, description, price, category, stock, imageUrl, isAvailable, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product updated successfully', product: result.rows[0] });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete product (Admin only)
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== CART ROUTES ====================

// Get user's cart
app.get('/api/cart', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price, p.stock, p.image_url
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get cart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add to cart
app.post('/api/cart', authenticateToken, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    // Check if item already in cart
    const existing = await pool.query(
      'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [req.user.id, productId]
    );

    if (existing.rows.length > 0) {
      // Update quantity
      const result = await pool.query(
        'UPDATE cart_items SET quantity = quantity + $1 WHERE user_id = $2 AND product_id = $3 RETURNING *',
        [quantity, req.user.id, productId]
      );
      res.json({ message: 'Cart updated', item: result.rows[0] });
    } else {
      // Insert new item
      const result = await pool.query(
        'INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING *',
        [req.user.id, productId, quantity]
      );
      res.json({ message: 'Added to cart', item: result.rows[0] });
    }
  } catch (err) {
    console.error('Add to cart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update cart item quantity
app.put('/api/cart/:id', authenticateToken, async (req, res) => {
  try {
    const { quantity } = req.body;

    if (quantity <= 0) {
      await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      return res.json({ message: 'Item removed from cart' });
    }

    const result = await pool.query(
      'UPDATE cart_items SET quantity = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [quantity, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({ message: 'Cart updated', item: result.rows[0] });
  } catch (err) {
    console.error('Update cart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove from cart
app.delete('/api/cart/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({ message: 'Item removed from cart' });
  } catch (err) {
    console.error('Remove from cart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Clear cart
app.delete('/api/cart', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    console.error('Clear cart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== TRANSACTION ROUTES ====================

// Get user's transactions
app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    let query, params;

    if (req.user.role === 'admin' || req.user.role === 'cashier') {
      query = `
        SELECT p.id, 'payment' AS type, p.amount,
               CONCAT(
                 'Student payment for ',
                 COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''),
                 ' via ', COALESCE(p.payment_method, 'cash')
               ) AS description,
               COALESCE(p.or_number, p.reference_number, '') AS reference_number,
               p.transaction_date AS created_at,
               u.full_name AS actor_name,
               p.payment_method,
               CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, '')) AS student_name
        FROM payments p
        LEFT JOIN users u ON p.received_by = u.id
        LEFT JOIN students s ON p.student_id = s.id
        WHERE p.is_voided = false AND (s.archived = false OR s.id IS NULL)
        ORDER BY p.transaction_date DESC
        LIMIT 100
      `;
      params = [];
    } else {
      query = 'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50';
      params = [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Top up balance (Student)
app.post('/api/transactions/topup', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update user balance
      const userResult = await client.query(
        'UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING balance',
        [amount, req.user.id]
      );

      // Create transaction record
      const refNumber = generateRefNumber();
      const txnResult = await client.query(
        `INSERT INTO transactions (user_id, type, amount, description, reference_number)
         VALUES ($1, 'topup', $2, 'Balance top-up', $3)
         RETURNING *`,
        [req.user.id, amount, refNumber]
      );

      await client.query('COMMIT');

      res.json({
        message: 'Top-up successful',
        transaction: txnResult.rows[0],
        newBalance: userResult.rows[0].balance
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Top-up error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Checkout / Purchase
app.post('/api/transactions/purchase', authenticateToken, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get cart items with product details
      const cartResult = await client.query(
        `SELECT ci.*, p.name, p.price, p.stock
         FROM cart_items ci
         JOIN products p ON ci.product_id = p.id
         WHERE ci.user_id = $1`,
        [req.user.id]
      );

      if (cartResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cart is empty' });
      }

      // Calculate total
      const total = cartResult.rows.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // Check user balance
      const userResult = await client.query('SELECT balance FROM users WHERE id = $1', [req.user.id]);

      if (userResult.rows[0].balance < total) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Check stock availability
      for (const item of cartResult.rows) {
        if (item.stock < item.quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Insufficient stock for ${item.name}` });
        }
      }

      // Deduct from user balance
      await client.query(
        'UPDATE users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [total, req.user.id]
      );

      // Create transaction record
      const refNumber = generateRefNumber();
      const description = cartResult.rows.map(item => `${item.name} x${item.quantity}`).join(', ');

      const txnResult = await client.query(
        `INSERT INTO transactions (user_id, type, amount, description, reference_number)
         VALUES ($1, 'purchase', $2, $3, $4)
         RETURNING *`,
        [req.user.id, total, description, refNumber]
      );

      // Update stock
      for (const item of cartResult.rows) {
        await client.query(
          'UPDATE products SET stock = stock - $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }

      // Clear cart
      await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

      await client.query('COMMIT');

      // Get updated balance
      const updatedUser = await pool.query('SELECT balance FROM users WHERE id = $1', [req.user.id]);

      res.json({
        message: 'Purchase successful',
        transaction: txnResult.rows[0],
        newBalance: updatedUser.rows[0].balance
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Purchase error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Refund (Admin only)
app.post('/api/transactions/refund/:transactionId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get original transaction
      const originalTxn = await client.query(
        'SELECT * FROM transactions WHERE id = $1 AND type = $2',
        [req.params.transactionId, 'purchase']
      );

      if (originalTxn.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const txn = originalTxn.rows[0];

      // Refund to user balance
      await client.query(
        'UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [txn.amount, txn.user_id]
      );

      // Create refund record
      const refNumber = generateRefNumber();
      const txnResult = await client.query(
        `INSERT INTO transactions (user_id, type, amount, description, reference_number)
         VALUES ($1, 'refund', $2, $3, $4)
         RETURNING *`,
        [txn.user_id, txn.amount, `Refund for ${txn.reference_number}`, refNumber]
      );

      await client.query('COMMIT');

      res.json({
        message: 'Refund successful',
        transaction: txnResult.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== DASHBOARD STATS (Admin) ====================

const getDashboardStats = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const totalStudents = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'student' AND archived = false");
    const totalProducts = await pool.query('SELECT COUNT(*) FROM products');
    const totalTransactions = await pool.query('SELECT COUNT(*) FROM transactions');
    const totalRevenue = await pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'purchase'");
    const recentTransactions = await pool.query(`
      SELECT t.*, u.full_name as user_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE u.archived = false
      ORDER BY t.created_at DESC
      LIMIT 10
    `);
    const lowStock = await pool.query('SELECT * FROM products WHERE stock < 10 ORDER BY stock ASC LIMIT 5');

    res.json({
      totalStudents: parseInt(totalStudents.rows[0].count),
      totalUsers: parseInt(totalStudents.rows[0].count),
      totalProducts: parseInt(totalProducts.rows[0].count),
      totalTransactions: parseInt(totalTransactions.rows[0].count),
      totalRevenue: parseFloat(totalRevenue.rows[0].total),
      recentTransactions: recentTransactions.rows,
      lowStock: lowStock.rows
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

app.get('/api/stats', authenticateToken, getDashboardStats);
app.get('/api/dashboard/stats', authenticateToken, getDashboardStats);

// ==================== SEED DATA ====================

app.post('/api/seed', async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create admin user
      const adminPassword = await bcrypt.hash('admin123', 10);
      await client.query(`
        INSERT INTO users (username, password, role, full_name, email)
      VALUES ('admin', $1, 'admin', 'System Administrator', 'admin@sti.edu.ph')
      `, [adminPassword]);

      // Create sample products
      const products = [
        ['Coffee', 'Hot brewed coffee', 45.00, 'Beverages', 50],
        ['Iced Coffee', 'Iced cold coffee', 55.00, 'Beverages', 50],
        ['Sandwich', 'Ham and cheese sandwich', 65.00, 'Food', 30],
        ['Pasta', 'Creamy carbonara', 85.00, 'Food', 25],
        ['Rice Meal', 'Chicken adobo with rice', 75.00, 'Food', 40],
        ['Water Bottle', 'Purified water 500ml', 20.00, 'Beverages', 100],
        ['Chips', 'Regular size chips', 35.00, 'Snacks', 60],
        ['Cookies', 'Chocolate chip cookies', 25.00, 'Snacks', 40],
        ['Notebook', 'Long bond paper notebook', 45.00, 'School Supplies', 50],
        ['Pen', 'Ballpoint pen (black/blue)', 10.00, 'School Supplies', 100],
        ['Paper Ream', 'A4 bond paper (500 sheets)', 180.00, 'School Supplies', 20],
        ['USB Drive', '16GB USB flash drive', 250.00, 'Electronics', 15],
      ];

      for (const [name, desc, price, category, stock] of products) {
        await client.query(`
          INSERT INTO products (name, description, price, category, stock)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING
        `, [name, desc, price, category, stock]);
      }

      await client.query('COMMIT');
      res.json({ message: 'Seed data created successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`STI Cashier Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[INIT] Failed to initialize database. Server will not start.');
    console.error(err);
    process.exit(1);
  });
