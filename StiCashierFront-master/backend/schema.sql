-- =====================================================
-- STICashier Database Schema
-- Run this in PostgreSQL to create all tables
-- =====================================================

-- Drop existing tables (if needed for fresh install)
DROP TABLE IF EXISTS cart_items CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS receipts CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS fee_items CASCADE;
DROP TABLE IF EXISTS fees CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS students CASCADE;

-- =====================================================
-- USERS TABLE (System users - students and admins)
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'admin', 'cashier')),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    balance DECIMAL(10, 2) DEFAULT 0.00,
    student_id VARCHAR(20) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- STUDENTS TABLE (Student information)
-- =====================================================
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    student_number VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50),
    last_name VARCHAR(50) NOT NULL,
    suffix VARCHAR(10),
    gender VARCHAR(10),
    birthdate DATE,
    contact_number VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    guardian_name VARCHAR(100),
    guardian_contact VARCHAR(20),
    year_level VARCHAR(20),
    course VARCHAR(100),
    enrollment_status VARCHAR(20) DEFAULT 'active' CHECK (enrollment_status IN ('active', 'inactive', 'graduated', 'dropped')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- SUBJECTS TABLE (Available subjects/courses)
-- =====================================================
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    subject_code VARCHAR(20) UNIQUE NOT NULL,
    subject_name VARCHAR(100) NOT NULL,
    description TEXT,
    units INT DEFAULT 3,
    course VARCHAR(100),
    year_level VARCHAR(20),
    semester VARCHAR(20),
    lecture_hours INT DEFAULT 0,
    lab_hours INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ENROLLMENTS TABLE (Student course enrollments)
-- =====================================================
CREATE TABLE enrollments (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    subject_id INT REFERENCES subjects(id) ON DELETE CASCADE,
    enrollment_date DATE NOT NULL,
    semester VARCHAR(20) NOT NULL,
    school_year VARCHAR(20) NOT NULL,
    grade VARCHAR(10),
    status VARCHAR(20) DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'completed', 'dropped', 'failed')),
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, subject_id, semester, school_year)
);

-- =====================================================
-- FEES TABLE (Fee structures)
-- =====================================================
CREATE TABLE fees (
    id SERIAL PRIMARY KEY,
    fee_name VARCHAR(100) NOT NULL,
    description TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    fee_type VARCHAR(30) NOT NULL CHECK (fee_type IN ('tuition', 'miscellaneous', 'laboratory', 'assessment', 'other')),
    category VARCHAR(50),
    school_year VARCHAR(20),
    semester VARCHAR(20),
    is_required BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- FEE_ITEMS TABLE (Individual fee items per student)
-- =====================================================
CREATE TABLE fee_items (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    fee_id INT REFERENCES fees(id) ON DELETE CASCADE,
    enrollment_id INT REFERENCES enrollments(id) ON DELETE SET NULL,
    semester VARCHAR(20),
    school_year VARCHAR(20),
    amount DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0.00,
    waiver DECIMAL(10, 2) DEFAULT 0.00,
    balance DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'waived')),
    fee_type VARCHAR(30) DEFAULT 'miscellaneous',
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, fee_id, semester, school_year)
);

-- =====================================================
-- PAYMENTS TABLE (Payment records)
-- =====================================================
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(30) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'gcash', 'bank_transfer', 'check', 'installment')),
    payment_type VARCHAR(20) DEFAULT 'full' CHECK (payment_type IN ('full', 'partial', 'downpayment')),
    reference_number VARCHAR(50) UNIQUE,
    or_number VARCHAR(50) UNIQUE,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    received_by INT REFERENCES users(id),
    remarks TEXT,
    is_voided BOOLEAN DEFAULT false,
    void_reason TEXT,
    voided_by INT REFERENCES users(id),
    voided_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PAYMENT_DETAILS TABLE (Breakdown of payments per fee)
