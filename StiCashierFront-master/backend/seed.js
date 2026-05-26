require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sti_cashier',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

const seedData = async () => {
  const client = await pool.connect();

  try {
    console.log('🌱 Starting database seed...\n');

    // ==================== SEED USERS ====================
    console.log('Creating users...');

    const adminPassword = await bcrypt.hash('admin123', 10);
    const cashierPassword = await bcrypt.hash('cashier123', 10);

    // Admin user
    await client.query(`
      INSERT INTO users (username, password, role, full_name, email, balance)
      VALUES ('admin', $1, 'admin', 'System Administrator', 'admin@sti.edu.ph', 0)
      ON CONFLICT (username) DO UPDATE SET
        password = EXCLUDED.password,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        balance = EXCLUDED.balance,
        updated_at = CURRENT_TIMESTAMP
    `, [adminPassword]);

    // Cashier user
    await client.query(`
      INSERT INTO users (username, password, role, full_name, email, balance)
      VALUES ('cashier1', $1, 'cashier', 'Maria Santos', 'cashier@sti.edu.ph', 0)
      ON CONFLICT (username) DO UPDATE SET
        password = EXCLUDED.password,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        balance = EXCLUDED.balance,
        updated_at = CURRENT_TIMESTAMP
    `, [cashierPassword]);

    // Student users
    const studentPassword = await bcrypt.hash('student123', 10);
    const students = [
      { username: 'STU-2024-001', studentId: 'STU-2024-001', fullName: 'Juan dela Cruz', email: 'juan.cruz@student.sti.edu.ph', balance: 500.00 },
      { username: 'STU-2024-002', studentId: 'STU-2024-002', fullName: 'Ana Reyes', email: 'ana.reyes@student.sti.edu.ph', balance: 750.00 },
      { username: 'STU-2024-003', studentId: 'STU-2024-003', fullName: 'Pedro Garcia', email: 'pedro.garcia@student.sti.edu.ph', balance: 1000.00 },
      { username: 'STU-2024-004', studentId: 'STU-2024-004', fullName: 'Maria Lopez', email: 'maria.lopez@student.sti.edu.ph', balance: 250.00 },
      { username: 'STU-2024-005', studentId: 'STU-2024-005', fullName: 'Jose Martinez', email: 'jose.martinez@student.sti.edu.ph', balance: 600.00 },
      { username: 'STU-2024-006', studentId: 'STU-2024-006', fullName: 'John Marco Padua', email: 'john.padua@student.sti.edu.ph', balance: 900.00 },
      { username: 'STU-2024-007', studentId: 'STU-2024-007', fullName: 'Ella Mae Canoy', email: 'ella.canoy@student.sti.edu.ph', balance: 650.00 },
      { username: 'STU-2024-008', studentId: 'STU-2024-008', fullName: 'Danie Summer', email: 'danie.summer@student.sti.edu.ph', balance: 350.00 },
      { username: 'STU-2024-009', studentId: 'STU-2024-009', fullName: 'Warner Lambert A. Zapanta', email: 'warner.zapanta@student.sti.edu.ph', balance: 150.00 },
    ];

    for (const student of students) {
      await client.query(`
        INSERT INTO users (username, password, role, full_name, email, student_id, balance)
        VALUES ($1, $2, 'student', $3, $4, $5, $6)
        ON CONFLICT (username) DO NOTHING
      `, [student.username, studentPassword, student.fullName, student.email, student.studentId, student.balance]);
    }
    console.log('✓ Users created\n');

    // ==================== SEED PRODUCTS ====================
    console.log('Creating products...');

    const products = [
      // Food items
      { name: 'Carbonara', description: 'Creamy carbonara pasta', price: 85.00, category: 'Meals', stock: 50, is_available: true },
      { name: 'Chicken Joy', description: 'Fried chicken with rice', price: 95.00, category: 'Meals', stock: 40, is_available: true },
      { name: 'Spaghetti', description: 'Sweet style spaghetti', price: 65.00, category: 'Meals', stock: 60, is_available: true },
      { name: 'Pancit Canton', description: 'Stir-fried noodles', price: 55.00, category: 'Meals', stock: 45, is_available: true },
      { name: 'Palabok', description: 'Rice noodles with sauce', price: 70.00, category: 'Meals', stock: 35, is_available: true },

      // Drinks
      { name: 'Iced Coffee', description: 'Cold brewed coffee', price: 45.00, category: 'Drinks', stock: 100, is_available: true },
      { name: 'Coke', description: '500ml soft drink', price: 25.00, category: 'Drinks', stock: 120, is_available: true },
      { name: 'Mineral Water', description: '500ml purified water', price: 15.00, category: 'Drinks', stock: 150, is_available: true },
      { name: 'Mango Shake', description: 'Blended mango smoothie', price: 55.00, category: 'Drinks', stock: 40, is_available: true },
      { name: 'Green Tea', description: 'Japanese green tea', price: 35.00, category: 'Drinks', stock: 80, is_available: true },

      // Snacks
      { name: 'Burger', description: 'Beef burger with fries', price: 75.00, category: 'Snacks', stock: 30, is_available: true },
      { name: 'Hotdog', description: 'Grilled hotdog', price: 35.00, category: 'Snacks', stock: 50, is_available: true },
      { name: 'Pizza Slice', description: 'Pepperoni pizza slice', price: 45.00, category: 'Snacks', stock: 40, is_available: true },
      { name: 'French Fries', description: 'Crispy fries', price: 40.00, category: 'Snacks', stock: 60, is_available: true },
      { name: 'Nachos', description: 'Loaded nachos', price: 60.00, category: 'Snacks', stock: 25, is_available: true },

      // School Supplies
      { name: 'Bond Paper (1 Rim)', description: 'A4 size, 500 sheets', price: 180.00, category: 'Supplies', stock: 50, is_available: true },
      { name: 'Ballpen (10pcs)', description: 'Blue ballpens', price: 50.00, category: 'Supplies', stock: 100, is_available: true },
      { name: 'Notebook', description: '200 pages spiral notebook', price: 35.00, category: 'Supplies', stock: 80, is_available: true },
      { name: 'Pencil', description: 'HB pencil with eraser', price: 15.00, category: 'Supplies', stock: 150, is_available: true },
      { name: 'USB Flash Drive 16GB', description: 'SanDisk USB drive', price: 250.00, category: 'Supplies', stock: 20, is_available: true },
    ];

    for (const product of products) {
      await client.query(`
        INSERT INTO products (name, description, price, category, stock, is_available)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [product.name, product.description, product.price, product.category, product.stock, product.is_available]);
    }
    console.log('✓ Products created\n');

    // ==================== SEED STUDENT RECORDS ====================
    console.log('Creating student records...');

    const studentIds = [
      'STU-2024-001', 'STU-2024-002', 'STU-2024-003', 'STU-2024-004', 'STU-2024-005',
      'STU-2024-006', 'STU-2024-007', 'STU-2024-008', 'STU-2024-009'
    ];

    const userResult = await client.query(
      "SELECT id, student_id FROM users WHERE role = 'student' AND student_id = ANY($1)",
      [studentIds]
    );

    const userMap = userResult.rows.reduce((acc, row) => {
      acc[row.student_id] = row.id;
      return acc;
    }, {});

    const studentRecords = [
      { studentNumber: 'STU-2024-001', firstName: 'Juan', lastName: 'dela Cruz', middleName: 'Santos', gender: 'Male', birthdate: '2005-03-15', contactNumber: '09123456789', email: 'juan.cruz@student.sti.edu.ph', address: '123 Makati City', guardianName: 'Carlos dela Cruz', guardianContact: '09123456780', yearLevel: 1, course: 'BSIT' },
      { studentNumber: 'STU-2024-002', firstName: 'Ana', lastName: 'Reyes', middleName: 'Maria', gender: 'Female', birthdate: '2005-07-22', contactNumber: '09123456788', email: 'ana.reyes@student.sti.edu.ph', address: '456 Quezon City', guardianName: 'Maria Reyes', guardianContact: '09123456781', yearLevel: 1, course: 'BSCS' },
      { studentNumber: 'STU-2024-003', firstName: 'Pedro', lastName: 'Garcia', middleName: 'Luis', gender: 'Male', birthdate: '2004-11-08', contactNumber: '09123456787', email: 'pedro.garcia@student.sti.edu.ph', address: '789 Manila City', guardianName: 'Juan Garcia', guardianContact: '09123456782', yearLevel: 2, course: 'BSIT' },
      { studentNumber: 'STU-2024-004', firstName: 'Maria', lastName: 'Lopez', middleName: 'Carmen', gender: 'Female', birthdate: '2004-05-30', contactNumber: '09123456786', email: 'maria.lopez@student.sti.edu.ph', address: '321 Pasig City', guardianName: 'Carmen Lopez', guardianContact: '09123456783', yearLevel: 2, course: 'BSBA' },
      { studentNumber: 'STU-2024-005', firstName: 'Jose', lastName: 'Martinez', middleName: 'Ramon', gender: 'Male', birthdate: '2005-09-12', contactNumber: '09123456785', email: 'jose.martinez@student.sti.edu.ph', address: '654 Mandaluyong City', guardianName: 'Ramon Martinez', guardianContact: '09123456784', yearLevel: 1, course: 'BSIT' },
      { studentNumber: 'STU-2024-006', firstName: 'John Marco', lastName: 'Padua', middleName: '', gender: 'Male', birthdate: '2005-02-12', contactNumber: '09123456701', email: 'john.padua@student.sti.edu.ph', address: '12 Pasig Street, Quezon City', guardianName: 'Michael Padua', guardianContact: '09123456702', yearLevel: 1, course: 'BSIT' },
      { studentNumber: 'STU-2024-007', firstName: 'Ella Mae', lastName: 'Canoy', middleName: '', gender: 'Female', birthdate: '2005-05-18', contactNumber: '09123456703', email: 'ella.canoy@student.sti.edu.ph', address: '45 Manila Avenue, Manila', guardianName: 'Regina Canoy', guardianContact: '09123456704', yearLevel: 1, course: 'BSIT' },
      { studentNumber: 'STU-2024-008', firstName: 'Danie', lastName: 'Summer', middleName: '', gender: 'Female', birthdate: '2005-09-02', contactNumber: '09123456705', email: 'danie.summer@student.sti.edu.ph', address: '78 Makati Lane, Makati City', guardianName: 'Lara Summer', guardianContact: '09123456706', yearLevel: 1, course: 'BSIT' },
      { studentNumber: 'STU-2024-009', firstName: 'Warner Lambert A.', lastName: 'Zapanta', middleName: '', gender: 'Male', birthdate: '2005-12-10', contactNumber: '09123456707', email: 'warner.zapanta@student.sti.edu.ph', address: '90 BGC Drive, Taguig', guardianName: 'Ana Zapanta', guardianContact: '09123456708', yearLevel: 1, course: 'BSIT' },
    ];

    for (const student of studentRecords) {
      const userId = userMap[student.studentNumber];
      if (userId) {
        await client.query(`
          INSERT INTO students (user_id, student_number, first_name, middle_name, last_name, gender, birthdate, contact_number, email, address, guardian_name, guardian_contact, year_level, course)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (student_number) DO NOTHING
        `, [userId, student.studentNumber, student.firstName, student.middleName, student.lastName, student.gender, student.birthdate, student.contactNumber, student.email, student.address, student.guardianName, student.guardianContact, student.yearLevel, student.course]);
      }
    }
    console.log('✓ Student records created\n');

    // ==================== SEED BSIT FEE BALANCES ====================
    console.log('Assigning varied fee balances for requested BSIT students...');

    const feeResult = await client.query(
      "SELECT id, fee_name FROM fees WHERE fee_name IN ('Tuition Fee (per unit)', 'Library Fee', 'Laboratory Fee', 'Student Activity Fee', 'Insurance Fee', 'Registration Fee')"
    );
    const feeMap = feeResult.rows.reduce((acc, row) => {
      acc[row.fee_name] = row.id;
      return acc;
    }, {});

    const studentRows = await client.query(
      "SELECT id, student_number FROM students WHERE student_number = ANY($1)",
      [[ 'STU-2024-006', 'STU-2024-007', 'STU-2024-008', 'STU-2024-009' ]]
    );
    const studentMap = studentRows.rows.reduce((acc, row) => {
      acc[row.student_number] = row.id;
      return acc;
    }, {});

    const feeAssignments = [
      { studentNumber: 'STU-2024-006', feeName: 'Tuition Fee (per unit)', amount: 2000.00, dueDate: '2026-08-15', semester: '1st', school_year: '2026-2027' },
      { studentNumber: 'STU-2024-006', feeName: 'Library Fee', amount: 75.00, dueDate: '2026-08-15', semester: '1st', school_year: '2026-2027' },
      { studentNumber: 'STU-2024-007', feeName: 'Tuition Fee (per unit)', amount: 1800.00, dueDate: '2026-08-15', semester: '1st', school_year: '2026-2027' },
      { studentNumber: 'STU-2024-007', feeName: 'Laboratory Fee', amount: 150.00, dueDate: '2026-08-15', semester: '1st', school_year: '2026-2027' },
      { studentNumber: 'STU-2024-008', feeName: 'Tuition Fee (per unit)', amount: 2200.00, dueDate: '2026-08-15', semester: '1st', school_year: '2026-2027' },
      { studentNumber: 'STU-2024-008', feeName: 'Student Activity Fee', amount: 100.00, dueDate: '2026-08-15', semester: '1st', school_year: '2026-2027' },
      { studentNumber: 'STU-2024-008', feeName: 'Insurance Fee', amount: 75.00, dueDate: '2026-08-15', semester: '1st', school_year: '2026-2027' },
      { studentNumber: 'STU-2024-009', feeName: 'Tuition Fee (per unit)', amount: 1900.00, dueDate: '2026-08-15', semester: '1st', school_year: '2026-2027' },
      { studentNumber: 'STU-2024-009', feeName: 'Registration Fee', amount: 100.00, dueDate: '2026-08-15', semester: '1st', school_year: '2026-2027' },
      { studentNumber: 'STU-2024-009', feeName: 'Library Fee', amount: 75.00, dueDate: '2026-08-15', semester: '1st', school_year: '2026-2027' },
    ];

    for (const assignment of feeAssignments) {
      const studentId = studentMap[assignment.studentNumber];
      const feeId = feeMap[assignment.feeName];
      if (!studentId || !feeId) continue;

      await client.query(`
        INSERT INTO fee_items (student_id, fee_id, amount, balance, due_date, discount, waiver, status, semester, school_year)
        VALUES ($1, $2, $3, $4, $5, 0.00, 0.00, 'pending', $6, $7)
        ON CONFLICT (student_id, fee_id, semester, school_year) DO UPDATE SET
          amount = EXCLUDED.amount,
          balance = EXCLUDED.balance,
          due_date = EXCLUDED.due_date,
          status = 'pending',
          updated_at = CURRENT_TIMESTAMP
      `, [studentId, feeId, assignment.amount, assignment.amount, assignment.dueDate, assignment.semester, assignment.school_year]);
    }
    console.log('✓ Fee balances assigned\n');

    // ==================== SEED SUBJECTS ====================
    console.log('Creating subjects...');

    const subjects = [
      // BSIT Year 1
      { code: 'IT101', name: 'Introduction to Computing', units: 3, course: 'BSIT', yearLevel: 1, semester: '1st', lectureHours: 2, labHours: 3 },
      { code: 'IT102', name: 'Computer Programming 1', units: 3, course: 'BSIT', yearLevel: 1, semester: '1st', lectureHours: 2, labHours: 3 },
      { code: 'MATH101', name: 'College Mathematics', units: 3, course: 'BSIT', yearLevel: 1, semester: '1st', lectureHours: 3, labHours: 0 },
      { code: 'ENG101', name: 'English Communication', units: 3, course: 'BSIT', yearLevel: 1, semester: '1st', lectureHours: 3, labHours: 0 },
      { code: 'IT103', name: 'Computer Programming 2', units: 3, course: 'BSIT', yearLevel: 1, semester: '2nd', lectureHours: 2, labHours: 3 },
      { code: 'IT104', name: 'Data Structures', units: 3, course: 'BSIT', yearLevel: 1, semester: '2nd', lectureHours: 2, labHours: 3 },
      { code: 'MATH102', name: 'Discrete Mathematics', units: 3, course: 'BSIT', yearLevel: 1, semester: '2nd', lectureHours: 3, labHours: 0 },

      // BSIT Year 2
      { code: 'IT201', name: 'Database Management', units: 3, course: 'BSIT', yearLevel: 2, semester: '1st', lectureHours: 2, labHours: 3 },
      { code: 'IT202', name: 'Web Development', units: 3, course: 'BSIT', yearLevel: 2, semester: '1st', lectureHours: 2, labHours: 3 },
      { code: 'IT203', name: 'Object-Oriented Programming', units: 3, course: 'BSIT', yearLevel: 2, semester: '1st', lectureHours: 2, labHours: 3 },
      { code: 'IT204', name: 'Networking 1', units: 3, course: 'BSIT', yearLevel: 2, semester: '2nd', lectureHours: 2, labHours: 3 },
      { code: 'IT205', name: 'Systems Analysis', units: 3, course: 'BSIT', yearLevel: 2, semester: '2nd', lectureHours: 3, labHours: 0 },

      // BSCS Year 1
      { code: 'CS101', name: 'Computer Science Fundamentals', units: 3, course: 'BSCS', yearLevel: 1, semester: '1st', lectureHours: 3, labHours: 0 },
      { code: 'CS102', name: 'Programming Logic', units: 3, course: 'BSCS', yearLevel: 1, semester: '1st', lectureHours: 2, labHours: 3 },
      { code: 'CS103', name: 'Calculus 1', units: 3, course: 'BSCS', yearLevel: 1, semester: '1st', lectureHours: 3, labHours: 0 },
      { code: 'CS104', name: 'Linear Algebra', units: 3, course: 'BSCS', yearLevel: 1, semester: '2nd', lectureHours: 3, labHours: 0 },
      { code: 'CS105', name: 'Data Structures and Algorithms', units: 3, course: 'BSCS', yearLevel: 1, semester: '2nd', lectureHours: 2, labHours: 3 },

      // BSBA Year 1
      { code: 'BA101', name: 'Principles of Management', units: 3, course: 'BSBA', yearLevel: 1, semester: '1st', lectureHours: 3, labHours: 0 },
      { code: 'BA102', name: 'Business Mathematics', units: 3, course: 'BSBA', yearLevel: 1, semester: '1st', lectureHours: 3, labHours: 0 },
      { code: 'BA103', name: 'Financial Accounting', units: 3, course: 'BSBA', yearLevel: 1, semester: '1st', lectureHours: 3, labHours: 0 },
      { code: 'BA104', name: 'Marketing Management', units: 3, course: 'BSBA', yearLevel: 1, semester: '2nd', lectureHours: 3, labHours: 0 },
      { code: 'BA105', name: 'Business Communication', units: 3, course: 'BSBA', yearLevel: 1, semester: '2nd', lectureHours: 3, labHours: 0 },
    ];

    for (const subject of subjects) {
      await client.query(`
        INSERT INTO subjects (subject_code, subject_name, units, course, year_level, semester, lecture_hours, lab_hours)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (subject_code) DO NOTHING
      `, [subject.code, subject.name, subject.units, subject.course, subject.yearLevel, subject.semester, subject.lectureHours, subject.labHours]);
    }
    console.log('✓ Subjects created\n');

    // ==================== SEED FEES ====================
    console.log('Creating fees...');

    const fees = [
      // Tuition fees
      { name: 'Tuition Fee (per unit)', description: 'Basic tuition fee per unit', amount: 200.00, feeType: 'tuition', category: 'tuition', required: true },
      { name: 'Miscellaneous Fee', description: 'General school fees', amount: 300.00, feeType: 'misc', category: 'miscellaneous', required: true },
      { name: 'Laboratory Fee', description: 'Lab access and equipment', amount: 150.00, feeType: 'lab', category: 'laboratory', required: true },
      { name: 'Library Fee', description: 'Library services and resources', amount: 75.00, feeType: 'library', category: 'library', required: true },
      { name: 'Computer Fee', description: 'Computer lab usage', amount: 100.00, feeType: 'computer', category: 'computer', required: true },
      { name: 'Student Activity Fee', description: 'Student activities and organizations', amount: 100.00, feeType: 'activity', category: 'activities', required: true },
      { name: 'Athletic Fee', description: 'Sports and gym facilities', amount: 75.00, feeType: 'athletic', category: 'athletics', required: true },
      { name: 'Registration Fee', description: 'One-time registration', amount: 100.00, feeType: 'registration', category: 'registration', required: true },
      { name: 'ID Card Fee', description: 'Student ID card', amount: 50.00, feeType: 'id', category: 'identification', required: false },
      { name: 'Handbook Fee', description: 'Student handbook', amount: 25.00, feeType: 'handbook', category: 'handbook', required: false },
      { name: 'Medical/Dental Fee', description: 'Health services', amount: 100.00, feeType: 'medical', category: 'medical', required: true },
      { name: 'Insurance Fee', description: 'Student insurance', amount: 75.00, feeType: 'insurance', category: 'insurance', required: true },
    ];

    for (const fee of fees) {
      await client.query(`
        INSERT INTO fees (fee_name, description, amount, fee_type, category, is_required, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT DO NOTHING
      `, [fee.name, fee.description, fee.amount, fee.feeType, fee.category, fee.required]);
    }
    console.log('✓ Fees created\n');

    // ==================== SEED ENROLLMENTS ====================
    console.log('Creating enrollments...');

    const enrollmentSchoolYear = '2024-2025';
    const enrollmentSemester = '1st';

    // Get BSIT Year 1 students
    const bsitStudents = await client.query(`
      SELECT id FROM students WHERE course = 'BSIT' AND year_level = '1'
    `);

    // Get BSIT Year 1 Semester 1 subjects
    const bsitSubjects = await client.query(`
      SELECT id, subject_code FROM subjects WHERE course = 'BSIT' AND year_level = '1' AND semester = $1
    `, [enrollmentSemester]);

    for (const student of bsitStudents.rows) {
      for (const subject of bsitSubjects.rows) {
        await client.query(`
          INSERT INTO enrollments (student_id, subject_id, enrollment_date, semester, school_year, status)
          VALUES ($1, $2, CURRENT_DATE, $3, $4, 'enrolled')
          ON CONFLICT (student_id, subject_id, semester, school_year) DO NOTHING
        `, [student.id, subject.id, enrollmentSemester, enrollmentSchoolYear]);
      }
    }

    console.log('✓ Enrollments created\n');

    // ==================== SEED SAMPLE TRANSACTIONS ====================
    console.log('Creating sample transactions...');

    const usersResult = await client.query("SELECT id FROM users WHERE role = 'student' LIMIT 3");
    const adminResult = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");

    if (usersResult.rows.length > 0 && adminResult.rows.length > 0) {
      const transactions = [
        { userId: usersResult.rows[0].id, type: 'topup', amount: 1000.00, description: 'Account top-up via cashier', ref: 'TOP-001' },
        { userId: usersResult.rows[0].id, type: 'purchase', amount: -85.00, description: 'Carbonara', ref: 'TXN-001' },
        { userId: usersResult.rows[0].id, type: 'purchase', amount: -45.00, description: 'Iced Coffee', ref: 'TXN-002' },
        { userId: usersResult.rows[1].id, type: 'topup', amount: 500.00, description: 'Account top-up via cashier', ref: 'TOP-002' },
        { userId: usersResult.rows[1].id, type: 'purchase', amount: -95.00, description: 'Chicken Joy', ref: 'TXN-003' },
        { userId: usersResult.rows[2].id, type: 'topup', amount: 2000.00, description: 'Account top-up via cashier', ref: 'TOP-003' },
        { userId: usersResult.rows[2].id, type: 'purchase', amount: -75.00, description: 'Burger with fries', ref: 'TXN-004' },
        { userId: usersResult.rows[2].id, type: 'purchase', amount: -250.00, description: 'USB Flash Drive', ref: 'TXN-005' },
      ];

      for (const txn of transactions) {
        await client.query(`
          INSERT INTO transactions (user_id, type, amount, description, reference_number)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (reference_number) DO NOTHING
        `, [txn.userId, txn.type, txn.amount, txn.description, txn.ref]);
      }
    }
    console.log('✓ Sample transactions created\n');

    console.log('========================================');
    console.log('✅ Database seeded successfully!');
    console.log('========================================\n');
    console.log('Test Accounts:');
    console.log('  Admin:   username: admin,     password: admin123');
    console.log('  Cashier: username: cashier1, password: cashier123');
    console.log('  Student: username: STU-2024-001, password: student123');
    console.log('  Student: username: STU-2024-002, password: student123');
    console.log('  Student: username: STU-2024-003, password: student123');
    console.log('');

  } catch (err) {
    console.error('❌ Seed error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

seedData()
  .then(() => {
    console.log('Seed completed!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
