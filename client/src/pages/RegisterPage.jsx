import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { authApi } from '../api/authApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import Alert from '../components/Alert.jsx';

// Mirrors the Auth Service rules so most mistakes are caught before the request.
function validate({ username, email, password, confirm }) {
  const errors = {};
  const name = username.trim();
  if (!name) errors.username = 'Username is required.';
  else if (name.length < 3 || name.length > 50) errors.username = 'Username must be 3–50 characters.';
  else if (!/^[A-Za-z0-9_.-]+$/.test(name)) errors.username = "Only letters, digits, '_', '.' and '-' are allowed.";

  const mail = email.trim();
  if (!mail) errors.email = 'Email is required.';
  else if (mail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) errors.email = 'Enter a valid email address.';

  if (!password) errors.password = 'Password is required.';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (new TextEncoder().encode(password).length > 72) errors.password = 'Password must be at most 72 bytes.';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Password needs at least one letter and one digit.';

  if (confirm !== password) errors.confirm = 'Passwords do not match.';
  return errors;
}

export default function RegisterPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/products" replace />;

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await authApi.register({ username: form.username.trim(), email: form.email.trim(), password: form.password });
      navigate('/login', { state: { flash: 'Account created. You can log in now.' } });
    } catch (err) {
      if (err.code === 'USERNAME_TAKEN') setErrors({ username: err.message });
      else if (err.code === 'EMAIL_TAKEN') setErrors({ email: err.message });
      else setServerError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <h1>Create account</h1>
        <Alert type="error">{serverError}</Alert>

        <label>
          Username
          <input autoComplete="username" value={form.username} onChange={update('username')} autoFocus />
          {errors.username && <span className="field-error">{errors.username}</span>}
        </label>
        <label>
          Email
          <input type="email" autoComplete="email" value={form.email} onChange={update('email')} />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
        <label>
          Password
          <input type="password" autoComplete="new-password" value={form.password} onChange={update('password')} />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>
        <label>
          Confirm password
          <input type="password" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} />
          {errors.confirm && <span className="field-error">{errors.confirm}</span>}
        </label>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
        <p className="muted center">
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
