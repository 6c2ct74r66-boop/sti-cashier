const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sti_cashier',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

(async () => {
  try {
    const student = await pool.query("SELECT id, student_number, first_name, last_name FROM students WHERE student_number = 'STU-2024-009'");
    console.log('STUDENT', student.rows);
    if (!student.rows[0]) return;
    const fees = await pool.query(`SELECT fi.id, fi.student_id, fi.fee_id, fi.semester, fi.school_year, fi.amount, fi.discount, fi.waiver, fi.balance, fi.status, f.fee_name, f.fee_type, f.category, fi.enrollment_id FROM fee_items fi LEFT JOIN fees f ON fi.fee_id = f.id WHERE fi.student_id = $1 ORDER BY fi.fee_id, fi.school_year, fi.semester, fi.id`, [student.rows[0].id]);
    console.log('FEE ITEMS', fees.rows.length);
    console.log(JSON.stringify(fees.rows.map(r => ({
      id: r.id,
      fee_name: r.fee_name,
      fee_type: r.fee_type,
      semester: r.semester,
      school_year: r.school_year,
      amount: r.amount,
      balance: r.balance,
      status: r.status,
      enrollment_id: r.enrollment_id,
    })), null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
})();
