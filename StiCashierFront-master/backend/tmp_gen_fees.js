const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, database: 'sti_cashier', user: 'postgres', password: 'password' });
(async () => {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    const studentIds = [2, 4, 5];
    
    for (const studentId of studentIds) {
      const feesResult = await client.query(`
        SELECT id, fee_name, amount FROM fees 
        WHERE is_required = true AND is_active = true
        ORDER BY id LIMIT 15
      `);
      
      for (const fee of feesResult.rows) {
        await client.query(`
          INSERT INTO fee_items (student_id, fee_id, amount, balance, status, semester, school_year)
          VALUES ($1, $2, $3, $4, 'pending', '1st Semester', '2024-2025')
          ON CONFLICT DO NOTHING
        `, [studentId, fee.id, fee.amount, fee.amount]);
      }
    }
    
    await client.query('COMMIT');
    console.log('✓ Generated fees for students 2, 4, 5');
    
    const result = await pool.query(`
      SELECT s.id, s.student_number, COUNT(fi.id) as fee_count
      FROM students s
      LEFT JOIN fee_items fi ON s.id = fi.student_id
      WHERE s.id IN (2, 4, 5)
      GROUP BY s.id, s.student_number
    `);
    console.log(JSON.stringify(result.rows, null, 2));
    
    await pool.end();
  } catch (e) {
    console.error('error', e.message);
    process.exit(1);
  }
})();
