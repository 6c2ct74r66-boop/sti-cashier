const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ host: 'localhost', port: 5432, database: 'sti_cashier', user: 'postgres', password: '12345678' });
  try {
    console.log('Syncing students.archived from users.archived...');
    const res = await pool.query(`
      UPDATE students
      SET archived = u.archived, updated_at = CURRENT_TIMESTAMP
      FROM users u
      WHERE students.user_id = u.id AND (students.archived IS DISTINCT FROM u.archived)
      RETURNING students.id, students.user_id, students.archived, u.archived as user_archived
    `);
    console.log('Updated rows:', res.rowCount);
    if (res.rowCount > 0) console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
})();
