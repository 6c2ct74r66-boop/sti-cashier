const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ host: 'localhost', port: 5432, database: 'sti_cashier', user: 'postgres', password: '12345678' });
  try {
    const usersActive = await pool.query("SELECT COUNT(*) FROM users WHERE role='student' AND archived = false");
    const usersArchived = await pool.query("SELECT COUNT(*) FROM users WHERE role='student' AND archived = true");
    const studentsActive = await pool.query('SELECT COUNT(*) FROM students WHERE archived = false');
    const studentsArchived = await pool.query('SELECT COUNT(*) FROM students WHERE archived = true');
    const userSample = await pool.query("SELECT id, username, role, full_name, archived, student_id FROM users WHERE role='student' ORDER BY id");
    const studentSample = await pool.query('SELECT id, user_id, student_number, first_name, last_name, archived FROM students ORDER BY id');

    console.log('usersActive', usersActive.rows[0].count);
    console.log('usersArchived', usersArchived.rows[0].count);
    console.log('studentsActive', studentsActive.rows[0].count);
    console.log('studentsArchived', studentsArchived.rows[0].count);
    console.log('\nSample users:');
    console.table(userSample.rows);
    console.log('\nSample students:');
    console.table(studentSample.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
})();
