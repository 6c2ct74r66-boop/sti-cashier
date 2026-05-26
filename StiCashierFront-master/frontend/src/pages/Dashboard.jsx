import React, { useState, useEffect } from 'react';

// Shared helper used by multiple admin panels
function formatAmount(value) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? '0.00' : numberValue.toFixed(2);
}

import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ShoppingCart, History, Package, Users,
  Wallet, LogOut, Menu, X, Plus, Minus, Trash2, CreditCard,
  TrendingUp, AlertTriangle, RefreshCw, FileText, ClipboardList, Bookmark
} from 'lucide-react';

export default function Dashboard() {
  const { user, logout, updateUser, token } = useAuth();
  const isMountedRef = React.useRef(false);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('sti:lastActiveTab') || 'shop';
    } catch (e) {
      return 'shop';
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [topupAmount, setTopupAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardDetail, setDashboardDetail] = useState(null);
  const [appConfig, setAppConfig] = useState(null);

  useEffect(() => {
    if (!isMountedRef.current) {
      // initial load only: keep activeTab from localStorage
      isMountedRef.current = true;
      if (user?.role === 'cashier') {
        setActiveTab('students');
      }
      return;
    }

    if (user?.role === 'cashier') {
      setActiveTab('students');
    }
  }, [user]);

  // Persist tab so F5/refresh keeps user on where they left
  useEffect(() => {
    try {
      localStorage.setItem('sti:lastActiveTab', activeTab);
    } catch (e) {
      // ignore
    }
  }, [activeTab]);

  // Fetch dynamic app config lists
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/app/config', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        setAppConfig(data);
      } catch (err) {
        console.error('Failed to fetch app config:', err);
      }
    };
    fetchConfig();
  }, [token]);
  const [studentSearch, setStudentSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentFees, setStudentFees] = useState([]);

  const studentResultsSummary = {
    totalBalance: studentResults.reduce((sum, student) => sum + Number(student.balance || 0), 0),
    averageBalance: studentResults.length > 0 ? studentResults.reduce((sum, student) => sum + Number(student.balance || 0), 0) / studentResults.length : 0,
    distinctCourses: new Set(studentResults.map(student => student.course).filter(Boolean)).size,
  };

  const getStudentBalanceRisk = (balance) => {
    const amount = Number(balance || 0);
    if (amount <= 0) {
      return { label: 'No balance', badge: 'bg-red-100 text-red-700' };
    }
    if (amount < 1000) {
      return { label: 'Low balance', badge: 'bg-yellow-100 text-yellow-700' };
    }
    return { label: 'Healthy balance', badge: 'bg-green-100 text-green-700' };
  };

  const [studentPayments, setStudentPayments] = useState([]);
  const [studentEnrollments, setStudentEnrollments] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedSemester, setSelectedSemester] = useState('1st');
  const [selectedSchoolYear, setSelectedSchoolYear] = useState('2026-2027');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [selectedFeeItemIds, setSelectedFeeItemIds] = useState([]);
  const [loadingStudent, setLoadingStudent] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isCashier = user?.role === 'cashier';
  const canManageStudents = isAdmin || isCashier;

  const navItems = isAdmin
    ? [
        { id: 'shop', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'history', label: 'History', icon: History },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'users', label: 'Users', icon: Users }
      ]
    : isCashier
    ? [
        { id: 'students', label: 'Students', icon: Users },
        { id: 'history', label: 'History', icon: History }
      ]
    : [
        { id: 'shop', label: 'Shop', icon: LayoutDashboard },
        { id: 'cart', label: 'Cart', icon: ShoppingCart, badge: cart.length },
        { id: 'history', label: 'History', icon: History },
        { id: 'topup', label: 'Top-up', icon: Wallet }
      ];

  useEffect(() => {
    if (!canManageStudents) {
      fetchProducts();
      fetchCart();
    }
    if (activeTab === 'history') fetchTransactions();
    if (activeTab === 'students') fetchStudentResults();
    if (canManageStudents) fetchSubjects();
    if (isAdmin) fetchDashboardStats();
  }, [activeTab, canManageStudents, isAdmin]);

  useEffect(() => {
    if (selectedStudent) {
      fetchStudentFees(selectedStudent.id, selectedSemester, selectedSchoolYear);
    }
  }, [selectedStudent, selectedSemester, selectedSchoolYear]);

  // Keep dashboard detail/tab state stable: switching tabs should not force navigation
  // (fetches already happen inside effects based on activeTab).


  useEffect(() => {
    if (studentEnrollments.length > 0) {
      const latestEnrollment = studentEnrollments[0];
      setSelectedSemester(latestEnrollment.semester || '1st');
      setSelectedSchoolYear(latestEnrollment.school_year || selectedSchoolYear);
    }
  }, [studentEnrollments]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };


  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setProducts(data);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchCart = async () => {
    try {
      const res = await fetch('/api/cart', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setCart(data);
    } catch (err) {
      console.error('Error fetching cart:', err);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await fetch('/api/transactions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        console.error('Failed to fetch transactions:', res.status, res.statusText);
        setTransactions([]);
        return;
      }
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setTransactions([]);
    }
  };

  const fetchSubjects = async () => {
    try {
      const res = await fetch('/api/subjects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSubjects(data);
    } catch (err) {
      console.error('Error fetching subjects:', err);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch('/api/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setDashboardStats(data);
      } else {
        console.error('Dashboard stats error:', data.error);
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    }
  };

  const fetchStudentResults = async (options = {}) => {
    try {
      const query = new URLSearchParams();
      const searchTerm = options.search !== undefined ? options.search : studentSearch;
      const course = options.course !== undefined ? options.course : courseFilter;
      const yearLevel = options.year_level !== undefined ? options.year_level : yearFilter;
      const status = options.status !== undefined ? options.status : statusFilter;
      const archived = options.archived !== undefined ? options.archived : 'false';

      if (searchTerm.trim()) query.set('search', searchTerm.trim());
      if (course !== 'All') query.set('course', course);
      if (yearLevel !== 'All') query.set('year_level', yearLevel);
      if (status !== 'All') query.set('status', status);
      query.set('archived', archived);

      const res = await fetch(`/api/students?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMessage = data?.error || 'Failed to search students';
        showMessage('error', errorMessage);
        setStudentResults([]);
        return;
      }
      setStudentResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error searching students:', err);
      showMessage('error', 'Student search failed');
      setStudentResults([]);
    }
  };

  const handleDashboardCardClick = async (type) => {
    setDashboardDetail(type);

    if (type === 'students') {
      setActiveTab('students');
      setStudentSearch('');
      setCourseFilter('All');
      setYearFilter('All');
      setStatusFilter('All');
      setSelectedStudent(null);
      await fetchStudentResults({ search: '', course: 'All', year_level: 'All', status: 'All', archived: 'false' });
      return;
    }

    if (type === 'subjects') {
      await fetchSubjects();
      return;
    }

    if (type === 'enrollments' || type === 'pendingFees') {
      return;
    }

    if (type === 'collections' || type === 'todayCollections') {
      setActiveTab('history');
      await fetchTransactions();
      return;
    }
  };

  const fetchStudentDetails = async (studentId) => {
    try {
      setLoadingStudent(true);
      const res = await fetch(`/api/students/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMessage = data?.error || 'Failed to load student details';
        showMessage('error', errorMessage);
        return;
      }
      setSelectedStudent(data);
      setSelectedFeeItemIds([]);
      await Promise.all([
        fetchStudentPayments(studentId),
        fetchStudentEnrollments(studentId)
      ]);
    } catch (err) {
      console.error('Error fetching student:', err);
      showMessage('error', 'Student details failed to load');
    } finally {
      setLoadingStudent(false);
    }
  };

  const handleArchiveStudent = async (userId) => {
    if (!confirm('Archive this student?')) return;
    try {
      const res = await fetch(`/api/users/${userId}/archive`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ archived: true })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showMessage('error', data.error || 'Failed to archive student');
        return;
      }
      showMessage('success', 'Student archived');
      await fetchStudentResults();
    } catch (err) {
      console.error('Archive student error:', err);
      showMessage('error', 'Failed to archive student');
    }
  };

  const fetchStudentFees = async (studentId, semester = '', schoolYear = '') => {
    try {
      const query = [];
      if (semester) query.push(`semester=${encodeURIComponent(semester)}`);
      if (schoolYear) query.push(`school_year=${encodeURIComponent(schoolYear)}`);
      const queryString = query.length ? `?${query.join('&')}` : '';
      const res = await fetch(`/api/fee-items/student/${studentId}${queryString}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMessage = data?.error || 'Failed to load fee items';
        showMessage('error', errorMessage);
        setStudentFees([]);
        return;
      }
      setStudentFees(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching fee items:', err);
      showMessage('error', 'Fee items failed to load');
      setStudentFees([]);
    }
  };

  const fetchStudentPayments = async (studentId) => {
    try {
      const res = await fetch(`/api/payments?student_id=${studentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMessage = data?.error || 'Failed to load payments';
        showMessage('error', errorMessage);
        setStudentPayments([]);
        return;
      }
      setStudentPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching student payments:', err);
      showMessage('error', 'Student payments failed to load');
      setStudentPayments([]);
    }
  };

  const fetchStudentEnrollments = async (studentId) => {
    try {
      const res = await fetch(`/api/enrollments/student/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStudentEnrollments(data);
    } catch (err) {
      console.error('Error fetching student enrollments:', err);
    }
  };

  const handleStudentSearch = async (e) => {
    e.preventDefault();
    if (!studentSearch.trim() && courseFilter === 'All' && yearFilter === 'All' && statusFilter === 'All') {
      showMessage('error', 'Enter a student ID, name, or choose a filter');
      return;
    }
    setSelectedStudent(null);
    await fetchStudentResults();
  };

  const handleSelectFeeItem = (id) => {
    setSelectedFeeItemIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const dedupedStudentFees = (() => {
    const seen = new Set();
    return studentFees
      .filter(item => {
        const key = `${item.fee_name}|${item.fee_type}|${item.semester || ''}|${item.school_year || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  })();

  const unpaidSubjectFees = dedupedStudentFees
    .filter(item => item.fee_type === 'subject_tuition')
    .filter(item => item.payment_status !== 'paid' && Number(item.balance ?? 0) > 0);

  const paidSubjectFees = dedupedStudentFees
    .filter(item => item.fee_type === 'subject_tuition')
    .filter(item => item.payment_status === 'paid' || Number(item.balance ?? 0) <= 0);

  const selectedFeeTotal = dedupedStudentFees
    .filter(item => selectedFeeItemIds.includes(item.id))
    .reduce((sum, item) => sum + Number(item.balance ?? item.total_due ?? 0), 0);

  // Tuition includes both 'tuition' and 'subject_tuition' fees
  const tuitionTotal = dedupedStudentFees
    .filter(item => item.fee_type === 'tuition' || item.fee_type === 'subject_tuition')
    .reduce((sum, item) => sum + parseFloat(item.balance ?? 0), 0);

  // Miscellaneous excludes tuition and subject tuition
  const miscellaneousTotal = dedupedStudentFees
    .filter(item => item.fee_type !== 'tuition' && item.fee_type !== 'subject_tuition')
    .reduce((sum, item) => sum + parseFloat(item.balance ?? 0), 0);

  const outstandingTotal = dedupedStudentFees
    .reduce((sum, item) => sum + parseFloat(item.balance ?? 0), 0);

  const availableSubjects = subjects.filter(subject => {
    const subjectCourse = String(subject.course || '').trim().toLowerCase();
    const studentCourse = String(selectedStudent?.course || '').trim().toLowerCase();
    const subjectYear = String(subject.year_level || '').trim();
    const studentSemester = String(subject.semester || '').trim();
    const studentYear = String(selectedStudent?.year_level || '').trim();

    return (
      !studentEnrollments.some(enrollment => String(enrollment.subject_id) === String(subject.id))
      && subjectCourse === studentCourse
      && subjectYear === studentYear
      && studentSemester === String(selectedSemester)
    );
  });

  const availableSemesterOptions = Array.from(new Set([
    ...studentEnrollments.map(e => e.semester),
    ...studentFees.map(f => f.semester),
    selectedSemester
  ].filter(Boolean)));

  const availableSchoolYearOptions = Array.from(new Set([
    ...studentEnrollments.map(e => e.school_year),
    ...studentFees.map(f => f.school_year),
    selectedSchoolYear
  ].filter(Boolean))).sort((a, b) => {
    const aYear = Number(a.split('-')[0]);
    const bYear = Number(b.split('-')[0]);
    return bYear - aYear;
  });

  const transactionSummary = {
    total: transactions.reduce((sum, txn) => sum + Number(txn.amount || 0), 0),
    count: transactions.length,
    purchases: transactions.filter(txn => txn.type === 'purchase').length,
    topups: transactions.filter(txn => txn.type === 'topup').length,
  };

  const handleStudentPayment = async () => {
    if (!selectedStudent) {
      showMessage('error', 'Select a student first');
      return;
    }
    if (selectedFeeItemIds.length === 0) {
      showMessage('error', 'Select fee items to pay');
      return;
    }

    if (selectedFeeTotal <= 0) {
      showMessage('error', 'Selected fee items have no outstanding balance');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          student_id: selectedStudent.id,
          amount: selectedFeeTotal,
          payment_method: paymentMethod,
          payment_type: 'full',
          fee_item_ids: selectedFeeItemIds
        })
      });
      const data = await res.json();
      if (res.ok) {
        showMessage('success', `Payment received: ₱${selectedFeeTotal.toFixed(2)}`);
        await fetchStudentDetails(selectedStudent.id);
      } else {
        showMessage('error', data.error);
      }
    } catch (err) {
      showMessage('error', 'Payment failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAssessment = async () => {
    if (!selectedStudent) {
      showMessage('error', 'Select a student first');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/assessments/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          student_id: selectedStudent.id,
          semester: selectedSemester,
          school_year: selectedSchoolYear
        })
      });
      const data = await res.json();
      if (res.ok) {
        showMessage('success', 'Assessment generated successfully');
        await fetchStudentDetails(selectedStudent.id);
      } else {
        showMessage('error', data.error || 'Failed to generate assessment');
      }
    } catch (err) {
      showMessage('error', 'Assessment generation failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmEnrollment = async () => {
    if (!selectedStudent) {
      showMessage('error', 'Select a student first');
      return;
    }
    if (!selectedSubject) {
      showMessage('error', 'Select a subject to enroll');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          student_id: selectedStudent.id,
          subject_id: selectedSubject,
          enrollment_date: new Date().toISOString().slice(0, 10),
          semester: selectedSemester,
          school_year: selectedSchoolYear
        })
      });
      const data = await res.json();
      if (res.ok) {
        showMessage('success', 'Enrollment confirmed');
        await fetchStudentDetails(selectedStudent.id);
        setSelectedSubject(null);
      } else {
        showMessage('error', data.error || 'Enrollment failed');
      }
    } catch (err) {
      showMessage('error', 'Enrollment failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = async (productId) => {
    try {
      await fetch('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ productId, quantity: 1 })
      });
      fetchCart();
      showMessage('success', 'Added to cart!');
    } catch (err) {
      showMessage('error', 'Failed to add to cart');
    }
  };

  const updateCartQty = async (cartId, quantity) => {
    try {
      await fetch(`/api/cart/${cartId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ quantity })
      });
      fetchCart();
    } catch (err) {
      showMessage('error', 'Failed to update cart');
    }
  };

  const removeFromCart = async (cartId) => {
    try {
      await fetch(`/api/cart/${cartId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchCart();
    } catch (err) {
      showMessage('error', 'Failed to remove item');
    }
  };

  const handleTopup = async (e) => {
    e.preventDefault();
    if (!topupAmount || parseFloat(topupAmount) <= 0) {
      showMessage('error', 'Please enter a valid amount');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/transactions/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: parseFloat(topupAmount) })
      });
      const data = await res.json();
      if (res.ok) {
        updateUser({ balance: data.newBalance });
        showMessage('success', `Successfully added ₱${topupAmount}!`);
        setTopupAmount('');
      } else {
        showMessage('error', data.error);
      }
    } catch (err) {
      showMessage('error', 'Top-up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showMessage('error', 'Cart is empty');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/transactions/purchase', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        updateUser({ balance: data.newBalance });
        fetchCart();
        fetchTransactions();
        showMessage('success', 'Purchase successful!');
      } else {
        showMessage('error', data.error);
      }
    } catch (err) {
      showMessage('error', 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  const filteredProducts = selectedCategory === 'All' ? products : products.filter(p => p.category === selectedCategory);
  const groupedProducts = categories.reduce((acc, cat) => {
    acc[cat] = products.filter(p => p.category === cat);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
              <img src="/sti-logo.png" alt="STI" className="w-10 h-10" />
              <div>
                <h1 className="font-bold text-sti-blue">STI Cashier</h1>
                <p className="text-xs text-gray-500">{user?.full_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="bg-sti-gold text-white px-3 py-2 rounded-lg font-semibold text-sm">
                {user?.role?.toUpperCase()}
              </div>
              <button onClick={logout} className="p-2 hover:bg-gray-100 rounded-lg" title="Logout">
                <LogOut className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className={`${mobileMenuOpen ? 'block' : 'hidden'} lg:block fixed lg:static inset-0 lg:inset-4 lg:px-0 w-full lg:w-64`}>
            <nav className="bg-white rounded-xl shadow-sm p-2 space-y-1">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${activeTab === item.id
                      ? 'bg-sti-blue text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="ml-auto bg-sti-gold text-white text-xs px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1">
            {/* Message Toast */}
            {message.text && (
              <div className={`mb-4 px-4 py-3 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                {message.type === 'success' ? <TrendingUp className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                {message.text}
              </div>
            )}

            {/* Dashboard Tab */}
            {activeTab === 'shop' && (
              <div>
                {isAdmin ? (
                  dashboardStats ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                        <div
                          onClick={async () => {
                            setActiveTab('students');
                            setStudentSearch('');
                            setCourseFilter('All');
                            setYearFilter('All');
                            setStatusFilter('All');
                            setSelectedStudent(null);
                            await fetchStudentResults({ search: '', course: 'All', year_level: 'All', status: 'All', archived: 'false' });
                          }}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer bg-white rounded-xl shadow-sm p-6 transition hover:shadow-lg hover:border-sti-blue"
                        >
                          <p className="text-sm text-gray-500">Active Students</p>
                          <p className="text-3xl font-bold text-sti-blue mt-2">{dashboardStats.totalStudents}</p>
                          <p className="text-xs text-sti-blue mt-2">Click to view active students</p>
                        </div>
                        <div
                          onClick={() => handleDashboardCardClick('subjects')}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer bg-white rounded-xl shadow-sm p-6 transition hover:shadow-lg hover:border-sti-blue"
                        >
                          <p className="text-sm text-gray-500">Active Subjects</p>
                          <p className="text-3xl font-bold text-sti-blue mt-2">{dashboardStats.totalSubjects}</p>
                          <p className="text-xs text-sti-blue mt-2">Click to view subjects</p>
                        </div>
                        <div
                          onClick={() => handleDashboardCardClick('enrollments')}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer bg-white rounded-xl shadow-sm p-6 transition hover:shadow-lg hover:border-sti-blue"
                        >
                          <p className="text-sm text-gray-500">Enrolled Records</p>
                          <p className="text-3xl font-bold text-sti-blue mt-2">{dashboardStats.totalEnrollments}</p>
                          <p className="text-xs text-sti-blue mt-2">Click to view enrollment details</p>
                        </div>
                        <div
                          onClick={() => handleDashboardCardClick('pendingFees')}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer bg-white rounded-xl shadow-sm p-6 transition hover:shadow-lg hover:border-sti-blue"
                        >
                          <p className="text-sm text-gray-500">Pending Fees</p>
                          <p className="text-3xl font-bold text-sti-blue mt-2">{dashboardStats.pendingFees}</p>
                          <p className="text-xs text-sti-blue mt-2">Click to view fee status breakdown</p>
                        </div>
                        <div
                          onClick={() => handleDashboardCardClick('collections')}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer bg-white rounded-xl shadow-sm p-6 transition hover:shadow-lg hover:border-sti-blue"
                        >
                          <p className="text-sm text-gray-500">Total Collections</p>
                          <p className="text-3xl font-bold text-sti-blue mt-2">₱{Number(dashboardStats.totalCollections ?? 0).toFixed(2)}</p>
                          <p className="text-xs text-sti-blue mt-2">Click to view transaction history</p>
                        </div>
                        <div
                          onClick={() => handleDashboardCardClick('todayCollections')}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer bg-white rounded-xl shadow-sm p-6 transition hover:shadow-lg hover:border-sti-blue"
                        >
                          <p className="text-sm text-gray-500">Today's Collections</p>
                          <p className="text-3xl font-bold text-sti-blue mt-2">₱{Number(dashboardStats.todayCollections ?? 0).toFixed(2)}</p>
                          <p className="text-xs text-sti-blue mt-2">Click to view today's collections</p>
                        </div>
                      </div>

                      {dashboardDetail === 'students' && (
                        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-800">Active Students</h3>
                              <p className="text-sm text-gray-500">Showing current active students from the student list.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDashboardDetail(null)}
                              className="text-sm text-sti-blue hover:underline"
                            >
                              Close
                            </button>
                          </div>
                          {studentResults.length > 0 ? (
                            <div className="grid gap-3">
                              {studentResults.slice(0, 6).map(student => (
                                <div key={student.id} className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                                  <p className="font-semibold text-gray-800">{student.first_name} {student.last_name}</p>
                                  <p className="text-sm text-gray-500">{student.student_number} • {student.course} • Year {student.year_level}</p>
                                </div>
                              ))}
                              {studentResults.length > 6 && (
                                <p className="text-sm text-gray-500">Displaying first 6 active students. Use the Students tab for the full list.</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No active students loaded yet. Click the card again or use the Students tab to refresh.</p>
                          )}
                        </div>
                      )}

                      {dashboardDetail === 'subjects' && (
                        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-800">Subject Catalog</h3>
                              <p className="text-sm text-gray-500">Active subjects loaded from the backend.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDashboardDetail(null)}
                              className="text-sm text-sti-blue hover:underline"
                            >
                              Close
                            </button>
                          </div>
                          {subjects.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {subjects.slice(0, 8).map(subject => (
                                <div key={subject.id} className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                                  <p className="font-semibold text-gray-800">{subject.subject_code}</p>
                                  <p className="text-sm text-gray-500">{subject.subject_name}</p>
                                  <p className="text-xs text-gray-500 mt-2">{subject.course} • Year {subject.year_level} • {subject.semester}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No subjects loaded yet. Click the Active Subjects card again to fetch them.</p>
                          )}
                        </div>
                      )}

                      {dashboardDetail === 'enrollments' && (
                        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-800">Enrollment Details</h3>
                              <p className="text-sm text-gray-500">Summary of current enrollment status counts.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDashboardDetail(null)}
                              className="text-sm text-sti-blue hover:underline"
                            >
                              Close
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {Object.entries(dashboardStats.enrollmentStatusCounts || {}).map(([status, count]) => (
                              <div key={status} className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                                <p className="text-sm text-gray-500 uppercase tracking-[.2em]">{status.replace('_', ' ')}</p>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">{count}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {dashboardDetail === 'pendingFees' && (
                        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-800">Fee Status Breakdown</h3>
                              <p className="text-sm text-gray-500">Current count of pending, partial, and paid fee items.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDashboardDetail(null)}
                              className="text-sm text-sti-blue hover:underline"
                            >
                              Close
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {['pending', 'partial', 'paid'].map(status => (
                              <div key={status} className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                                <p className="text-sm text-gray-500 uppercase tracking-[.2em]">{status}</p>
                                <p className="mt-2 text-2xl font-semibold text-gray-900">{dashboardStats.feeStatusCounts?.[status] ?? 0}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                          <h3 className="text-lg font-semibold text-gray-800 mb-4">Fee Item Status</h3>
                          <div className="space-y-2">
                            {['pending', 'partial', 'paid'].map(status => (
                              <div key={status} className="flex items-center justify-between gap-4">
                                <span className="capitalize text-gray-700">{status}</span>
                                <span className="font-semibold text-sti-blue">{dashboardStats.feeStatusCounts?.[status] ?? 0}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm p-6">
                          <h3 className="text-lg font-semibold text-gray-800 mb-4">Enrollment Payment Status</h3>
                          <div className="space-y-2">
                            {Object.entries(dashboardStats.enrollmentStatusCounts || {}).map(([status, count]) => (
                              <div key={status} className="flex items-center justify-between gap-4">
                                <span className="capitalize text-gray-700">{status.replace('_', ' ')}</span>
                                <span className="font-semibold text-sti-blue">{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-white rounded-xl shadow-sm p-6">
                      <h2 className="text-xl font-bold text-gray-800 mb-3">Loading dashboard...</h2>
                      <p className="text-sm text-gray-500">Fetching admin summary data.</p>
                    </div>
                  )
                ) : (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 mb-6">
                      <div className="rounded-3xl bg-white p-6 shadow-sm">
                        <h2 className="text-2xl font-bold text-gray-900">Shop</h2>
                        <p className="mt-2 text-sm text-gray-500">Browse available products and add items to your cart.</p>
                      </div>
                      <div className="rounded-3xl bg-white p-6 shadow-sm">
                        <p className="text-sm text-gray-500">Current Balance</p>
                        <p className="mt-3 text-3xl font-bold">₱{formatAmount(user?.balance)}</p>
                        <p className="mt-2 text-sm text-gray-500">Your balance is used for purchases in the cart.</p>
                      </div>
                    </div>

                    <div className="bg-white rounded-3xl shadow-sm p-6">
                      <div className="flex flex-wrap items-center gap-3 mb-6">
                        <button
                          type="button"
                          onClick={() => setSelectedCategory('All')}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedCategory === 'All' ? 'bg-sti-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                        >
                          All
                        </button>
                        {categories.map(category => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setSelectedCategory(category)}
                            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedCategory === category ? 'bg-sti-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                          >
                            {category}
                          </button>
                        ))}
                      </div>

                      {filteredProducts.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                          <p>No products available yet.</p>
                        </div>
                      ) : (
                        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                          {filteredProducts.map(product => (
                            <div key={product.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <p className="text-sm text-gray-500">{product.category || 'Product'}</p>
                                  <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
                                </div>
                                <span className="text-sm font-semibold text-sti-blue">₱{formatAmount(product.price)}</span>
                              </div>
                              <p className="text-sm text-gray-600 mb-4 min-h-[3rem]">{product.description || 'No description available.'}</p>
                              <div className="flex items-center justify-between gap-4">
                                <span className={`px-3 py-1 rounded-full text-sm ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => addToCart(product.id)}
                                  disabled={product.stock <= 0}
                                  className="rounded-2xl bg-sti-blue px-4 py-2 text-sm font-semibold text-white hover:bg-sti-dark disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Add to cart
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Cart Tab */}
            {activeTab === 'cart' && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6">Your Cart</h2>
                {cart.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Your cart is empty</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4 mb-6">
                      {cart.map(item => (
                        <div key={item.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                          <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                            <Package className="w-8 h-8 text-gray-400" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold">{item.name}</h4>
                            <p className="text-sti-blue font-bold">₱{formatAmount(item.price)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateCartQty(item.id, item.quantity - 1)}
                              className="w-8 h-8 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-8 text-center font-semibold">{item.quantity}</span>
                            <button
                              onClick={() => updateCartQty(item.id, item.quantity + 1)}
                              className="w-8 h-8 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-lg font-semibold">Total:</span>
                        <span className="text-2xl font-bold text-sti-blue">₱{cartTotal.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={handleCheckout}
                        disabled={loading || Number(user?.balance || 0) < cartTotal}
                        className="w-full bg-sti-gold text-white py-4 rounded-xl font-bold text-lg hover:bg-yellow-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <CreditCard className="w-5 h-5" />
                        )}
                        Checkout
                      </button>
                      {Number(user?.balance || 0) < cartTotal && (
                        <p className="text-red-500 text-sm text-center mt-2">
                          Insufficient balance. Please top-up.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">Transaction History</h2>
                    <p className="text-sm text-gray-500 mt-1">A cleaner view of purchases and top-ups.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Total Transactions</p>
                    <p className="text-2xl font-bold text-gray-900">{transactionSummary.count}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Total Amount</p>
                    <p className="text-2xl font-bold text-gray-900">₱{formatAmount(transactionSummary.total)}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Purchases / Top-ups</p>
                    <p className="text-2xl font-bold text-gray-900">{transactionSummary.purchases} / {transactionSummary.topups}</p>
                  </div>
                </div>

                {selectedTransaction && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
                    <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                      <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-gray-900 truncate">Transaction Details</h3>
                          <p className="text-xs text-gray-500 mt-1">
                            {selectedTransaction.created_at
                              ? new Date(selectedTransaction.created_at).toLocaleString()
                              : '-'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedTransaction(null)}
                          className="p-2 rounded-lg hover:bg-gray-100"
                          aria-label="Close"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="p-5 space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            selectedTransaction.type === 'purchase' || selectedTransaction.type === 'refund'
                              ? 'bg-red-100 text-red-700'
                              : selectedTransaction.type === 'topup'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                          }`}>
                            {String(selectedTransaction.type || '').toUpperCase()}
                          </span>
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                            Ref: {selectedTransaction.reference_number || '-'}
                          </span>
                        </div>

                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-[0.12em]">Student</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {selectedTransaction.student_name || selectedTransaction.user_name || '-'}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-[0.12em]">Description</p>
                          <p className="text-sm text-gray-700 mt-1">{selectedTransaction.description || '-'}</p>
                        </div>

                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-[0.12em]">Payment Method</p>
                          <p className="text-sm text-gray-700 mt-1">
                            {selectedTransaction.payment_method
                              ? selectedTransaction.payment_method.toUpperCase().replace(/-/g, ' ')
                              : '-'}
                          </p>
                        </div>

                        <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 p-4">
                          <p className="text-sm text-gray-600">Amount</p>
                          <p className={`text-lg font-bold ${
                            selectedTransaction.type === 'purchase' || selectedTransaction.type === 'refund'
                              ? 'text-red-700'
                              : 'text-green-700'
                          }`}>
                            {((selectedTransaction.type === 'purchase' || selectedTransaction.type === 'refund') ? '-' : '+')}
                            ₱{formatAmount(selectedTransaction.amount)}
                          </p>
                        </div>
                      </div>

                      <div className="p-5 border-t border-gray-100 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedTransaction(null)}
                          className="px-4 py-2 rounded-lg bg-sti-blue text-white hover:bg-sti-dark"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {transactions.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Mobile/desktop-friendly list instead of wide table */}
                    {transactions.map(txn => {
                      const isPurchase = txn.type === 'purchase' || txn.type === 'refund';
                      const isTopup = txn.type === 'topup';
                      const badgeClass = isPurchase
                        ? 'bg-red-100 text-red-700'
                        : isTopup
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700';

                      const sign = isPurchase ? '-' : '+';
                      const amountText = `₱${formatAmount(txn.amount)}`;
                      const paymentLabel = txn.payment_method ? txn.payment_method.toUpperCase().replace(/-/g, ' ') : '-';
                      const studentLabel = txn.student_name || txn.user_name || '-';
                      const descriptionLabel = txn.description || '-';

                      return (
                        <div
                          key={txn.id}
                          className="rounded-2xl border border-gray-100 bg-gray-50 hover:bg-white transition p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-3">
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
                                  {String(txn.type || '').toUpperCase()}
                                </span>
                                <p className="text-sm text-gray-600">
                                  {txn.created_at ? new Date(txn.created_at).toLocaleString() : '-'}
                                </p>
                              </div>

                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedTransaction(txn)}
                                  className="text-left w-full text-sm font-semibold text-gray-900 truncate hover:underline"
                                >
                                  {studentLabel}
                                </button>
                                <p className="text-xs text-gray-500 mt-1 truncate">{descriptionLabel}</p>
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                <span className="inline-flex items-center px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-600">
                                  Method: {paymentLabel}
                                </span>
                                <span className="inline-flex items-center px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-600">
                                  Ref: {txn.reference_number || '-'}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-xs text-gray-500">Amount</p>
                              <p className={`mt-1 text-lg font-bold ${isPurchase ? 'text-red-700' : 'text-green-700'}`}>
                                {sign}{amountText}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'students' && (
              <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
                <div className="flex flex-col lg:flex-row gap-4 lg:items-end justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">Student Payment Details</h2>
                    <p className="text-sm text-gray-500 mt-1">Search, review balances, and process student payments.</p>
                  </div>
                  <form onSubmit={handleStudentSearch} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 w-full lg:w-auto">
                    <input
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sti-blue outline-none"
                      placeholder="Enter student ID or name"
                    />
                    <button type="submit" className="bg-sti-blue text-white rounded-lg px-6 py-3 hover:bg-sti-dark transition">
                      Search
                    </button>
                    <button type="button" onClick={async () => { setStudentSearch(''); setCourseFilter('All'); setYearFilter('All'); setStatusFilter('All'); await fetchStudentResults(); }} className="bg-white border border-gray-300 text-gray-700 rounded-lg px-4 py-3 hover:bg-gray-100 transition">
                    
                    </button>
                  </form>
                </div>

                {studentResults.length > 0 && !selectedStudent && (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">Search Results</h3>
                        <p className="text-sm text-gray-500">{studentResults.length} student(s) found</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
                        <label className="block">
                          <span className="text-xs text-gray-500 uppercase">Course</span>
                          <select
                            value={courseFilter}
                            onChange={async (e) => {
                              setCourseFilter(e.target.value);
                              if (studentSearch.trim() || e.target.value !== 'All' || yearFilter !== 'All' || statusFilter !== 'All') {
                                await fetchStudentResults();
                              }
                            }}
                            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
                          >
                            <option value="All">All</option>
                            {(appConfig?.courses?.length
                              ? appConfig.courses
                              : Array.from(new Set(studentResults.map(s => s.course).filter(Boolean))).sort()
                            ).map(course => (
                              <option key={course} value={course}>{course}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500 uppercase">Year</span>
                          <select
                            value={yearFilter}
                            onChange={async (e) => {
                              setYearFilter(e.target.value);
                              if (studentSearch.trim() || courseFilter !== 'All' || e.target.value !== 'All' || statusFilter !== 'All') {
                                await fetchStudentResults();
                              }
                            }}
                            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
                          >
                            <option value="All">All</option>
                            {(appConfig?.years?.length ? appConfig.years : Array.from(new Set(studentResults.map(s => String(s.year_level)).filter(Boolean))).sort((a, b) => Number(a) - Number(b))).map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500 uppercase">Status</span>
                          <select
                            value={statusFilter}
                            onChange={async (e) => {
                              setStatusFilter(e.target.value);
                              if (studentSearch.trim() || courseFilter !== 'All' || yearFilter !== 'All' || e.target.value !== 'All') {
                                await fetchStudentResults();
                              }
                            }}
                            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
                          >
                            <option value="All">All</option>
                            {(appConfig?.enrollment_statuses?.length ? appConfig.enrollment_statuses : Array.from(new Set(studentResults.map(s => s.enrollment_status).filter(Boolean))).sort()).map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-3xl border border-gray-200 bg-gray-50 p-4">
                      <div className="rounded-2xl bg-white p-4 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase">Total Students</p>
                        <p className="mt-2 text-2xl font-semibold text-gray-900">{studentResults.length}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase">Total Balance</p>
                        <p className="mt-2 text-2xl font-semibold text-gray-900">₱{formatAmount(studentResultsSummary.totalBalance)}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase">Avg. Balance</p>
                        <p className="mt-2 text-2xl font-semibold text-gray-900">₱{formatAmount(studentResultsSummary.averageBalance)}</p>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {studentResults.map(student => {
                        const risk = getStudentBalanceRisk(student.balance);
                        return (
                          <div
                            key={student.id}
                            className="text-left p-4 rounded-2xl border border-gray-200 hover:border-sti-blue hover:bg-gray-50 transition flex items-start justify-between gap-4"
                          >
                            <div className="flex-1 cursor-pointer" onClick={() => fetchStudentDetails(student.id)}>
                              <p className="font-semibold text-gray-800">{student.first_name} {student.last_name}</p>
                              <p className="text-xs text-gray-500">{student.student_number} • {student.course} • Year {student.year_level}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${risk.badge}`}>{risk.label}</span>
                              <span className="text-sm font-semibold text-gray-900">₱{formatAmount(student.balance)}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleArchiveStudent(student.user_id); }}
                                className="text-red-500 text-sm mt-2"
                              >
                                Archive
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedStudent && (
                  <div className="space-y-6">
                    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                      <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6 space-y-5">
                        <div className="flex items-start gap-4">
                          <div className="w-16 h-16 rounded-2xl bg-sti-blue/10 flex items-center justify-center text-sti-blue">
                            <Bookmark className="w-7 h-7" />
                          </div>
                          <div>
                            <p className="text-sm uppercase tracking-[.3em] text-gray-500">Student Information</p>
                            <h3 className="text-xl font-semibold text-gray-900 mt-2">{selectedStudent.first_name} {selectedStudent.last_name}</h3>
                            <p className="text-sm text-gray-500">{selectedStudent.course} • Year {selectedStudent.year_level}</p>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-white p-4 border">
                            <p className="text-xs text-gray-500 uppercase">Student ID</p>
                            <p className="font-semibold mt-2">{selectedStudent.student_number}</p>
                          </div>
                          <div className="rounded-2xl bg-white p-4 border">
                            <p className="text-xs text-gray-500 uppercase">Email</p>
                            <p className="font-semibold mt-2 break-words">{selectedStudent.email || selectedStudent.user_email || 'N/A'}</p>
                          </div>
                          <div className="rounded-2xl bg-white p-4 border">
                            <p className="text-xs text-gray-500 uppercase">Contact</p>
                            <p className="font-semibold mt-2">{selectedStudent.contact_number || 'N/A'}</p>
                          </div>
                          <div className="rounded-2xl bg-white p-4 border">
                            <p className="text-xs text-gray-500 uppercase">Guardian</p>
                            <p className="font-semibold mt-2">{selectedStudent.guardian_name || 'N/A'}</p>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-white p-4 border">
                            <p className="text-xs text-gray-500 uppercase">Semester</p>
                            <select
                              value={selectedSemester}
                              onChange={(e) => setSelectedSemester(e.target.value)}
                              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2"
                            >
                              {availableSemesterOptions.length > 0 ? (
                                availableSemesterOptions.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))
                              ) : (
                                <>
                                  <option value="1st">1st</option>
                                  <option value="2nd">2nd</option>
                                </>
                              )}
                            </select>
                          </div>
                          <div className="rounded-2xl bg-white p-4 border">
                            <p className="text-xs text-gray-500 uppercase">School Year</p>
                            <select
                              value={selectedSchoolYear}
                              onChange={(e) => setSelectedSchoolYear(e.target.value)}
                              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2"
                            >
                              {availableSchoolYearOptions.length > 0 ? (
                                availableSchoolYearOptions.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))
                              ) : (
                                <>
                                  <option value="2024-2025">2024-2025</option>
                                  <option value="2025-2026">2025-2026</option>
                                  <option value="2026-2027">2026-2027</option>
                                  <option value="2027-2028">2027-2028</option>
                                </>
                              )}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-gray-100 bg-white p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-[.3em]">Actions</p>
                            <h3 className="text-xl font-semibold text-gray-900 mt-2">Student Management</h3>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <button
                            onClick={() => {
                              setSelectedStudent(null);
                              setStudentFees([]);
                              setStudentPayments([]);
                              setStudentEnrollments([]);
                              setSelectedFeeItemIds([]);
                              setStudentSearch('');
                            }}
                            className="w-full bg-gray-100 text-gray-700 rounded-2xl py-3 px-4 hover:bg-gray-200 transition font-semibold"
                          >
                            🔍 Search Another Student
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-100 bg-white p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-[.3em]">Balance Details</p>
                          <h3 className="text-xl font-semibold text-gray-900 mt-2">Outstanding Amount</h3>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${selectedStudent.enrollment_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {selectedStudent.enrollment_status?.toUpperCase() || 'ACTIVE'}
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
                          <p className="text-sm text-gray-500">Total Tuition</p>
                          <p className="font-semibold text-gray-900">₱{tuitionTotal.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
                          <p className="text-sm text-gray-500">Miscellaneous Fees</p>
                          <p className="font-semibold text-gray-900">₱{miscellaneousTotal.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-sti-blue text-white p-4">
                          <p className="text-sm font-semibold">Total Balance</p>
                          <p className="text-xl font-bold">₱{outstandingTotal.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                      <div className="rounded-3xl border border-gray-100 bg-white p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-[.3em]">Student Subjects Overview</p>
                            <h3 className="text-xl font-semibold text-gray-900 mt-2">Enrolled Subjects</h3>
                          </div>
                          <span className="text-sm text-gray-600">{studentEnrollments.length} enrolled</span>
                        </div>
                        {studentEnrollments.length === 0 ? (
                          <p className="text-sm text-gray-500">No enrolled subjects found for this student.</p>
                        ) : (
                          <div className="space-y-3">
                            {studentEnrollments.slice(0, 5).map(enrollment => (
                              <div key={enrollment.id} className="rounded-2xl bg-gray-50 p-4 border">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-gray-900">{enrollment.subject_code}</p>
                                    <p className="text-sm text-gray-500">{enrollment.subject_name}</p>
                                  </div>
                                  <span className="text-xs uppercase tracking-[.2em] text-gray-500">{enrollment.semester}</span>
                                </div>
                                <p className="mt-2 text-sm text-gray-500">{enrollment.year_level} • {enrollment.course}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-3xl border border-gray-100 bg-white p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-[.3em]">Upcoming Subjects</p>
                            <h3 className="text-xl font-semibold text-gray-900 mt-2">Available for Enrollment</h3>
                          </div>
                          <span className="text-sm text-gray-600">{availableSubjects.length} available</span>
                        </div>
                        {availableSubjects.length === 0 ? (
                          <p className="text-sm text-gray-500">No upcoming subjects available for this student.</p>
                        ) : (
                          <div className="space-y-3">
                            {availableSubjects.slice(0, 5).map(subject => (
                              <div key={subject.id} className="rounded-2xl bg-gray-50 p-4 border">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-gray-900">{subject.subject_code}</p>
                                    <p className="text-sm text-gray-500">{subject.subject_name}</p>
                                  </div>
                                  <span className="text-xs uppercase tracking-[.2em] text-gray-500">{subject.units} units</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
                      <div className="rounded-3xl border border-gray-100 bg-white p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-[.3em]">Subjects for Payment Processing</p>
                            <h3 className="text-xl font-semibold text-gray-900 mt-2">Subjects Enrolled (To Pay)</h3>
                          </div>
                          <FileText className="w-6 h-6 text-sti-blue" />
                        </div>

                        {/* Subject Enrollment Fees */}
                        {dedupedStudentFees.filter(f => f.fee_type === 'subject_tuition').length === 0 ? (
                          <p className="text-sm text-gray-500">No enrolled subjects assigned for payment.</p>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-xs uppercase font-semibold text-gray-600 bg-red-50 px-3 py-2 rounded-lg">Unpaid Subjects</p>
                            {unpaidSubjectFees.length === 0 ? (
                              <p className="text-sm text-gray-500">No unpaid subject fees found.</p>
                            ) : unpaidSubjectFees.map(item => (
                              <label key={item.id} className="flex items-start justify-between gap-4 p-4 rounded-2xl border bg-gray-50 hover:bg-gray-100 transition">
                                <div className="flex-1">
                                  <p className="font-semibold text-gray-900">{item.subject_code} - {item.subject_name}</p>
                                  <p className="text-xs text-gray-500 mt-1">{item.units} units • Balance: ₱{formatAmount(item.balance)}</p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                      item.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
                                      item.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {item.payment_status?.toUpperCase() || 'PENDING'}
                                    </span>
                                    {item.balance > 0 && (
                                      <span className="text-xs text-gray-600">Balance: ₱{formatAmount(item.balance)}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="font-semibold text-lg">₱{formatAmount(item.balance)}</span>
                                  <input
                                    type="checkbox"
                                    checked={selectedFeeItemIds.includes(item.id)}
                                    onChange={() => handleSelectFeeItem(item.id)}
                                    className="w-5 h-5 text-sti-blue"
                                  />
                                </div>
                              </label>
                            ))}
                            {paidSubjectFees.length > 0 && (
                              <>
                                <p className="text-xs uppercase font-semibold text-gray-600 bg-green-50 px-3 py-2 rounded-lg mt-4">Paid Subjects</p>
                                {paidSubjectFees.map(item => (
                                  <div key={item.id} className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-green-200 bg-green-50">
                                    <div className="flex-1">
                                      <p className="font-semibold text-gray-900">{item.subject_code} - {item.subject_name}</p>
                                      <p className="text-xs text-gray-500 mt-1">{item.units} units • Balance: ₱{formatAmount(item.balance)}</p>
                                      <span className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 mt-2">PAID</span>
                                    </div>
                                    <span className="font-semibold text-lg text-green-700">₱{formatAmount(item.balance)}</span>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        )}

                        {/* Other Institutional Fees */}
                        {dedupedStudentFees.filter(f => f.fee_type !== 'subject_tuition' && f.fee_type).length > 0 && (
                          <div className="mt-6 pt-6 border-t">
                            <p className="text-xs uppercase font-semibold text-gray-600 bg-blue-50 px-3 py-2 rounded-lg">Other Fees</p>
                            <div className="space-y-3 mt-3">
                              {dedupedStudentFees.filter(f => f.fee_type !== 'subject_tuition').map(item => (
                                <label key={item.id} className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-gray-50">
                                  <div>
                                    <p className="font-semibold text-gray-900">{item.fee_name}</p>
                                    <p className="text-sm text-gray-500">{item.fee_type?.replace(/_/g, ' ') || 'Fee'}</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-semibold">₱{formatAmount(item.balance)}</span>
                                    <input
                                      type="checkbox"
                                      checked={selectedFeeItemIds.includes(item.id)}
                                      onChange={() => handleSelectFeeItem(item.id)}
                                      className="w-5 h-5 text-sti-blue"
                                    />
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mt-6 rounded-3xl bg-sti-blue/5 p-4">
                          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                            <span>Selected Items</span>
                            <span>{selectedFeeItemIds.length} items</span>
                          </div>
                          <div className="flex items-center justify-between text-base font-semibold text-gray-900">
                            <span>Payment Summary</span>
                            <span>₱{selectedFeeTotal.toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-3">
                          <label className="block text-sm font-medium text-gray-700">Payment Method</label>
                          <div className="grid grid-cols-3 gap-2">
                            {['cash', 'gcash', 'bank-transfer'].map(method => (
                              <button
                                key={method}
                                type="button"
                                onClick={() => setPaymentMethod(method)}
                                className={`rounded-2xl py-3 text-sm font-semibold transition ${paymentMethod === method ? 'bg-sti-blue text-white' : 'bg-white border border-gray-200 text-gray-700'}`}
                              >
                                {method === 'cash' ? 'Cash' : method === 'gcash' ? 'GCash' : 'Bank'}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={handleStudentPayment}
                            disabled={loading || selectedFeeItemIds.length === 0}
                            className="w-full rounded-2xl bg-sti-gold py-4 text-white font-semibold hover:bg-yellow-500 transition disabled:opacity-50"
                          >
                            {loading ? 'Processing...' : `Pay ₱${selectedFeeTotal.toFixed(2)}`}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-[.3em]">Confirm Enrollment</p>
                            <h3 className="text-xl font-semibold text-gray-900 mt-2">New Subject</h3>
                          </div>
                          <ClipboardList className="w-6 h-6 text-sti-blue" />
                        </div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">Select Subject</label>
                        <select
                          value={selectedSubject || ''}
                          onChange={(e) => setSelectedSubject(e.target.value)}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3"
                        >
                          <option value="">Choose a subject</option>
                          {availableSubjects.map(subject => (
                            <option key={subject.id} value={subject.id}>
                              {subject.subject_code} — {subject.subject_name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleConfirmEnrollment}
                          disabled={!selectedSubject || loading}
                          className="mt-6 w-full rounded-2xl bg-sti-blue py-3 text-white font-semibold hover:bg-sti-dark transition disabled:opacity-50"
                        >
                          Confirm Enrollment
                        </button>
                        <button
                          type="button"
                          onClick={handleGenerateAssessment}
                          disabled={loading}
                          className="mt-3 w-full rounded-2xl border border-sti-blue bg-white py-3 text-sti-blue font-semibold hover:bg-blue-50 transition disabled:opacity-50"
                        >
                          Generate Assessment for {selectedSemester} {selectedSchoolYear}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-100 bg-white p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-[.3em]">Payment History</p>
                          <h3 className="text-xl font-semibold text-gray-900 mt-2">Recent Transactions</h3>
                        </div>
                        <span className="text-sm text-gray-600">{studentPayments.length} record(s)</span>
                      </div>
                      {studentPayments.length === 0 ? (
                        <p className="text-sm text-gray-500">No payments have been recorded for this student.</p>
                      ) : (
                        <div className="space-y-3">
                          {studentPayments.slice(0, 5).map(payment => (
                            <div key={payment.id} className="rounded-2xl bg-gray-50 p-4 border flex items-center justify-between gap-4">
                              <div>
                                <p className="font-semibold text-gray-900">{payment.payment_method?.toUpperCase()}</p>
                                <p className="text-sm text-gray-500">{new Date(payment.transaction_date).toLocaleDateString()}</p>
                              </div>
                              <span className="font-semibold text-gray-900">₱{formatAmount(payment.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Top-up Tab */}
            {activeTab === 'topup' && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6">Top-up Balance</h2>
                <div className="max-w-md mx-auto">
                  <div className="bg-gradient-to-r from-sti-blue to-sti-dark rounded-xl p-6 text-white mb-6">
                    <p className="text-sm opacity-80">Current Balance</p>
                    <p className="text-4xl font-bold">₱{formatAmount(user?.balance)}</p>
                  </div>
                  <form onSubmit={handleTopup} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                      <input
                        type="number"
                        value={topupAmount}
                        onChange={(e) => setTopupAmount(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sti-blue text-lg"
                        placeholder="Enter amount"
                        min="1"
                        step="0.01"
                        required
                      />
                    </div>
                    <div className="flex gap-2">
                      {[100, 500, 1000, 2000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setTopupAmount(amt.toString())}
                          className="flex-1 py-2 border border-sti-blue text-sti-blue rounded-lg hover:bg-sti-blue hover:text-white transition"
                        >
                          ₱{amt}
                        </button>
                      ))}
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-sti-gold text-white py-4 rounded-xl font-bold text-lg hover:bg-yellow-500 transition disabled:opacity-50"
                    >
                      {loading ? 'Processing...' : 'Top-up'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Admin: Products Tab */}
            {activeTab === 'products' && <AdminProducts products={products} token={token} refresh={fetchProducts} showMessage={showMessage} />}

            {/* Admin: Users Tab */}
            {activeTab === 'users' && (
              <ErrorBoundary>
                <AdminUsers token={token} showMessage={showMessage} />
              </ErrorBoundary>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// Error boundary to catch render errors in admin panels
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || String(this.state.error) || 'An unknown error occurred.';
      const stack = this.state.error?.stack ? this.state.error.stack.split('\n').slice(0, 3).join(' / ') : null;
      return (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Something went wrong</h3>
          <p className="text-sm text-gray-500 mb-3">An error occurred loading this panel.</p>
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            <div><strong>Error:</strong> {message}</div>
            {stack && <div className="mt-2 text-xs text-red-600">{stack}</div>}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Admin Products Component
function AdminProducts({ products, token, refresh, showMessage }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', category: '', stock: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/products/${editingId}` : '/api/products';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, price: parseFloat(form.price), stock: parseInt(form.stock) })
      });
      if (res.ok) {
        showMessage('success', editingId ? 'Product updated!' : 'Product created!');
        setForm({ name: '', description: '', price: '', category: '', stock: '' });
        setEditingId(null);
        setShowForm(false);
        refresh();
      }
    } catch (err) {
      showMessage('error', 'Failed to save product');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Archive this product?')) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    refresh();
    showMessage('success', 'Product archived');
  };

  const editProduct = (p) => {
    setForm({ name: p.name, description: p.description || '', price: p.price, category: p.category, stock: p.stock });
    setEditingId(p.id);
    setShowForm(true);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">Manage Products</h2>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', description: '', price: '', category: '', stock: '' }); }}
          className="bg-sti-blue text-white px-4 py-2 rounded-lg hover:bg-sti-dark">
          + Add Product
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg mb-6 grid grid-cols-2 gap-4">
          <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded" required />
          <input placeholder="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="px-3 py-2 border rounded" required />
          <input placeholder="Price" type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="px-3 py-2 border rounded" required />
          <input placeholder="Stock" type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="px-3 py-2 border rounded" required />
          <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="px-3 py-2 border rounded col-span-2" />
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="bg-sti-blue text-white px-4 py-2 rounded">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-500 text-sm border-b">
              <th className="pb-3">Name</th>
              <th className="pb-3">Category</th>
              <th className="pb-3">Price</th>
              <th className="pb-3">Stock</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-b">
                <td className="py-3">{p.name}</td>
                <td className="py-3">{p.category}</td>
                <td className="py-3 font-bold">₱{formatAmount(p.price)}</td>
                <td className="py-3">
                  <span className={p.stock < 10 ? 'text-red-500 font-semibold' : ''}>{p.stock}</span>
                </td>
                <td className="py-3">
                  <button onClick={() => editProduct(p)} className="text-sti-blue mr-3">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-red-500">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Admin Users Component
function AdminUsers({ token, showMessage }) {
  const [users, setUsers] = useState([]);
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', role: 'student', fullName: '', email: '', studentId: '' });
  const [registerError, setRegisterError] = useState('');
  const [error, setError] = useState(null);

  const [selectedUser, setSelectedUser] = useState(null);
  const openUserModal = (u) => setSelectedUser(u);
  const closeUserModal = () => setSelectedUser(null);

  const fetchUsers = async () => {
    try {
      const [activeRes, archivedRes] = await Promise.all([
        fetch('/api/users?archived=false', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/users?archived=true', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const activeData = await activeRes.json();
      const archivedData = await archivedRes.json();

      if (!activeRes.ok || !archivedRes.ok) {
        const message = activeData?.error || archivedData?.error || 'Failed to load users';
        showMessage('error', message);
        setUsers([]);
        setArchivedUsers([]);
        setError(message);
        return;
      }

      setError(null);
      setUsers(Array.isArray(activeData) ? activeData : []);
      setArchivedUsers(Array.isArray(archivedData) ? archivedData : []);
    } catch (err) {
      console.error('Error fetching users:', err);
      showMessage('error', 'Failed to load users');
      setError('Failed to load users');
      setUsers([]);
      setArchivedUsers([]);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Backend expects: { username, password, role, fullName, email, studentId, initialBalance? }
      const payload = {
        username: form.username,
        password: form.password,
        role: form.role,
        fullName: form.fullName,
        email: form.email,
        studentId: form.studentId,

        // extra fields for student profile (optional)
        contact_number: form.contact_number,
        gender: form.gender,
        birthdate: form.birthdate,
        address: form.address,
        guardian_name: form.guardian_name,
        guardian_contact: form.guardian_contact,
        year_level: form.year_level,
        course: form.course,
        semester: form.semester,
      };

      const res = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setRegisterError('');
        showMessage('success', 'User created!');
        setForm({ username: '', password: '', role: 'student', fullName: '', email: '', studentId: '' });
        setShowForm(false);
        // After creating a student user, refresh data.
        // Students list is already refreshed by activeTab effects, so we only refresh users here.
        await fetchUsers();
      } else {
        console.error('Register failed:', { status: res.status, data });
        setRegisterError(data?.error || `Failed to create user (HTTP ${res.status})`);
        showMessage('error', data?.error || `Failed to create user (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error('Create user error:', err);
      showMessage('error', 'Failed to create user');
    }
  };

  const handleArchive = async (id, archive = true) => {
    if (!confirm(`${archive ? 'Archive' : 'Restore'} this user?`)) return;

    const res = await fetch(`/api/users/${id}/archive`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ archived: archive })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showMessage('error', data.error || 'Failed to update user archive status');
      return;
    }

    fetchUsers();
    showMessage('success', `User ${archive ? 'archived' : 'restored'}`);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">Manage Users</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-sti-blue text-white px-4 py-2 rounded-lg hover:bg-sti-dark">
          Create User
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg mb-6 grid grid-cols-2 gap-4">
          <input placeholder="Username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="px-3 py-2 border rounded" required />
          <input placeholder="Password" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="px-3 py-2 border rounded" required />
          <input placeholder="Full Name" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} className="px-3 py-2 border rounded" required />
          <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border rounded" />
        <input placeholder="Student ID" value={form.studentId} onChange={e => setForm({ ...form, studentId: e.target.value })} className="px-3 py-2 border rounded" required />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="px-3 py-2 border rounded">
            <option value="student">Student</option>
            <option value="admin">Admin</option>
          </select>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="bg-sti-blue text-white px-4 py-2 rounded">Create User</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
          </div>
        </form>
      )}

      {registerError && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {registerError}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {users.length === 0 ? (
          <div className="text-sm text-gray-500">No active users found.</div>
        ) : (
          users.map(u => {
            const role = String(u?.role || 'unknown').toLowerCase();
            const roleLabel = String(u?.role || 'UNKNOWN').toUpperCase();
            return (
              <div
                key={u?.id ?? Math.random()}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-4 hover:bg-white transition flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openUserModal(u)}
                    className="text-sm font-semibold text-gray-900 truncate hover:underline text-left"
                  >
                    {u?.full_name || 'Unknown Name'}
                  </button>
                  <p className="text-xs text-gray-500 mt-1 truncate">@{u?.username || 'Unknown Username'}</p>
                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        role === 'admin' ? 'bg-sti-gold text-white' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {roleLabel}
                    </span>
                    <span className="text-xs text-gray-600">
                      Balance: <span className="font-semibold">₱{formatAmount(u?.balance)}</span>
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  <button
                    onClick={() => handleArchive(u?.id, true)}
                    className="text-sm font-semibold text-red-600 hover:underline"
                  >
                    Archive
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 truncate">{selectedUser.full_name || 'User Details'}</h3>
                <p className="text-xs text-gray-500 mt-1">@{selectedUser.username || 'unknown'}</p>
              </div>
              <button
                type="button"
                onClick={closeUserModal}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    String(selectedUser.role || '').toLowerCase() === 'admin'
                      ? 'bg-sti-gold text-white'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {String(selectedUser.role || '').toUpperCase() || 'UNKNOWN'}
                </span>
                <span className="text-xs text-gray-600">
                  Balance: <span className="font-semibold">₱{formatAmount(selectedUser.balance)}</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 uppercase">User ID</p>
                  <p className="mt-1 text-sm font-semibold">{selectedUser.id}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 uppercase">Student ID</p>
                  <p className="mt-1 text-sm font-semibold">{selectedUser.student_id || 'N/A'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 uppercase">Email</p>
                  <p className="mt-1 text-sm font-semibold break-words">{selectedUser.email || 'N/A'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 uppercase">Created</p>
                  <p className="mt-1 text-sm font-semibold">
                    {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeUserModal}
                  className="px-4 py-2 rounded-lg bg-sti-blue text-white hover:bg-sti-dark font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      <div className="mt-8 bg-gray-50 rounded-xl p-6 border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Archived Users</h3>
          <span className="text-sm text-gray-500">{archivedUsers.length} archived</span>
        </div>
        {archivedUsers.length === 0 ? (
          <div className="text-sm text-gray-600">No archived users yet.</div>
        ) : (
        <div className="space-y-3">
          {archivedUsers.map(u => {
            const role = String(u?.role || 'unknown').toLowerCase();
            const roleLabel = String(u?.role || 'UNKNOWN').toUpperCase();
            return (
              <div
                key={u?.id ?? Math.random()}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-4 hover:bg-white transition flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openUserModal(u)}
                    className="text-sm font-semibold text-gray-900 truncate hover:underline text-left"
                  >
                    {u?.full_name || 'Unknown Name'}
                  </button>
                  <p className="text-xs text-gray-500 mt-1 truncate">@{u?.username || 'Unknown Username'}</p>

                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        role === 'admin' ? 'bg-sti-gold text-white' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {roleLabel}
                    </span>
                    <span className="text-xs text-gray-600">
                      Balance: <span className="font-semibold">₱{formatAmount(u?.balance)}</span>
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  <button
                    onClick={() => handleArchive(u?.id, false)}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Restore
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
