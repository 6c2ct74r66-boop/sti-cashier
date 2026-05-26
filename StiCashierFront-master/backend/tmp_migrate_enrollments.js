const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, database: 'sti_cashier', user: 'postgres', password: 'password' });
(async () => {
  try {
    const client = await pool.connect();
    
    // Add payment_status column if it doesn't exist
    await client.query(`
      ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid'))
    `);
    console.log('✓ Added payment_status column to enrollments');
    
    // Add updated_at column if it doesn't exist
    await client.query(`
      ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('✓ Added updated_at column to enrollments');
    
    client.release();
    await pool.end();
  } catch (e) {
    console.error('error', e.message);
    process.exit(1);
  }
})();
