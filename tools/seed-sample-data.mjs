// Seeds sample data through the API gateway, so every record goes through the real services:
// passwords get BCrypt hashes (AuthDb), products are validated (ProductApiDb), and orders get
// their product name/price snapshot from the Product API (OrderApiDb).
//
// Usage (all services + gateway running):
//   node tools/seed-sample-data.mjs
//
// Products are created as an existing Admin (default alice / Secret123; override with
// SEED_ADMIN_USER / SEED_ADMIN_PASSWORD). Safe to re-run: existing users and products are
// reused; orders are only added for customers who have none yet.

const GATEWAY = process.env.SEED_GATEWAY_URL ?? 'http://localhost:5000';
const ADMIN_USER = process.env.SEED_ADMIN_USER ?? 'alice';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Secret123';
const CUSTOMER_PASSWORD = 'Secret123';

const customers = [
  { username: 'bob', email: 'bob@example.com' },
  { username: 'charlie', email: 'charlie@example.com' },
  { username: 'diana', email: 'diana@example.com' },
  { username: 'ethan', email: 'ethan@example.com' },
  { username: 'fiona', email: 'fiona@example.com' },
  { username: 'george', email: 'george@example.com' },
];

const products = [
  { name: 'Wireless Mouse Pro', description: 'Silent clicks, 2.4 GHz receiver', price: 22.99, stock: 140 },
  { name: 'Mechanical Keyboard', description: 'Hot-swappable switches, RGB', price: 89.5, stock: 40 },
  { name: 'USB-C Hub 7-in-1', description: 'HDMI 4K, 3x USB-A, SD/microSD, 100 W PD', price: 34.99, stock: 210 },
  { name: '27-inch 4K Monitor', description: 'IPS, 60 Hz, USB-C 65 W', price: 329.0, stock: 25 },
  { name: 'Aluminium Laptop Stand', description: 'Adjustable height, foldable', price: 29.95, stock: 180 },
  { name: 'Noise-Cancelling Headphones', description: 'Over-ear, 30 h battery', price: 199.99, stock: 60 },
  { name: 'Webcam 1080p', description: 'Auto-focus, dual microphones', price: 49.0, stock: 95 },
  { name: 'LED Desk Lamp', description: 'Dimmable, USB charging port', price: 24.5, stock: 120 },
  { name: 'Portable SSD 1TB', description: 'USB 3.2 Gen 2, 1050 MB/s', price: 89.99, stock: 75 },
  { name: 'Ergonomic Office Chair', description: 'Lumbar support, mesh back', price: 249.0, stock: 15 },
  { name: 'HDMI Cable 2m', description: 'HDMI 2.1, 8K', price: 12.99, stock: 400 },
  { name: 'Wireless Charging Pad', description: '15 W Qi', price: 19.99, stock: 0 },
];

// [customer, product name, quantity, status, days ago]
const orders = [
  ['bob', 'USB-C Hub 7-in-1', 1, 'Delivered', 28],
  ['bob', 'HDMI Cable 2m', 3, 'Delivered', 28],
  ['charlie', '27-inch 4K Monitor', 2, 'Shipped', 6],
  ['charlie', 'Aluminium Laptop Stand', 1, 'Shipped', 6],
  ['charlie', 'Webcam 1080p', 1, 'Pending', 1],
  ['diana', 'Noise-Cancelling Headphones', 1, 'Confirmed', 3],
  ['diana', 'Portable SSD 1TB', 2, 'Pending', 0],
  ['ethan', 'Ergonomic Office Chair', 1, 'Cancelled', 15],
  ['ethan', 'LED Desk Lamp', 2, 'Delivered', 20],
  ['ethan', 'Mechanical Keyboard', 1, 'Shipped', 4],
  ['fiona', 'Wireless Mouse Pro', 1, 'Confirmed', 2],
  ['fiona', 'USB-C Hub 7-in-1', 2, 'Pending', 0],
  ['george', 'Portable SSD 1TB', 1, 'Delivered', 25],
  ['george', '27-inch 4K Monitor', 1, 'Confirmed', 5],
  ['george', 'HDMI Cable 2m', 5, 'Pending', 1],
];

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(GATEWAY + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function login(username, password) {
  const { status, json } = await api('POST', '/api/auth/login', { body: { username, password } });
  if (status !== 200) throw new Error(`login ${username} failed: ${status} ${json?.error?.message}`);
  return json.data;
}

const stats = { usersCreated: 0, usersExisting: 0, productsCreated: 0, productsExisting: 0, ordersCreated: 0, customersSkipped: 0 };

// 1. Customers (AuthDb)
for (const c of customers) {
  const { status, json } = await api('POST', '/api/auth/register', { body: { ...c, password: CUSTOMER_PASSWORD } });
  if (status === 201) stats.usersCreated++;
  else if (status === 409) stats.usersExisting++;
  else throw new Error(`register ${c.username}: ${status} ${json?.error?.message}`);
}

// 2. Products (ProductApiDb), as the Admin
const admin = await login(ADMIN_USER, ADMIN_PASSWORD);
if (admin.user.role !== 'Admin') {
  throw new Error(`${ADMIN_USER} is not an Admin. Promote it first: UPDATE AuthDb.dbo.Users SET Role = N'Admin' WHERE Username = N'${ADMIN_USER}'`);
}
const productIds = new Map();
for (const p of products) {
  const { status, json } = await api('POST', '/api/products', { token: admin.accessToken, body: p });
  if (status === 201) {
    stats.productsCreated++;
    productIds.set(p.name, json.data.id);
  } else if (status === 409) {
    stats.productsExisting++;
  } else {
    throw new Error(`create product ${p.name}: ${status} ${json?.error?.message}`);
  }
}
// Resolve ids of products that already existed
const all = await api('GET', '/api/products?pageSize=100', { token: admin.accessToken });
for (const p of all.json.data.items) productIds.set(p.name, p.id);

// 3. Orders (OrderApiDb), placed by each customer - only for customers with no orders yet
const tokens = new Map();
for (const [customer, productName, quantity, status, daysAgo] of orders) {
  if (!tokens.has(customer)) {
    const session = await login(customer, CUSTOMER_PASSWORD);
    const mine = await api('GET', '/api/orders?pageSize=1', { token: session.accessToken });
    const hasOrders = mine.json.data.pagination.totalItems > 0;
    if (hasOrders) stats.customersSkipped++;
    tokens.set(customer, hasOrders ? null : session.accessToken);
  }
  const token = tokens.get(customer);
  if (!token) continue;

  const orderDate = new Date(Date.now() - daysAgo * 86400000);
  orderDate.setUTCHours(9 + (quantity % 8), 15 * quantity % 60, 0, 0);
  const { status: code, json } = await api('POST', '/api/orders', {
    token,
    body: { productId: productIds.get(productName), quantity, status, orderDate: orderDate.toISOString() },
  });
  if (code !== 201) throw new Error(`order ${customer}/${productName}: ${code} ${json?.error?.message}`);
  stats.ordersCreated++;
}

console.log('Seed complete:', stats);
console.log(`Log in with any customer (${customers.map((c) => c.username).join(', ')}) / ${CUSTOMER_PASSWORD}, or ${ADMIN_USER} (Admin).`);
