import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards';

// Pages are lazy-loaded: each one is its own small bundle, downloaded on first visit.
export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./pages/register.page').then((m) => m.RegisterPage) },

  { path: 'products', canActivate: [authGuard], loadComponent: () => import('./pages/products.page').then((m) => m.ProductsPage) },
  { path: 'products/new', canActivate: [adminGuard], loadComponent: () => import('./pages/product-form.page').then((m) => m.ProductFormPage) },
  { path: 'products/:id/edit', canActivate: [adminGuard], loadComponent: () => import('./pages/product-form.page').then((m) => m.ProductFormPage) },

  { path: 'orders', canActivate: [authGuard], loadComponent: () => import('./pages/orders.page').then((m) => m.OrdersPage) },
  { path: 'orders/new', canActivate: [authGuard], loadComponent: () => import('./pages/order-form.page').then((m) => m.OrderFormPage) },
  { path: 'orders/:id/edit', canActivate: [authGuard], loadComponent: () => import('./pages/order-form.page').then((m) => m.OrderFormPage) },

  { path: '', pathMatch: 'full', redirectTo: 'products' },
  { path: '**', redirectTo: 'products' },
];
