import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from './services/api';

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ token: string }>('/auth/login', { email, password });
      if (res.success && res.data?.token) {
        localStorage.setItem('token', res.data.token);
        onLogin(res.data.token);
      } else {
        setError(res.error ?? 'ورود ناموفق بود');
      }
    } catch {
      setError('خطا در برقراری ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>پنل مدیریت</h1>
      <form onSubmit={submit}>
        <input placeholder="ایمیل" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        <input placeholder="رمز عبور" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        <button disabled={loading}>{loading ? 'در حال ورود...' : 'ورود'}</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/dashboard').then((res) => {
      if (res.success) setData(res.data);
      else setError(res.error ?? '');
    }).catch(() => setError('خطا در دریافت اطلاعات'));
  }, []);

  return (
    <div>
      <h1>داشبورد</h1>
      {error && <p className="error">{error}</p>}
      {data && (
        <div className="stats-grid">
          <StatCard label="کاربران" value={data.totalUsers} />
          <StatCard label="اشتراک‌های فعال" value={data.activeSubscriptions} />
          <StatCard label="درآمد کل" value={`${(data.totalRevenue ?? 0).toLocaleString('fa-IR')} تومان`} />
          <StatCard label="تیکت‌های باز" value={data.openTickets} />
        </div>
      )}
      {!data && !error && <p>در حال بارگذاری...</p>}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value ?? '—'}</span>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') ?? '');

  if (!token) return <Login onLogin={setToken} />;

  return (
    <div className="layout">
      <nav className="sidebar">
        <h2>پنل مدیریت</h2>
        <Link to="/">داشبورد</Link>
        <Link to="/orders">سفارش‌ها</Link>
        <Link to="/products">محصولات</Link>
        <Link to="/subscriptions">اشتراک‌ها</Link>
        <button onClick={() => { localStorage.removeItem('token'); setToken(''); }}>خروج</button>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
