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
    if (!loginRes.ok) throw new Error('Login failed');
    const token = loginData.token;

    const pool = new Pool({ host: 'localhost', port: 5432, database: 'sti_cashier', user: 'postgres', password: 'password' });
    
    // Get a student with subject tuition fees
    const feeItemsResult = await pool.query(`
      SELECT fi.id, fi.student_id, fi.fee_id, fi.enrollment_id, fi.balance, fi.fee_type, f.fee_name
      FROM fee_items fi
      LEFT JOIN fees f ON fi.fee_id = f.id
      WHERE fi.fee_type = 'subject_tuition' AND fi.balance > 0
      LIMIT 1
    `);
    
    if (feeItemsResult.rows.length === 0) {
      console.log('No subject tuition fees found');
      await pool.end();
      return;
    }
    
    const feeItem = feeItemsResult.rows[0];
    console.log('Found subject tuition fee:', feeItem);
    
    const paymentRes = await fetch('http://localhost:5000/api/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        student_id: feeItem.student_id,
        amount: feeItem.balance,
        payment_method: 'cash',
        payment_type: 'full',
        remarks: 'Subject tuition test',
        fee_item_ids: [feeItem.id]
      })
    });
    const paymentData = await paymentRes.json();
    console.log('payment status:', paymentRes.status);
    console.log('response:', JSON.stringify(paymentData, null, 2));
    
    await pool.end();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
