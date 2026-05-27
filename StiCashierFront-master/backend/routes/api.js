const bcrypt = require('bcryptjs');
console.log('[API MODULE] routes/api.js loaded');

module.exports = (app, pool, authenticateToken) => {
  console.log('[UNIQUE-MARKER-20250503-v1] Loading backend API routes');
  console.log('[API ROUTES] __dirname =', __dirname);

  const generateSemesterAssessment = async (client, studentId, semester, schoolYear) => {
    const rateResult = await client.query(`
      SELECT amount FROM fees WHERE fee_type = 'tuition' LIMIT 1
    `);
    const RATE_PER_UNIT = rateResult.rows[0] ? parseFloat(rateResult.rows[0].amount) : 200;

    const enrollmentResult = await client.query(`
      SELECT e.id AS enrollment_id, e.subject_id, s.subject_code, s.subject_name, s.units
      FROM enrollments e
      JOIN subjects s ON e.subject_id = s.id
      WHERE e.student_id = $1 AND e.semester = $2 AND e.school_year = $3
    `, [studentId, semester, schoolYear]);

    if (enrollmentResult.rows.length === 0) {
      return [];
    }

    const generatedItems = [];

    for (const enrollment of enrollmentResult.rows) {
      const tuitionAmount = (enrollment.units || 3) * RATE_PER_UNIT;
      const feeName = `Subject Tuition - ${enrollment.subject_code}`;

      let feeResult = await client.query(
        "SELECT id FROM fees WHERE fee_name = $1 AND fee_type = 'subject_tuition' LIMIT 1",
        [feeName]
      );

      let feeId;
      if (feeResult.rows.length === 0) {
        const newFeeResult = await client.query(`
          INSERT INTO fees (fee_name, description, amount, fee_type, is_required, is_active)
          VALUES ($1, $2, $3, 'subject_tuition', true, true)
          RETURNING id
        `, [
          feeName,
          `Tuition fee for ${enrollment.subject_name} (${enrollment.units} units × ₱${RATE_PER_UNIT})`,
          tuitionAmount
        ]);
        feeId = newFeeResult.rows[0].id;
      } else {
        feeId = feeResult.rows[0].id;
      }

      const feeItemResult = await client.query(`
        INSERT INTO fee_items (student_id, fee_id, enrollment_id, semester, school_year, amount, balance, status, fee_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'subject_tuition')
        ON CONFLICT (student_id, fee_id, semester, school_year) DO UPDATE SET
          amount = EXCLUDED.amount,
          balance = GREATEST(EXCLUDED.amount, fee_items.balance),
          status = CASE WHEN fee_items.balance <= 0 THEN fee_items.status ELSE 'pending' END,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [studentId, feeId, enrollment.enrollment_id, semester, schoolYear, tuitionAmount, tuitionAmount]);

      generatedItems.push(feeItemResult.rows[0]);
    }

    const requiredFeesResult = await client.query(`
      SELECT DISTINCT ON (fee_name, fee_type, school_year, semester) id, fee_name, amount, fee_type
      FROM fees
      WHERE is_required = true AND fee_type != 'subject_tuition' AND is_active = true
      ORDER BY fee_name, fee_type, school_year, semester, id ASC
    `);

    for (const fee of requiredFeesResult.rows) {
      const amount = parseFloat(fee.amount);
      const feeItemResult = await client.query(`
        INSERT INTO fee_items (student_id, fee_id, semester, school_year, amount, balance, due_date, status, fee_type)
        VALUES ($1, $2, $3, $4, $5, $6, NULL, 'pending', $7)
        ON CONFLICT (student_id, fee_id, semester, school_year) DO UPDATE SET
          amount = EXCLUDED.amount,
          balance = GREATEST(EXCLUDED.amount, fee_items.balance),
          status = CASE WHEN fee_items.balance <= 0 THEN fee_items.status ELSE 'pending' END,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [studentId, fee.id, semester, schoolYear, amount, amount, fee.fee_type]);
      generatedItems.push(feeItemResult.rows[0]);
    }

    return generatedItems;
  };

// ==================== STUDENTS ROUTES ====================

// Get all students
app.get('/api/students', authenticateToken, async (req, res) => {
  console.log('Received /api/students request');
  try {
    const { search, course, year_level, status, archived } = req.query;
    const archivedFilter = archived === 'true';
    let query = `
      SELECT s.*, u.username, u.email as user_email, u.balance
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.archived = $1
    `;
    const params = [archivedFilter];
    let paramCount = 1;

    if (search) {
      paramCount++;
      query += ` AND (
        s.student_number ILIKE $${paramCount}
        OR s.first_name ILIKE $${paramCount}
        OR s.middle_name ILIKE $${paramCount}
        OR s.last_name ILIKE $${paramCount}
        OR s.suffix ILIKE $${paramCount}
        OR u.username ILIKE $${paramCount}
        OR u.student_id ILIKE $${paramCount}
        OR u.email ILIKE $${paramCount}
        OR CONCAT(s.first_name, ' ', s.middle_name, ' ', s.last_name) ILIKE $${paramCount}
        OR CONCAT(s.first_name, ' ', s.last_name) ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }
    if (course) {
      paramCount++;
      query += ` AND s.course = $${paramCount}`;
      params.push(course);
    }
    if (year_level) {
      paramCount++;
      query += ` AND s.year_level = $${paramCount}`;
      params.push(year_level);
    }
    if (status) {
      paramCount++;
      query += ` AND s.enrollment_status = $${paramCount}`;
      params.push(status);
    }

    // Alphabetical order (A-Z) by student name
    query += ' ORDER BY s.last_name ASC, s.first_name ASC, s.middle_name ASC NULLS LAST, s.suffix ASC NULLS LAST';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single student
app.get('/api/students/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const archived = req.query.archived === 'true';
    const result = await pool.query(`
      SELECT s.*, u.username, u.email as user_email, u.balance
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = $1 AND s.archived = $2
    `, [id, archived]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current authenticated student's profile, enrollments, and fee items
app.get('/api/me/student', authenticateToken, async (req, res) => {
  try {
    const studentResult = await pool.query(`
      SELECT s.*, u.username, u.email as user_email, u.balance
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.user_id = $1 AND s.archived = false
    `, [req.user.id]);

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const student = studentResult.rows[0];

    const enrollmentsResult = await pool.query(`
      SELECT e.*, subj.subject_code, subj.subject_name, subj.units, subj.course, subj.year_level, subj.semester
      FROM enrollments e
      JOIN subjects subj ON e.subject_id = subj.id
      WHERE e.student_id = $1
      ORDER BY e.school_year DESC, e.semester DESC, e.created_at DESC
    `, [student.id]);

    const feeItemsResult = await pool.query(`
      SELECT fi.*, f.fee_name, f.description, f.fee_type, f.category,
             (fi.amount - fi.discount - fi.waiver) AS total_due,
             COALESCE(fi.balance,
               (fi.amount - fi.discount - fi.waiver) -
               (SELECT COALESCE(SUM(pd.amount), 0) FROM payment_details pd
                  JOIN payments p ON pd.payment_id = p.id
                  WHERE pd.fee_item_id = fi.id AND p.is_voided = false)
             ) AS balance,
             (SELECT COALESCE(SUM(pd.amount), 0) FROM payment_details pd
                JOIN payments p ON pd.payment_id = p.id
                WHERE pd.fee_item_id = fi.id AND p.is_voided = false) AS amount_paid,
             subj.subject_code, subj.subject_name, subj.units,
             e.id AS enrollment_id, e.payment_status, e.status AS enrollment_status
      FROM fee_items fi
      LEFT JOIN fees f ON fi.fee_id = f.id
      LEFT JOIN enrollments e ON fi.enrollment_id = e.id
      LEFT JOIN subjects subj ON e.subject_id = subj.id
      WHERE fi.student_id = $1
      ORDER BY fi.school_year DESC, fi.semester DESC, fi.fee_type DESC, fi.due_date ASC
    `, [student.id]);

    // Aggregate duplicate fee items by fee_name, fee_type, semester, school_year
    const feeItemMap = new Map();
    for (const row of feeItemsResult.rows) {
      const key = `${row.fee_name}|${row.fee_type}|${row.semester || ''}|${row.school_year || ''}`;
      const balance = Number(row.balance ?? 0);
      const amount_paid = Number(row.amount_paid ?? 0);
      if (!feeItemMap.has(key)) {
        feeItemMap.set(key, { ...row, balance, amount_paid });
      } else {
        const existing = feeItemMap.get(key);
        existing.balance = Number(existing.balance || 0) + balance;
        existing.amount_paid = Number(existing.amount_paid || 0) + amount_paid;
      }
    }
    const outstandingFeeItems = Array.from(feeItemMap.values()).filter(item => Number(item.balance ?? 0) > 0);

    const paymentsResult = await pool.query(`
      SELECT p.*, u.full_name as received_by_name
      FROM payments p
      LEFT JOIN users u ON p.received_by = u.id
      WHERE p.student_id = $1 AND p.is_voided = false
      ORDER BY p.transaction_date DESC
    `, [student.id]);

    res.json({
      student,
      enrollments: enrollmentsResult.rows,
      feeItems: outstandingFeeItems,
      payments: paymentsResult.rows
    });
  } catch (err) {
    console.error('Get current student dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create student
app.post('/api/students', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'cashier') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      student_number, first_name, middle_name, last_name, suffix,
      gender, birthdate, contact_number, email, address,
      guardian_name, guardian_contact, year_level, course
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Create user account
      const tempPassword = await bcrypt.hash(student_number, 10);
      const userResult = await client.query(`
        INSERT INTO users (username, password, role, full_name, sex, year, email, student_id, balance, created_at, archived)
        VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [student_number, tempPassword, `${first_name} ${last_name}`, gender, year, email, student_number, balance, created_at, arcived]);

      const user_id = userResult.rows[0].id;

      // Create student record
      const studentResult = await client.query(`
        INSERT INTO students (user_id, student_number, first_name, middle_name, last_name, suffix,
          gender, birthdate, contact_number, email, address, guardian_name, guardian_contact,
          year_level, course)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [user_id, student_number, first_name, middle_name, last_name, suffix,
        gender, birthdate, contact_number, email, address, guardian_name, guardian_contact,
        year_level, course]);

      await client.query('COMMIT');
      res.status(201).json(studentResult.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update student
app.put('/api/students/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'cashier') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;
    const {
      first_name, middle_name, last_name, suffix,
      gender, birthdate, contact_number, email, address,
      guardian_name, guardian_contact, year_level, course, enrollment_status
    } = req.body;

    const result = await pool.query(`
      UPDATE students SET
        first_name = COALESCE($1, first_name),
        middle_name = COALESCE($2, middle_name),
        last_name = COALESCE($3, last_name),
        suffix = COALESCE($4, suffix),
        gender = COALESCE($5, gender),
        birthdate = COALESCE($6, birthdate),
        contact_number = COALESCE($7, contact_number),
        email = COALESCE($8, email),
        address = COALESCE($9, address),
        guardian_name = COALESCE($10, guardian_name),
        guardian_contact = COALESCE($11, guardian_contact),
        year_level = COALESCE($12, year_level),
        course = COALESCE($13, course),
        enrollment_status = COALESCE($14, enrollment_status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING *
    `, [first_name, middle_name, last_name, suffix, gender, birthdate,
      contact_number, email, address, guardian_name, guardian_contact,
      year_level, course, enrollment_status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete student
app.delete('/api/students/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const result = await pool.query('DELETE FROM students WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    console.error('Delete student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== SUBJECTS ROUTES ====================

// Get all subjects
app.get('/api/subjects', authenticateToken, async (req, res) => {
  try {
    const { course, year_level, semester, search } = req.query;
    let query = 'SELECT * FROM subjects WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (course) {
      paramCount++;
      query += ` AND course = $${paramCount}`;
      params.push(course);
    }
    if (year_level) {
      paramCount++;
      query += ` AND year_level = $${paramCount}`;
      params.push(year_level);
    }
    if (semester) {
      paramCount++;
      query += ` AND semester = $${paramCount}`;
      params.push(semester);
    }
    if (search) {
      paramCount++;
      query += ` AND (subject_code ILIKE $${paramCount} OR subject_name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY course, year_level, semester, subject_code';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get subjects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create subject
app.post('/api/subjects', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { subject_code, subject_name, description, units, course, year_level, semester, lecture_hours, lab_hours } = req.body;

    const result = await pool.query(`
      INSERT INTO subjects (subject_code, subject_name, description, units, course, year_level, semester, lecture_hours, lab_hours)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [subject_code, subject_name, description, units, course, year_level, semester, lecture_hours, lab_hours]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create subject error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update subject
app.put('/api/subjects/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { subject_name, description, units, course, year_level, semester, lecture_hours, lab_hours, is_active } = req.body;

    const result = await pool.query(`
      UPDATE subjects SET
        subject_name = COALESCE($1, subject_name),
        description = COALESCE($2, description),
        units = COALESCE($3, units),
        course = COALESCE($4, course),
        year_level = COALESCE($5, year_level),
        semester = COALESCE($6, semester),
        lecture_hours = COALESCE($7, lecture_hours),
        lab_hours = COALESCE($8, lab_hours),
        is_active = COALESCE($9, is_active)
      WHERE id = $10
      RETURNING *
    `, [subject_name, description, units, course, year_level, semester, lecture_hours, lab_hours, is_active, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update subject error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete subject
app.delete('/api/subjects/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const result = await pool.query('DELETE FROM subjects WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    res.json({ message: 'Subject deleted successfully' });
  } catch (err) {
    console.error('Delete subject error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== ENROLLMENTS ROUTES ====================

// Get enrollments for a student
app.get('/api/enrollments/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const result = await pool.query(`
      SELECT e.*, s.subject_code, s.subject_name, s.units, s.course, s.year_level, s.semester
      FROM enrollments e
      JOIN subjects s ON e.subject_id = s.id
      WHERE e.student_id = $1
      ORDER BY e.school_year DESC, e.semester DESC
    `, [studentId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Get enrollments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Enroll student in subject
app.post('/api/enrollments', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'cashier') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { student_id, subject_id, enrollment_date, semester, school_year } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create enrollment
      const enrollmentResult = await client.query(`
        INSERT INTO enrollments (student_id, subject_id, enrollment_date, semester, school_year)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (student_id, subject_id, semester, school_year) DO NOTHING
        RETURNING *
      `, [student_id, subject_id, enrollment_date, semester, school_year]);

      if (enrollmentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Student already enrolled in this subject' });
      }

      const enrollment = enrollmentResult.rows[0];

      // Get subject details to calculate fee
      const subjectResult = await client.query(
        'SELECT * FROM subjects WHERE id = $1',
        [subject_id]
      );

      if (subjectResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Subject not found' });
      }

      const subject = subjectResult.rows[0];
      const RATE_PER_UNIT = 200; // Rate per unit for subject tuition
      const tuitionAmount = (subject.units || 3) * RATE_PER_UNIT;

      // Create or get subject tuition fee type
      let feeResult = await client.query(
        "SELECT id FROM fees WHERE fee_name = $1 AND fee_type = 'subject_tuition' LIMIT 1",
        [`Subject Tuition - ${subject.subject_code}`]
      );

      let feeId;
      if (feeResult.rows.length === 0) {
        // Create fee if it doesn't exist
        const newFeeResult = await client.query(`
          INSERT INTO fees (fee_name, description, amount, fee_type, is_required, is_active)
          VALUES ($1, $2, $3, 'subject_tuition', true, true)
          RETURNING id
        `, [
          `Subject Tuition - ${subject.subject_code}`,
          `Tuition fee for ${subject.subject_name} (${subject.units} units × ₱${RATE_PER_UNIT})`,
          tuitionAmount
        ]);
        feeId = newFeeResult.rows[0].id;
      } else {
        feeId = feeResult.rows[0].id;
      }

      // Create fee item linked to this enrollment
      const feeItemResult = await client.query(`
        INSERT INTO fee_items (student_id, fee_id, enrollment_id, semester, school_year, amount, balance, status, fee_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'subject_tuition')
        ON CONFLICT (student_id, fee_id, semester, school_year) DO UPDATE SET
          amount = EXCLUDED.amount,
          balance = EXCLUDED.balance,
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [student_id, feeId, enrollment.id, semester, school_year, tuitionAmount, tuitionAmount]);

      await generateSemesterAssessment(client, student_id, semester, school_year);

      await client.query('COMMIT');
      
      res.status(201).json({
        enrollment: enrollment,
        fee_item: feeItemResult.rows[0],
        subject: subject,
        tuition_amount: tuitionAmount
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Create enrollment transaction error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create enrollment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/assessments/generate', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'cashier') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { student_id, semester, school_year } = req.body;
    if (!student_id || !semester || !school_year) {
      return res.status(400).json({ error: 'student_id, semester, and school_year are required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const items = await generateSemesterAssessment(client, student_id, semester, school_year);
      await client.query('COMMIT');
      res.status(201).json({ items });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Generate assessment error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Generate assessment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update enrollment (grade)
app.put('/api/enrollments/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { grade, status } = req.body;

    const result = await pool.query(`
      UPDATE enrollments SET
        grade = COALESCE($1, grade),
        status = COALESCE($2, status)
      WHERE id = $3
      RETURNING *
    `, [grade, status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update enrollment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Drop enrollment
app.delete('/api/enrollments/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'cashier') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;
    const result = await pool.query('DELETE FROM enrollments WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    res.json({ message: 'Enrollment dropped successfully' });
  } catch (err) {
    console.error('Delete enrollment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== FEES ROUTES ====================

// Get all fees
app.get('/api/fees', authenticateToken, async (req, res) => {
  try {
    const { fee_type, school_year, semester } = req.query;
    let query = 'SELECT * FROM fees WHERE is_active = true';
    const params = [];
    let paramCount = 0;

    if (fee_type) {
      paramCount++;
      query += ` AND fee_type = $${paramCount}`;
      params.push(fee_type);
    }
    if (school_year) {
      paramCount++;
      query += ` AND school_year = $${paramCount}`;
      params.push(school_year);
    }
    if (semester) {
      paramCount++;
      query += ` AND semester = $${paramCount}`;
      params.push(semester);
    }

    query += ' ORDER BY fee_type, fee_name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get fees error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create fee
app.post('/api/fees', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { fee_name, description, amount, fee_type, category, school_year, semester, is_required } = req.body;

    const result = await pool.query(`
      INSERT INTO fees (fee_name, description, amount, fee_type, category, school_year, semester, is_required)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [fee_name, description, amount, fee_type, category, school_year, semester, is_required]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create fee error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update fee
app.put('/api/fees/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { fee_name, description, amount, fee_type, category, school_year, semester, is_required, is_active } = req.body;

    const result = await pool.query(`
      UPDATE fees SET
        fee_name = COALESCE($1, fee_name),
        description = COALESCE($2, description),
        amount = COALESCE($3, amount),
        fee_type = COALESCE($4, fee_type),
        category = COALESCE($5, category),
        school_year = COALESCE($6, school_year),
        semester = COALESCE($7, semester),
        is_required = COALESCE($8, is_required),
        is_active = COALESCE($9, is_active)
      WHERE id = $10
      RETURNING *
    `, [fee_name, description, amount, fee_type, category, school_year, semester, is_required, is_active, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fee not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update fee error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get student fee items (includes enrollment details for subject-based fees)
app.get('/api/fee-items/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { semester, school_year } = req.query;
    let query = `
      SELECT fi.*, f.fee_name, f.description, f.fee_type, f.category,
             (fi.amount - fi.discount - fi.waiver) as total_due,
             COALESCE(fi.balance,
               (fi.amount - fi.discount - fi.waiver) -
               (SELECT COALESCE(SUM(pd.amount), 0) FROM payment_details pd
                JOIN payments p ON pd.payment_id = p.id
                WHERE pd.fee_item_id = fi.id AND p.is_voided = false)
             ) as balance,
             (SELECT COALESCE(SUM(pd.amount), 0) FROM payment_details pd
              JOIN payments p ON pd.payment_id = p.id
              WHERE pd.fee_item_id = fi.id AND p.is_voided = false) as amount_paid,
             s.subject_code, s.subject_name, s.units,
             e.id as enrollment_id, e.payment_status, e.status as enrollment_status
      FROM fee_items fi
      LEFT JOIN fees f ON fi.fee_id = f.id
      LEFT JOIN enrollments e ON fi.enrollment_id = e.id
      LEFT JOIN subjects s ON e.subject_id = s.id
      WHERE fi.student_id = $1
    `;
    const params = [studentId];
    let paramCount = 1;

    if (semester) {
      paramCount++;
      query += ` AND fi.semester = $${paramCount}`;
      params.push(semester);
    }
    if (school_year) {
      paramCount++;
      query += ` AND fi.school_year = $${paramCount}`;
      params.push(school_year);
    }

    query += ' ORDER BY fi.fee_type DESC, fi.due_date ASC';
    const result = await pool.query(query, params);
    const groupedRows = new Map();
    for (const row of result.rows) {
      const key = `${row.fee_name}|${row.fee_type}|${row.semester || ''}|${row.school_year || ''}`;
      const balance = Number(row.balance ?? 0);
      const amount_paid = Number(row.amount_paid ?? 0);
      if (!groupedRows.has(key)) {
        groupedRows.set(key, { ...row, balance, amount_paid });
      } else {
        const existing = groupedRows.get(key);
        existing.balance = Number(existing.balance || 0) + balance;
        existing.amount_paid = Number(existing.amount_paid || 0) + amount_paid;
      }
    }

    const outstandingRows = Array.from(groupedRows.values()).filter(item => Number(item.balance ?? 0) > 0);
    res.json(outstandingRows);
  } catch (err) {
    console.error('Get fee items error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Assign fees to student
app.post('/api/fee-items', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'cashier') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { student_id, fee_ids, semester, school_year, due_date } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const results = [];

      for (const fee_id of fee_ids) {
        // Get fee amount
        const feeResult = await client.query('SELECT amount FROM fees WHERE id = $1', [fee_id]);
        if (feeResult.rows.length === 0) continue;

        const amount = feeResult.rows[0].amount;
        const balance = amount;

        const result = await client.query(`
INSERT INTO fee_items (student_id, fee_id, semester, school_year, amount, balance, due_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (student_id, fee_id, semester, school_year) DO UPDATE SET
          amount = $5,
          balance = $6 - (SELECT COALESCE(SUM(pd.amount), 0) FROM payment_details pd
                          JOIN payments p ON pd.payment_id = p.id
                          WHERE pd.fee_item_id = fee_items.id AND p.is_voided = false),
          due_date = $7,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [student_id, fee_id, semester, school_year, amount, balance, due_date]);

        results.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.status(201).json(results);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Assign fee items error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== PAYMENTS ROUTES ====================

// Get all payments
app.get('/api/payments', authenticateToken, async (req, res) => {
  try {
    const { student_id, date_from, date_to, payment_method } = req.query;
    let query = `
      SELECT p.*, s.student_number, s.first_name, s.last_name, u.full_name as received_by_name
      FROM payments p
      LEFT JOIN students s ON p.student_id = s.id
      LEFT JOIN users u ON p.received_by = u.id
      WHERE p.is_voided = false AND (s.archived = false OR s.id IS NULL)
    `;
    const params = [];
    let paramCount = 0;

    if (student_id) {
      paramCount++;
      query += ` AND p.student_id = $${paramCount}`;
      params.push(student_id);
    }
    if (date_from) {
      paramCount++;
      query += ` AND p.transaction_date >= $${paramCount}`;
      params.push(date_from);
    }
    if (date_to) {
      paramCount++;
      query += ` AND p.transaction_date <= $${paramCount}`;
      params.push(date_to);
    }
    if (payment_method) {
      paramCount++;
      query += ` AND p.payment_method = $${paramCount}`;
      params.push(payment_method);
    }

    query += ' ORDER BY p.transaction_date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get payments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create payment
app.post('/api/payments', authenticateToken, async (req, res) => {
  try {
    const { student_id, amount, payment_method, payment_type, remarks, fee_item_ids } = req.body;
    const requestedAmount = parseFloat(amount ?? 0);
    const client = await pool.connect();

    const normalizedMethod = String(payment_method || 'cash').trim().toLowerCase().replace(/-/g, '_');
    let normalizedType = ['full', 'partial', 'downpayment'].includes(String(payment_type || '').toLowerCase())
      ? String(payment_type).toLowerCase()
      : 'full';

    if (!student_id || Number.isNaN(Number(student_id))) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    let studentRecord = null;
    if (req.user.role === 'student') {
      normalizedType = 'full';
      const studentResult = await pool.query('SELECT * FROM students WHERE user_id = $1 AND archived = false', [req.user.id]);
      if (studentResult.rows.length === 0) {
        return res.status(403).json({ error: 'Student profile not found' });
      }
      studentRecord = studentResult.rows[0];
      if (studentRecord.id !== Number(student_id)) {
        return res.status(403).json({ error: 'Students may only pay their own invoices' });
      }
      if (!['gcash', 'bank_transfer'].includes(normalizedMethod)) {
        return res.status(403).json({ error: 'Students may only submit GCash or bank transfer payments' });
      }
    } else if (req.user.role !== 'admin' && req.user.role !== 'cashier') {
      return res.status(403).json({ error: 'Access denied' });
    } else {
      const studentResult = await pool.query('SELECT id, first_name, last_name FROM students WHERE id = $1 AND archived = false', [student_id]);
      if (studentResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid student ID' });
      }
      studentRecord = studentResult.rows[0];
    }

    try {
      await client.query('BEGIN');

      if (!fee_item_ids || fee_item_ids.length === 0) {
        return res.status(400).json({ error: 'No fee items selected for payment' });
      }

      if (Number.isNaN(requestedAmount) || requestedAmount <= 0) {
        return res.status(400).json({ error: 'Invalid payment amount' });
      }

      // Generate reference and OR number
      const refNumber = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const orNumber = `OR-${Date.now()}`;

      // Create payment record with placeholder amount, will update once actual payment details are created
      const paymentResult = await client.query(`
        INSERT INTO payments (student_id, amount, payment_method, payment_type, reference_number, or_number, received_by, remarks)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [student_id, 0, normalizedMethod, normalizedType, refNumber, orNumber, req.user.id, remarks]);

      const payment = paymentResult.rows[0];
      const updatedEnrollmentIds = new Set();
      let remainingAmount = requestedAmount;
      let actualPaidAmount = 0;

      // Update fee items and create payment details
      for (const fee_item_id of fee_item_ids) {
        if (remainingAmount <= 0) break;

        const feeItemResult = await client.query(`
          SELECT *, COALESCE(balance, amount - discount - waiver, 0) AS balance
          FROM fee_items
          WHERE id = $1 AND student_id = $2
        `, [fee_item_id, student_id]);

        if (feeItemResult.rows.length === 0) continue;

        const feeItem = feeItemResult.rows[0];
        const currentBalance = Number.isFinite(Number(feeItem.balance)) ? Number(feeItem.balance) : 0;
        if (currentBalance <= 0) continue;

        const paymentAmount = Math.min(remainingAmount, currentBalance);

        // Create payment detail
        await client.query(`
          INSERT INTO payment_details (payment_id, fee_item_id, amount)
          VALUES ($1, $2, $3)
        `, [payment.id, fee_item_id, paymentAmount]);

        // Update fee item balance
        const newBalance = currentBalance - paymentAmount;
        const newStatus = newBalance <= 0 ? 'paid' : 'partial';

        await client.query(`
          UPDATE fee_items SET
            balance = $1,
            status = $2,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [newBalance, newStatus, fee_item_id]);

        // Track enrollment if this fee is linked to one
        if (feeItem.enrollment_id) {
          updatedEnrollmentIds.add(feeItem.enrollment_id);
        }

        remainingAmount -= paymentAmount;
        actualPaidAmount += paymentAmount;
      }

      if (actualPaidAmount <= 0) {
        return res.status(400).json({ error: 'No valid fee items available for payment' });
      }

      // Update payment amount to the actual applied amount
      await client.query(`
        UPDATE payments SET amount = $1 WHERE id = $2
      `, [actualPaidAmount, payment.id]);

      // Update enrollment payment status based on paid fees
      for (const enrollmentId of updatedEnrollmentIds) {
        const enrollmentFeesResult = await client.query(`
          SELECT SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
                 COUNT(*) as total_count
          FROM fee_items
          WHERE enrollment_id = $1
        `, [enrollmentId]);

        const fees = enrollmentFeesResult.rows[0];
        let paymentStatus = 'pending';
        if (fees.paid_count === fees.total_count && fees.total_count > 0) {
          paymentStatus = 'paid';
        } else if (fees.paid_count > 0) {
          paymentStatus = 'partial';
        }

        const enrollmentStatus = paymentStatus === 'paid' ? 'enrolled' : null;
        await client.query(`
          UPDATE enrollments SET
            payment_status = $1,
            status = COALESCE($2, status),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [paymentStatus, enrollmentStatus, enrollmentId]);
      }

      // Create receipt
      const receiptNumber = `RCP-${Date.now()}`;
      const itemsResult = await client.query(`
        SELECT pd.*, f.fee_name FROM payment_details pd
        JOIN fee_items fi ON pd.fee_item_id = fi.id
        LEFT JOIN fees f ON fi.fee_id = f.id
        WHERE pd.payment_id = $1
      `, [payment.id]);

      await client.query(`
        INSERT INTO receipts (payment_id, receipt_number, student_id, student_name, total_amount, payment_method, items_paid, issued_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [payment.id, receiptNumber, student_id, `${studentRecord.first_name} ${studentRecord.last_name}`, actualPaidAmount, normalizedMethod,
      JSON.stringify(itemsResult.rows), req.user.id]);

      await client.query('COMMIT');
      res.status(201).json({ ...payment, amount: actualPaidAmount, receipt_number: receiptNumber });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create payment error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Void payment
app.put('/api/payments/:id/void', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get payment details
      const paymentResult = await client.query('SELECT * FROM payments WHERE id = $1', [id]);
      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      const payment = paymentResult.rows[0];

      // Restore fee item balances
      const detailsResult = await client.query(`
        SELECT * FROM payment_details WHERE payment_id = $1
      `, [id]);

      for (const detail of detailsResult.rows) {
        await client.query(`
          UPDATE fee_items SET
            balance = balance + $1,
            status = CASE WHEN balance + $1 > 0 THEN 'partial' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [detail.amount, detail.fee_item_id]);
      }

      // Void the payment
      await client.query(`
        UPDATE payments SET
          is_voided = true,
          void_reason = $1,
          voided_by = $2,
          voided_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [reason, req.user.id, id]);

      // Void the receipt
      await client.query('UPDATE receipts SET issued_at = CURRENT_TIMESTAMP WHERE payment_id = $1', [id]);

      await client.query('COMMIT');
      res.json({ message: 'Payment voided successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Void payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== RECEIPTS ROUTES ====================

// Get receipts
app.get('/api/receipts', authenticateToken, async (req, res) => {
  try {
    const { student_id, date_from, date_to } = req.query;
    let query = `
      SELECT r.*, s.student_number
      FROM receipts r
      LEFT JOIN students s ON r.student_id = s.id
      WHERE (s.archived = false OR s.id IS NULL)
    `;
    const params = [];
    let paramCount = 0;

    if (student_id) {
      paramCount++;
      query += ` AND r.student_id = $${paramCount}`;
      params.push(student_id);
    }
    if (date_from) {
      paramCount++;
      query += ` AND r.issued_at >= $${paramCount}`;
      params.push(date_from);
    }
    if (date_to) {
      paramCount++;
      query += ` AND r.issued_at <= $${paramCount}`;
      params.push(date_to);
    }

    query += ' ORDER BY r.issued_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get receipts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get receipt details
app.get('/api/receipts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT r.*, s.student_number, s.first_name, s.last_name, s.course, s.year_level,
             u.full_name as issued_by_name
      FROM receipts r
      LEFT JOIN students s ON r.student_id = s.id
      LEFT JOIN users u ON r.issued_by = u.id
      WHERE r.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Get payment details
    const paymentDetails = await pool.query(`
      SELECT pd.*, f.fee_name, f.fee_type
      FROM payment_details pd
      JOIN fee_items fi ON pd.fee_item_id = fi.id
      JOIN fees f ON fi.fee_id = f.id
      WHERE pd.payment_id = $1
    `, [result.rows[0].payment_id]);

    res.json({ ...result.rows[0], payment_details: paymentDetails.rows });
  } catch (err) {
    console.error('Get receipt error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== REPORTS ROUTES ====================

// Get collection report
app.get('/api/reports/collections', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'cashier') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { date_from, date_to, group_by } = req.query;

    let query = `
      SELECT 
        ${group_by === 'fee_type' ? 'f.fee_type' : 'DATE(p.transaction_date)'} as label,
        COUNT(*) as transaction_count,
        SUM(p.amount) as total_amount
      FROM payments p
      LEFT JOIN payment_details pd ON p.id = pd.payment_id
      LEFT JOIN fee_items fi ON pd.fee_item_id = fi.id
      LEFT JOIN fees f ON fi.fee_id = f.id
      WHERE p.is_voided = false
    `;
    const params = [];
    let paramCount = 0;

    if (date_from) {
      paramCount++;
      query += ` AND p.transaction_date >= $${paramCount}`;
      params.push(date_from);
    }
    if (date_to) {
      paramCount++;
      query += ` AND p.transaction_date <= $${paramCount}`;
      params.push(date_to);
    }

    query += ` GROUP BY ${group_by === 'fee_type' ? 'f.fee_type' : 'DATE(p.transaction_date)'}`;
    query += ` ORDER BY ${group_by === 'fee_type' ? 'f.fee_type' : 'label'}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get collections report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get student balance summary
app.get('/api/reports/student-balance/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    const studentResult = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const feesResult = await pool.query(`
      SELECT f.fee_type, f.category,
             SUM(fi.amount) as total_assessed,
             SUM(fi.discount) as total_discount,
             SUM(fi.waiver) as total_waiver,
             SUM(fi.balance) as total_balance
      FROM fee_items fi
      JOIN fees f ON fi.fee_id = f.id
      WHERE fi.student_id = $1
      GROUP BY f.fee_type, f.category
    `, [studentId]);

    const paymentsResult = await pool.query(`
      SELECT SUM(amount) as total_paid
      FROM payments
      WHERE student_id = $1 AND is_voided = false
    `, [studentId]);

    res.json({
      student: studentResult.rows[0],
      summary: feesResult.rows,
      total_paid: paymentsResult.rows[0].total_paid || 0
    });
  } catch (err) {
    console.error('Get student balance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get dashboard stats (enhanced)
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const [
      totalStudents,
      totalSubjects,
      totalEnrollments,
      pendingFees,
      totalCollections,
      todayCollections,
      feeStatusCounts,
      enrollmentStatusCounts
    ] = await Promise.all([
      // Count only non-archived students for active student total
      pool.query("SELECT COUNT(*) FROM students WHERE archived = false"),
      pool.query('SELECT COUNT(*) FROM subjects WHERE is_active = true'),
      pool.query("SELECT COUNT(*) FROM enrollments WHERE status = 'enrolled'"),
      pool.query("SELECT COUNT(*) FROM fee_items WHERE status IN ('pending', 'partial')"),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE is_voided = false"),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE DATE(transaction_date) = CURRENT_DATE AND is_voided = false"),
      pool.query("SELECT status, COUNT(*) as count FROM fee_items GROUP BY status"),
      pool.query("SELECT COALESCE(payment_status, 'unknown') as status, COUNT(*) as count FROM enrollments GROUP BY payment_status")
    ]);

    const feeStatusMap = feeStatusCounts.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {});

    const enrollmentStatusMap = enrollmentStatusCounts.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {});

    res.json({
      totalStudents: parseInt(totalStudents.rows[0].count, 10),
      totalSubjects: parseInt(totalSubjects.rows[0].count, 10),
      totalEnrollments: parseInt(totalEnrollments.rows[0].count, 10),
      pendingFees: parseInt(pendingFees.rows[0].count, 10),
      totalCollections: parseFloat(totalCollections.rows[0].total),
      todayCollections: parseFloat(todayCollections.rows[0].total),
      feeStatusCounts: feeStatusMap,
      enrollmentStatusCounts: enrollmentStatusMap
    });
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// App config endpoint - dynamic lists used by frontend
app.get('/api/app/config', async (req, res) => {
  try {
    const [coursesRes, yearsRes, semestersRes, schoolYearsRes, categoriesRes, feeTypesRes, enrollmentStatusesRes, feeStatusesRes] = await Promise.all([
      pool.query("SELECT DISTINCT course FROM subjects WHERE course IS NOT NULL ORDER BY course"),
      pool.query("SELECT DISTINCT year_level FROM subjects WHERE year_level IS NOT NULL ORDER BY year_level"),
      pool.query("SELECT DISTINCT semester FROM subjects WHERE semester IS NOT NULL ORDER BY semester"),
      pool.query("SELECT DISTINCT school_year FROM fees WHERE school_year IS NOT NULL UNION SELECT DISTINCT school_year FROM enrollments WHERE school_year IS NOT NULL ORDER BY school_year DESC"),
      pool.query("SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category"),
      pool.query("SELECT DISTINCT fee_type FROM fees WHERE fee_type IS NOT NULL ORDER BY fee_type"),
      pool.query("SELECT DISTINCT payment_status FROM enrollments WHERE payment_status IS NOT NULL ORDER BY payment_status"),
      pool.query("SELECT DISTINCT status FROM fee_items WHERE status IS NOT NULL ORDER BY status")
    ]);

    const courses = coursesRes.rows.map(r => r.course).filter(Boolean);
    const years = yearsRes.rows.map(r => String(r.year_level)).filter(Boolean);
    const semesters = semestersRes.rows.map(r => r.semester).filter(Boolean);
    const school_years = schoolYearsRes.rows.map(r => r.school_year).filter(Boolean);
    const categories = categoriesRes.rows.map(r => r.category).filter(Boolean);
    const fee_types = feeTypesRes.rows.map(r => r.fee_type).filter(Boolean);
    const enrollment_statuses = enrollmentStatusesRes.rows.map(r => r.payment_status).filter(Boolean);
    const fee_statuses = feeStatusesRes.rows.map(r => r.status).filter(Boolean);

    res.json({
      courses,
      years,
      semesters,
      school_years,
      categories,
      fee_types,
      enrollment_statuses,
      fee_statuses
    });
  } catch (err) {
    console.error('Get app config error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

}; // End of module.exports function
