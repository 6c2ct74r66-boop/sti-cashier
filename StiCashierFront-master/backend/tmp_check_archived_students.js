const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ host: 'localhost', port: 5432, database: 'sti_cashier', user: 'postgres', password: '12345678' });
  try {
    const active = await pool.query('SELECT COUNT(*) FROM students WHERE archived = false');
    const archived = await pool.query('SELECT COUNT(*) FROM students WHERE archived = true');
    const sample = await pool.query('SELECT id, user_id, student_number, first_name, last_name, archived FROM students ORDER BY id');
    console.log('active student count:', active.rows[0].count);
    console.log('archived student count:', archived.rows[0].count);
    console.table(sample.rows);
    const userSample = await pool.query('SELECT id, username, role, full_name, archived FROM users WHERE role = $1 ORDER BY id', ['student']);
    console.table(userSample.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
})();
