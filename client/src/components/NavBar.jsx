import { NavLink, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';

export default function NavBar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <nav className="navbar-inner">
        <span className="brand">Store Admin</span>
        <NavLink to="/products">Products</NavLink>
        <NavLink to="/orders">Orders</NavLink>
        <span className="spacer" />
        <span className="user">
          {user.username} <span className={`badge badge-${user.role.toLowerCase()}`}>{user.role}</span>
        </span>
        <button type="button" className="btn btn-ghost" onClick={handleLogout}>
          Log out
        </button>
      </nav>
    </header>
  );
}
