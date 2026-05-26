import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Phone, Smartphone, AlertCircle, Check, Clock } from 'lucide-react';

export default function EnrollmentDashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [studentData, setStudentData] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [feeItems, setFeeItems] = useState([]);
  const [studentPayments, setStudentPayments] = useState([]);
  const [selectedFeeItemIds, setSelectedFeeItemIds] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('gcash');
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (user && token && user.role === 'student') {
      fetchMyStudentDashboard();
    }
  }, [user, token]);

  const fetchMyStudentDashboard = async () => {
    if (!token) return;

    setLoadingDashboard(true);
    try {
      const res = await fetch('/api/me/student', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Failed to load student dashboard:', data?.error);
        return;
      }
      setStudentData(data.student);
      setEnrollments(Array.isArray(data.enrollments) ? data.enrollments : []);
      setFeeItems(Array.isArray(data.feeItems) ? data.feeItems : []);
      setStudentPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch (err) {
      console.error('Error fetching student dashboard:', err);
    } finally {
      setLoadingDashboard(false);
    }
  };

  const fetchStudentPayments = async (studentId) => {
    try {
      const res = await fetch(`/api/payments?student_id=${studentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setStudentPayments(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching student payments:', err);
    }
  };

  const handleOnlinePayment = async () => {
    if (selectedFeeItemIds.length === 0) {
      setMessage({ type: 'error', text: 'Select fee items to pay' });
      return;
    }

    const selectedGroups = dedupedFeeItems.filter(item => selectedFeeItemIds.includes(item.groupKey));
    const selectedIds = selectedGroups.flatMap(item => item.fee_item_ids || [item.id]);
    const selectedAmount = selectedGroups.reduce((sum, item) => sum + Number(item.balance ?? 0), 0);

    if (selectedAmount <= 0) {
      setMessage({ type: 'error', text: 'Selected fee items have no outstanding balance' });
      return;
    }

    setLoadingDashboard(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          student_id: studentData?.id,
          amount: selectedAmount,
          payment_method: selectedPaymentMethod,
          payment_type: 'full',
          fee_item_ids: selectedIds
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Payment recorded: ₱${Number(data.amount).toFixed(2)}` });
        
        // Immediately remove paid items from display
        setFeeItems(prev => 
          prev.map(item => {
            if (selectedIds.includes(item.id)) {
              return { ...item, balance: '0.00' };
            }
            return item;
          })
        );
        
        setSelectedFeeItemIds([]);
        // Refresh data from backend to ensure sync
        await new Promise(resolve => setTimeout(resolve, 500));
        await fetchMyStudentDashboard();
      } else {
        setMessage({ type: 'error', text: data.error || 'Payment failed' });
      }
    } catch (err) {
      console.error('Error submitting payment:', err);
      setMessage({ type: 'error', text: 'Payment failed' });
    } finally {
      setLoadingDashboard(false);
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'Paid') {
      return <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
        <Check className="w-3 h-3" /> Paid
      </span>;
    } else if (status === 'Pending') {
      return <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full flex items-center gap-1">
        <Clock className="w-3 h-3" /> Pending
      </span>;
    }
    return null;
  };

  const parseSchoolYear = (schoolYear) => {
    const year = Number((schoolYear || '').toString().split('-')[0]);
    return Number.isFinite(year) ? year : 0;
  };

  const getSemesterRank = (semester) => {
    const sem = String(semester || '').toLowerCase();
    if (sem.includes('1st') || sem.includes('first')) return 1;
    if (sem.includes('2nd') || sem.includes('second')) return 2;
    if (sem.includes('summer')) return 3;
    return 99;
  };

  const dedupedFeeItems = (() => {
    const grouped = new Map();
    feeItems
      .filter(item => Number(item.balance ?? 0) > 0)
      .forEach(item => {
        const key = `${item.fee_name}|${item.fee_type}|${item.semester || ''}|${item.school_year || ''}`;
        const balance = Number(item.balance ?? 0);
        const amount_paid = Number(item.amount_paid ?? 0);

        if (!grouped.has(key)) {
          grouped.set(key, {
            ...item,
            groupKey: key,
            balance,
            amount_paid,
            fee_item_ids: [item.id]
          });
        } else {
          const existing = grouped.get(key);
          existing.balance = Number(existing.balance || 0) + balance;
          existing.amount_paid = Number(existing.amount_paid || 0) + amount_paid;
          existing.fee_item_ids = [...new Set([...(existing.fee_item_ids || []), item.id])];
        }
      });

    return Array.from(grouped.values());
  })();

  const semesterGroups = Array.from(
    new Map(
      [...enrollments, ...dedupedFeeItems].map((item) => {
        const semester = item?.semester || '';
        const school_year = item?.school_year || '';
        const key = `${semester}||${school_year}`;
        return [key, { semester, school_year }];
      })
    ).values()
  ).sort((a, b) => {
    const yearDiff = parseSchoolYear(b.school_year) - parseSchoolYear(a.school_year);
    if (yearDiff !== 0) return yearDiff;
    return getSemesterRank(b.semester) - getSemesterRank(a.semester);
  });

  const currentSemesterGroup = semesterGroups[0] || null;
  const nextSemesterGroup = semesterGroups[1] || null;

  const currentEnrollments = currentSemesterGroup
    ? enrollments.filter(e => e.semester === currentSemesterGroup.semester && e.school_year === currentSemesterGroup.school_year)
    : [];

  const currentFeeItems = currentSemesterGroup
    ? dedupedFeeItems.filter(fi => fi.semester === currentSemesterGroup.semester && fi.school_year === currentSemesterGroup.school_year)
    : [];

  const nextSemesterFeeItems = nextSemesterGroup
    ? dedupedFeeItems.filter(fi => fi.semester === nextSemesterGroup.semester && fi.school_year === nextSemesterGroup.school_year)
    : [];

  const currentTuition = currentFeeItems
    .filter(item => item.fee_type === 'tuition' || item.fee_type === 'subject_tuition')
    .reduce((sum, item) => sum + Number(item.balance ?? 0), 0);

  const currentMiscellaneous = currentFeeItems
    .filter(item => item.fee_type !== 'tuition' && item.fee_type !== 'subject_tuition')
    .reduce((sum, item) => sum + Number(item.balance ?? 0), 0);

  const nextSemesterTotal = nextSemesterFeeItems
    .reduce((sum, item) => sum + Number(item.total_due ?? item.amount ?? 0), 0);

  const outstandingBalance = dedupedFeeItems.reduce((sum, item) => sum + Number(item.balance ?? 0), 0);

  const currentSemesterLabel = currentSemesterGroup ? `${currentSemesterGroup.semester} ${currentSemesterGroup.school_year}` : 'No current semester data';
  const nextSemesterLabel = nextSemesterGroup ? `${nextSemesterGroup.semester} ${nextSemesterGroup.school_year}` : 'No upcoming semester';
  const currentDueItems = currentFeeItems.filter(item => Number(item.balance ?? 0) > 0);
  const selectedFeeTotal = selectedFeeItemIds
    .map(key => dedupedFeeItems.find(item => item.groupKey === key))
    .filter(Boolean)
    .reduce((sum, item) => sum + Number(item.balance ?? item.total_due ?? 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">STI Cashier System</h1>
            <p className="text-sm text-gray-500">Student Enrollment Portal</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.full_name}</span>
            <button
              onClick={logout}
              className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-1">Welcome, {studentData?.first_name || user?.full_name || 'Student'}!</h2>
          <p className="text-gray-500 text-sm">{studentData?.student_number ? `ID: ${studentData.student_number}` : user?.email || 'Student Portal'}{studentData?.student_number ? ` • ${currentSemesterLabel}` : ''}</p>
        </div>
        {loadingDashboard && !studentData && (
          <div className="mb-6 rounded-lg bg-white p-4 text-sm text-gray-600 shadow-sm">
            Loading your enrollment dashboard...
          </div>
        )}
        {message?.text && (
          <div className={`mb-6 rounded-lg p-4 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message.text}
          </div>
        )}

        {/* Fee Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500">
            <p className="text-gray-500 text-sm font-medium mb-2">CURRENT SEMESTER</p>
            <p className="text-2xl font-bold text-gray-900">{currentSemesterLabel}</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-indigo-500">
            <p className="text-gray-500 text-sm font-medium mb-2">CURRENT TUITION DUE</p>
            <p className="text-2xl font-bold text-gray-900">₱{currentTuition.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-500">
            <p className="text-gray-500 text-sm font-medium mb-2">NEXT SEMESTER ESTIMATE</p>
            <p className="text-2xl font-bold text-gray-900">₱{nextSemesterTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-red-500">
            <p className="text-gray-500 text-sm font-medium mb-2">OUTSTANDING BALANCE</p>
            <p className="text-2xl font-bold text-red-600">₱{outstandingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* Current Enrolled Subjects */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Current Enrolled Subjects</h3>
          {currentEnrollments.length === 0 ? (
            <p className="text-sm text-gray-500">You have no active enrollments for the current semester.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Code</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Subject</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700 text-sm">Units</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Semester</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">School Year</th>
                  </tr>
                </thead>
                <tbody>
                  {currentEnrollments.map((subject) => (
                    <tr key={subject.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                      <td className="py-3 px-4 text-gray-800">{subject.subject_code}</td>
                      <td className="py-3 px-4 text-gray-800">{subject.subject_name}</td>
                      <td className="py-3 px-4 text-center text-gray-800">{subject.units}</td>
                      <td className="py-3 px-4 text-gray-800">{subject.semester}</td>
                      <td className="py-3 px-4 text-gray-800">{subject.school_year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Next Semester Fee Breakdown */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Next Semester Fee Breakdown</h3>
              <p className="text-sm text-gray-500">{nextSemesterLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-gray-500">Estimated Total</p>
              <p className="text-2xl font-bold text-gray-900">₱{nextSemesterTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          {nextSemesterFeeItems.length === 0 ? (
            <p className="text-sm text-gray-500">No fee items are available yet for the next semester.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Fee</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Type</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Amount</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {nextSemesterFeeItems.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                      <td className="py-3 px-4 text-gray-800">{item.fee_name || item.subject_name || 'Fee Item'}</td>
                      <td className="py-3 px-4 text-gray-800">{item.fee_type}</td>
                      <td className="py-3 px-4 text-right text-gray-900">₱{Number(item.total_due ?? item.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-right text-red-600">₱{Number(item.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Pay Current Invoice</h3>
              <p className="text-sm text-gray-500">Select unpaid fee items for the current semester and submit payment online.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{currentDueItems.length} due item(s)</span>
              {currentDueItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedFeeItemIds.length === currentDueItems.length) {
                      setSelectedFeeItemIds([]);
                    } else {
                      setSelectedFeeItemIds(currentDueItems.map(item => item.groupKey));
                    }
                  }}
                  className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                >
                  {selectedFeeItemIds.length === currentDueItems.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
          </div>

          {currentDueItems.length === 0 ? (
            <p className="text-sm text-gray-500">No unpaid fee items are available for the current semester.</p>
          ) : (
            <div className="space-y-4">
              {currentDueItems.map(item => (
                <label key={item.groupKey} className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <p className="font-semibold text-gray-900">{item.fee_name || item.subject_name || 'Fee Item'}</p>
                    <p className="text-sm text-gray-500">{item.fee_type?.replace(/_/g, ' ') || 'Fee'} • {item.semester} {item.school_year}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">₱{Number(item.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <input
                      type="checkbox"
                      checked={selectedFeeItemIds.includes(item.groupKey)}
                      onChange={() => setSelectedFeeItemIds(prev =>
                        prev.includes(item.groupKey) ? prev.filter(i => i !== item.groupKey) : [...prev, item.groupKey]
                      )}
                      className="w-5 h-5 text-sti-blue"
                    />
                  </div>
                </label>
              ))}

              <div className="grid gap-3">
                <div className="grid grid-cols-3 gap-2">
                  {['gcash', 'bank_transfer'].map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setSelectedPaymentMethod(method)}
                      className={`rounded-2xl py-3 text-sm font-semibold transition ${selectedPaymentMethod === method ? 'bg-sti-blue text-white' : 'bg-white border border-gray-200 text-gray-700'}`}
                    >
                      {method === 'gcash' ? 'GCash' : 'Bank Transfer'}
                    </button>
                  ))}
                </div>

                <div className="rounded-3xl bg-sti-blue/5 p-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                    <span>Selected Fees</span>
                    <span>{selectedFeeItemIds.length} item(s)</span>
                  </div>
                  <div className="flex items-center justify-between text-lg font-semibold text-gray-900">
                    <span>Total to Pay</span>
                    <span>₱{selectedFeeTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOnlinePayment}
                  disabled={loadingDashboard || selectedFeeItemIds.length === 0}
                  className="w-full rounded-2xl bg-sti-gold py-4 text-white font-semibold hover:bg-yellow-500 transition disabled:opacity-50"
                >
                  {loadingDashboard ? 'Processing...' : `Pay Online ₱${selectedFeeTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Need Help?</p>
            <p>For payment inquiries or issues, contact the Registrar's Office at (555) 123-4567 or visit the cashier in Building A, Room 101.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
