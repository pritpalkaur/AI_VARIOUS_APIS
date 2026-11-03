/**
 * The client talks ONLY to the API gateway, which routes
 * /api/auth -> Auth Service, /api/products -> Product Service, /api/orders -> Order Service.
 */
export const API_GATEWAY_URL = 'http://localhost:5000';
