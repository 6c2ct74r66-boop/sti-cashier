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
    
    console.log('Cleaning up database...\n');
    
    // Delete all fee_items (they'll be rebuilt)
    const deleteItems = await client.query('DELETE FROM fee_items');
    console.log(`✓ Deleted ${deleteItems.rowCount} fee items`);
    
    // Delete all old fees except the 6 we want
    const deleteFees = await client.query('DELETE FROM fees WHERE id > 6');
    console.log(`✓ Deleted old duplicate fees`);
    
    // Update the 6 core fees with correct amounts
    const feeUpdates = [
      { id: 1, amount: 200, fee_type: 'tuition', name: 'Tuition Fee (per unit)' },
      { id: 3, amount: 150, fee_type: 'computer_laboratory', name: 'Computer Laboratory' },
      { id: 4, amount: 100, fee_type: 'assessment', name: 'Assessment Fee' },
      { id: 5, amount: 50, fee_type: 'id_validation', name: 'ID Validation Fee' },
      { id: 6, amount: 75, fee_type: 'athletic', name: 'Athletic Fee' }
    ];
    
    // Create the miscellaneous fee as ID 2
    await client.query('DELETE FROM fees WHERE id = 2');
    await client.query(
      `INSERT INTO fees (id, fee_name, fee_type, amount) 
       VALUES (2, $1, $2, $3)`,
      ['Miscellaneous Fee', 'miscellaneous', 300]
    );
    
    for (const update of feeUpdates) {
      await client.query(
        'UPDATE fees SET fee_name = $1, fee_type = $2, amount = $3 WHERE id = $4',
        [update.name, update.fee_type, update.amount, update.id]
      );
    }
    
    console.log('✓ Updated 6 core fees with correct amounts');
    
    // Show cleaned up fees
    const feesResult = await client.query(`
      SELECT id, fee_name, fee_type, amount FROM fees ORDER BY id
    `);
    
    console.log('\n✓ Final Fee Structure:');
    feesResult.rows.forEach(f => {
      console.log(`  ${f.id}: ${f.fee_name} (${f.fee_type}) - ₱${f.amount}`);
    });
    
    // Now recreate fee_items for each student with all 6 fees per semester
    console.log('\nRegenerating fee items for all students...');
    
    const students = await client.query('SELECT id FROM students ORDER BY id');
    const semesterData = [
      { semester: '1st Semester', school_year: '2024-2025' }
    ];
    
    let totalInserted = 0;
    
    for (const student of students.rows) {
      for (const sem of semesterData) {
        // Insert 6 base fees per student per semester
        for (let feeId = 1; feeId <= 6; feeId++) {
          const result = await client.query(
            `INSERT INTO fee_items (student_id, fee_id, semester, school_year, balance, amount, fee_type)
             SELECT $1, $2, $3, $4, amount, amount, fee_type FROM fees WHERE id = $2
             RETURNING id`,
            [student.id, feeId, sem.semester, sem.school_year]
          );
          totalInserted++;
        }
      }
    }
    
    console.log(`✓ Created ${totalInserted} fee items (6 per student)`);
    
    await client.query('COMMIT');
    console.log('\n✅ Database cleanup complete!');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
