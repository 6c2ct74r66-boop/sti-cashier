const { Pool } = require('pg');
const fetch = global.fetch || require('node-fetch');
(async () => {
  try {
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    console.log('login status', loginRes.status);
    console.log(loginData);
    if (!loginRes.ok) {
      throw new Error('Login failed');
    }
    const token = loginData.token;

    const pool = new Pool({ host: 'localhost', port: 5432, database: 'sti_cashier', user: 'postgres', password: 'password' });
    const studentResult = await pool.query(`
      SELECT s.id, s.student_number, s.first_name, s.last_name
      FROM students s
      LIMIT 1
    `);
    if (studentResult.rows.length === 0) {
      throw new Error('No student found');
    }
    const student = studentResult.rows[0];
    console.log('student', student);

    const feeItemsResult = await pool.query(`
      SELECT id, student_id, balance, amount FROM fee_items
      WHERE student_id = $1 AND COALESCE(balance, amount - discount - waiver) > 0
      LIMIT 3
    `, [student.id]);
    console.log('fee items', feeItemsResult.rows);
    if (feeItemsResult.rows.length === 0) {
      throw new Error('No unpaid fee items found for this student');
    }

    const fee_item_ids = feeItemsResult.rows.map(r => r.id);
    const amount = feeItemsResult.rows.reduce((sum, item) => sum + Number(item.balance ?? item.amount ?? 0), 0);

    const paymentRes = await fetch('http://localhost:5000/api/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        student_id: student.id,
        amount,
        payment_method: 'cash',
        payment_type: 'full',
        remarks: 'Test payment',
        fee_item_ids
      })
    });
    const paymentData = await paymentRes.json();
    console.log('payment status', paymentRes.status);
    console.log(paymentData);
    await pool.end();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
