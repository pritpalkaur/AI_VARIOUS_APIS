// Shapes of the shared JSON envelope and of the resources returned by the services.

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string };
}

export type Role = 'Admin' | 'User';

export interface User {
  id: number;
  username: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface AuthResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  expiresAt: string;
  user: User;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Page<T> {
  items: T[];
  pagination: Pagination;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  description: string | null;
  price: number;
  stock: number;
}

export const ORDER_STATUSES = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: number;
  productId: number;
  productName: string;
  userId: number;
  username: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: OrderStatus;
  orderDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderInput {
  productId: number;
  quantity: number;
  status: OrderStatus;
  orderDate: string;
}

export interface SortState {
  sortBy: string;
  sortDir: 'asc' | 'desc';
}
