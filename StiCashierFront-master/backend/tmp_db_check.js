const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'sti_cashier', user:'postgres', password:'password' });
(async () => {
  try {
    const students = await pool.query('SELECT id, student_number, first_name, last_name FROM students LIMIT 5');
    console.log('students', JSON.stringify(students.rows, null, 2));
    const fees = await pool.query('SELECT id, student_id, fee_id, amount, balance, status FROM fee_items LIMIT 5');
    console.log('fee_items', JSON.stringify(fees.rows, null, 2));
  } catch (e) {
    console.error('error', e);
  } finally {
    await pool.end();
  }
})();
