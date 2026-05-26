// Node 18+ has global fetch
(async () => {
  try {
    const loginRes = await fetch('http://localhost:5000/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
    const loginData = await loginRes.json();
    console.log('login status', loginRes.status);
    if (!loginRes.ok) { console.log(loginData); return; }
    const token = loginData.token;

    const studentsRes = await fetch('http://localhost:5000/api/students', { headers: { Authorization: `Bearer ${token}` } });
    const students = await studentsRes.json();
    console.log('/api/students status', studentsRes.status, 'count', Array.isArray(students) ? students.length : 'err');
    console.log(students.slice ? students.slice(0,10) : students);

    const statsRes = await fetch('http://localhost:5000/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } });
    const stats = await statsRes.json();
    console.log('/api/dashboard/stats status', statsRes.status);
    console.log(stats);
  } catch (err) {
    console.error(err);
  }
})();
