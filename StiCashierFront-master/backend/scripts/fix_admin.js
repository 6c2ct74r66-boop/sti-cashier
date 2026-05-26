require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

(async () => {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'sti_cashier',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  });

  const client = await pool.connect();
  try {
    console.log('Fixing admin user...');
    const plain = 'admin123';
    const hash = await bcrypt.hash(plain, 10);

    const result = await client.query(`
      INSERT INTO users (username, password, role, full_name, email, balance)
      VALUES ('admin', $1, 'admin', 'System Administrator', 'admin@sti.edu.ph', 0)
      ON CONFLICT (username) DO UPDATE SET
        password = EXCLUDED.password,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        balance = EXCLUDED.balance,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, username, role, email, balance
    `, [hash]);

    console.log('Admin upsert result:', result.rows[0]);
    console.log('Credentials: username=admin password=admin123');
  } catch (err) {
    console.error('Error fixing admin:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
