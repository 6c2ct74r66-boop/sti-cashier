const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: 'admin',
  host: 'localhost',
  port: 5432,
  database: 'sti_cashier'
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Fixing fee amounts and types...');
    
    // Update fees table with correct amounts and types
    const updates = [
      { id: 1, amount: 200, type: 'tuition', name: 'Tuition Fee (per unit)' },
      { id: 2, amount: 300, type: 'miscellaneous', name: 'Miscellaneous Fee' },
      { id: 3, amount: 150, type: 'computer_laboratory', name: 'Computer Laboratory' },
      { id: 4, amount: 100, type: 'assessment', name: 'Assessment Fee' },
      { id: 5, amount: 50, type: 'id_validation', name: 'ID Validation Fee' },
      { id: 6, amount: 75, type: 'athletic', name: 'Athletic Fee' }
    ];
    
    for (const update of updates) {
      await client.query(
        'UPDATE fees SET amount = $1, fee_type = $2, fee_name = $3 WHERE id = $4',
        [update.amount, update.type, update.name, update.id]
      );
    }
    
    console.log('✓ Updated fees table');
    
    // Delete all fee_items for students 2-5 that were incorrectly generated
    const deleteResult = await client.query(
      `DELETE FROM fee_items WHERE student_id IN (2, 4, 5) 
       AND fee_id NOT IN (1, 3, 6) 
       OR (student_id IN (2, 4, 5) AND fee_type IN ('library', 'insurance', 'medical', 'registration', 'student_activity'))`
    );
    console.log(`✓ Deleted ${deleteResult.rowCount} incorrect fee items`);
    
    // Recalculate balances for remaining fee_items
    await client.query(`
      UPDATE fee_items fi
      SET balance = (SELECT amount FROM fees WHERE id = fi.fee_id)
      WHERE balance != 0
    `);
    console.log('✓ Recalculated fee balances');
    
    await client.query('COMMIT');
    console.log('\n✓ All fee data fixed successfully!');
    
    // Show updated fee structure
    const result = await client.query(`
      SELECT id, fee_name, fee_type, amount FROM fees ORDER BY id
    `);
    
    console.log('\nCurrent Fee Structure:');
    console.log(result.rows);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
