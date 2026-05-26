const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: 'admin',
  host: 'localhost',
  port: 5432,
  database: 'sti_cashier'
});

(async () => {
  try {
    const result = await pool.query(`
      SELECT 
        fi.id, 
        s.student_number, 
        fi.fee_type, 
        fi.balance,
        f.fee_name, 
        f.amount,
        fi.semester,
        fi.school_year
      FROM fee_items fi 
      JOIN students s ON fi.student_id = s.id 
      JOIN fees f ON fi.fee_id = f.id 
      WHERE fi.fee_type = 'miscellaneous'
      ORDER BY s.id, fi.semester, fi.school_year
    `);
    
    console.log('Misc Fees in Database:');
    console.log(result.rows);
    
    // Also check totals
    const totals = await pool.query(`
      SELECT 
        s.id,
        s.student_number,
        fi.fee_type,
        SUM(fi.balance) as total_balance,
        COUNT(*) as count
      FROM fee_items fi
      JOIN students s ON fi.student_id = s.id
      WHERE fi.fee_type = 'miscellaneous'
      GROUP BY s.id, s.student_number, fi.fee_type
      ORDER BY s.id
    `);
    
    console.log('\nMisc Fee Totals by Student:');
    console.log(totals.rows);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
