import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import Alert from '../components/Alert.jsx';

function validate({ username, password }) {
  const errors = {};
  if (!username.trim()) errors.username = 'Username is required.';
  if (!password) errors.password = 'Password is required.';
  return errors;
}

export default function LoginPage() {
  const { login, isAuthenticated, notice, clearNotice } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={location.state?.from ?? '/products'} replace />;
  }

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await login(form.username.trim(), form.password);
      // isAuthenticated flips to true and the <Navigate> above takes over.
    } catch (err) {
      setServerError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <h1>Log in</h1>
        <Alert type="info" onClose={clearNotice}>{notice}</Alert>
        <Alert type="success">{location.state?.flash}</Alert>
        <Alert type="error">{serverError}</Alert>

        <label>
          Username
          <input autoComplete="username" value={form.username} onChange={update('username')} autoFocus />
          {errors.username && <span className="field-error">{errors.username}</span>}
        </label>

        <label>
          Password
          <input type="password" autoComplete="current-password" value={form.password} onChange={update('password')} />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
        <p className="muted center">
          No account? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  );
}
