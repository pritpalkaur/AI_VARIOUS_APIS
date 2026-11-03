import { Navigate, Route, Routes } from 'react-router';
import NavBar from './components/NavBar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import ProductForm from './pages/ProductForm.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import OrderForm from './pages/OrderForm.jsx';

const guard = (element, requireAdmin = false) => <ProtectedRoute requireAdmin={requireAdmin}>{element}</ProtectedRoute>;

export default function App() {
  return (
    <>
      <NavBar />
      <main className="container">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route path="/products" element={guard(<ProductsPage />)} />
          <Route path="/products/new" element={guard(<ProductForm />, true)} />
          <Route path="/products/:id/edit" element={guard(<ProductForm />, true)} />

          <Route path="/orders" element={guard(<OrdersPage />)} />
          <Route path="/orders/new" element={guard(<OrderForm />)} />
          <Route path="/orders/:id/edit" element={guard(<OrderForm />)} />

          <Route path="*" element={<Navigate to="/products" replace />} />
        </Routes>
      </main>
    </>
  );
}