-- =====================================================
CREATE TABLE payment_details (
    id SERIAL PRIMARY KEY,
    payment_id INT REFERENCES payments(id) ON DELETE CASCADE,
    fee_item_id INT REFERENCES fee_items(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- RECEIPTS TABLE (Official receipts)
-- =====================================================
CREATE TABLE receipts (
    id SERIAL PRIMARY KEY,
    payment_id INT REFERENCES payments(id) ON DELETE CASCADE,
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    student_id INT REFERENCES students(id),
    student_name VARCHAR(150),
    total_amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(30),
    items_paid JSONB,
    issued_by INT REFERENCES users(id),
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PRODUCTS TABLE (Store products for cafeteria/store)
-- =====================================================
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    category VARCHAR(50),
    stock INT DEFAULT 0,
    image_url VARCHAR(255),
    barcode VARCHAR(50) UNIQUE,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TRANSACTIONS TABLE (Product purchase transactions)
-- =====================================================
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    student_id INT REFERENCES students(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('purchase', 'topup', 'refund', 'payment')),
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    reference_number VARCHAR(50) UNIQUE,
    items JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CART_ITEMS TABLE (Temporary cart storage)
-- =====================================================
CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    quantity INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- =====================================================
-- Create indexes for better performance
-- =====================================================
CREATE INDEX idx_students_user_id ON students(user_id);
CREATE INDEX idx_students_student_number ON students(student_number);
CREATE INDEX idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX idx_enrollments_subject_id ON enrollments(subject_id);
CREATE INDEX idx_fee_items_student_id ON fee_items(student_id);
CREATE INDEX idx_fee_items_fee_id ON fee_items(fee_id);
CREATE INDEX idx_payments_student_id ON payments(student_id);
CREATE INDEX idx_payments_reference ON payments(reference_number);
CREATE INDEX idx_payment_details_payment_id ON payment_details(payment_id);
CREATE INDEX idx_receipts_payment_id ON receipts(payment_id);
CREATE INDEX idx_receipts_student_id ON receipts(student_id);

-- =====================================================
-- Insert default admin user (password: admin123)
-- =====================================================
INSERT INTO users (username, password, role, full_name, email)
VALUES ('admin', '$2a$10$ZKQy5X8j5qHqWJ5qWJ5qHOqWJ5qWJ5qWJ5qWJ5qWJ5qWJ5qWJ5qWJ5', 'admin', 'System Administrator', 'admin@sti.edu');

-- =====================================================
-- Insert sample subjects
-- =====================================================
INSERT INTO subjects (subject_code, subject_name, description, units, course, year_level, semester) VALUES
('CS 101', 'Introduction to Programming', 'Basic programming concepts using Python', 3, 'BS Computer Science', '1st Year', '1st Semester'),
('CS 102', 'Data Structures', 'Arrays, linked lists, trees, and graphs', 3, 'BS Computer Science', '1st Year', '2nd Semester'),
('MATH 101', 'Calculus I', 'Differential calculus', 3, 'BS Computer Science', '1st Year', '1st Semester'),
('ENG 101', 'English Communication', 'Business and technical writing', 3, 'General', '1st Year', '1st Semester'),
('IT 101', 'Information Technology Fundamentals', 'Overview of IT industry', 3, 'BS Information Technology', '1st Year', '1st Semester');

-- =====================================================
-- Insert sample fees
-- =====================================================
INSERT INTO fees (fee_name, description, amount, fee_type, category, school_year, semester, is_required) VALUES
('Tuition Fee', 'Base tuition per unit', 200.00, 'tuition', 'Academic', '2024-2025', '1st Semester', true),
('Miscellaneous Fee', 'Library, laboratory, and other services', 300.00, 'miscellaneous', 'General', '2024-2025', '1st Semester', true),
('Computer Laboratory', 'Computer lab usage and maintenance', 150.00, 'laboratory', 'IT', '2024-2025', '1st Semester', true),
('Assessment Fee', 'Student assessment and testing', 100.00, 'assessment', 'Academic', '2024-2025', '1st Semester', true),
('ID Validation', 'Student ID validation', 50.00, 'other', 'Administrative', '2024-2025', '1st Semester', false),
('Athletic Fee', 'Sports and wellness programs', 75.00, 'miscellaneous', 'Athletics', '2024-2025', '1st Semester', true);

-- =====================================================
-- Insert sample products
-- =====================================================
INSERT INTO products (name, description, price, category, stock, barcode) VALUES
('Coffee', 'Hot brewed coffee', 35.00, 'Beverages', 100, '100001'),
('Sandwich', 'Ham and cheese sandwich', 55.00, 'Food', 50, '100002'),
('Water Bottle', 'Purified water 500ml', 20.00, 'Beverages', 200, '100003'),
('Chips', 'Regular size chips', 25.00, 'Snacks', 80, '100004'),
('Noodles', 'Instant cup noodles', 30.00, 'Food', 60, '100005');

COMMENT ON TABLE users IS 'System users for authentication (students, admins, cashiers)';
COMMENT ON TABLE students IS 'Student personal and academic information';
COMMENT ON TABLE subjects IS 'Available subjects and courses';
COMMENT ON TABLE enrollments IS 'Student subject enrollments';
COMMENT ON TABLE fees IS 'Fee structures and tuition rates';
COMMENT ON TABLE fee_items IS 'Individual fee assessments per student';
COMMENT ON TABLE payments IS 'Payment transactions';
COMMENT ON TABLE payment_details IS 'Payment breakdown per fee item';
COMMENT ON TABLE receipts IS 'Official receipts for payments';
COMMENT ON TABLE products IS 'Store products for cafeteria/canteen';
COMMENT ON TABLE transactions IS 'General transaction records';
