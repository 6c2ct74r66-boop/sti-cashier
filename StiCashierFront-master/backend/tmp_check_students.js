const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, database: 'sti_cashier', user: 'postgres', password: 'password' });
(async () => {
  try {
    const students = await pool.query(`
      SELECT s.id, s.student_number, s.first_name, s.last_name, s.course, s.year_level, s.enrollment_status,
             u.username, u.email, COUNT(fi.id) as fee_count, COUNT(e.id) as enrollment_count
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN fee_items fi ON s.id = fi.student_id
      LEFT JOIN enrollments e ON s.id = e.student_id
      WHERE s.id BETWEEN 1 AND 10
      GROUP BY s.id, s.student_number, s.first_name, s.last_name, s.course, s.year_level, s.enrollment_status, u.username, u.email
      ORDER BY s.id
    `);
    console.log('Students:');
    console.log(JSON.stringify(students.rows, null, 2));
  } catch (e) {
    console.error('error', e.message);
  } finally {
    await pool.end();
  }
})();
