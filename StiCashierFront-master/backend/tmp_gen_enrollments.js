const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, database: 'sti_cashier', user: 'postgres', password: 'password' });
(async () => {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    const subjectsResult = await client.query(`
      SELECT id, subject_code, subject_name FROM subjects LIMIT 4
    `);
    
    const subjects = subjectsResult.rows;
    const studentIds = [2, 4];
    
    for (const studentId of studentIds) {
      for (let i = 0; i < subjects.length; i++) {
        const subject = subjects[i];
        await client.query(`
          INSERT INTO enrollments (student_id, subject_id, enrollment_date, semester, school_year, status, payment_status)
          VALUES ($1, $2, $3, '1st Semester', '2024-2025', 'enrolled', 'pending')
          ON CONFLICT DO NOTHING
        `, [studentId, subject.id, new Date().toISOString().split('T')[0]]);
      }
    }
    
    await client.query('COMMIT');
    console.log('✓ Generated enrollments for students 2, 4');
    
    const result = await pool.query(`
      SELECT s.id, s.student_number, COUNT(e.id) as enrollment_count
      FROM students s
      LEFT JOIN enrollments e ON s.id = e.student_id
      WHERE s.id IN (2, 4)
      GROUP BY s.id, s.student_number
    `);
    console.log(JSON.stringify(result.rows, null, 2));
    
    await pool.end();
  } catch (e) {
    console.error('error', e.message);
    process.exit(1);
  }
})();
