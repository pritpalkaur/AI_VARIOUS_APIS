use std::sync::Arc;
use std::time::Instant;

use axum::extract::Request;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use serde_json::json;
use tower_http::cors::CorsLayer;

use crate::auth::JwtValidator;
use crate::config::JwtConfig;
use crate::db::DbPool;
use crate::error::AppError;
use crate::handlers::orders;
use crate::repositories::order_repository::OrderRepository;
use crate::repositories::product_repository::ProductRepository;
use crate::response;
use crate::services::order_service::OrderService;

/// Shared, cheaply clonable application state: handler -> service -> repository -> pool.
#[derive(Clone)]
pub struct AppState {
    pub orders: Arc<OrderService>,
    pub jwt: Arc<JwtValidator>,
}

impl AppState {
    pub fn new(pool: DbPool, jwt: &JwtConfig) -> Self {
        let service = OrderService::new(OrderRepository::new(pool.clone()), ProductRepository::new(pool));
        Self { orders: Arc::new(service), jwt: Arc::new(JwtValidator::new(jwt)) }
    }
}

pub fn build_router(state: AppState, cors_origins: &[String]) -> Router {
    let origins: Vec<HeaderValue> = cors_origins.iter().filter_map(|o| o.parse().ok()).collect();
    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE]);

    Router::new()
        .route("/health", get(health))
        .route("/api/orders", get(orders::list_orders).post(orders::create_order))
        .route(
            "/api/orders/{id}",
            get(orders::get_order).put(orders::update_order).delete(orders::delete_order),
        )
        .fallback(not_found)
        .method_not_allowed_fallback(method_not_allowed)
        .layer(cors)
        .layer(middleware::from_fn(log_requests)) // outermost: sees the final status
        .with_state(state)
}

async fn health() -> Response {
    response::ok(StatusCode::OK, json!({ "status": "ok", "service": "order-service" }), "Service is healthy.")
}

async fn not_found() -> AppError {
    AppError::RouteNotFound
}

async fn method_not_allowed() -> AppError {
    AppError::MethodNotAllowed
}

/// One log line per request: method, path, status, duration.
/// Only the path is logged - never headers (Authorization), query strings or bodies.
async fn log_requests(req: Request, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_owned();
    let started = Instant::now();

    let response = next.run(req).await;

    let status = response.status().as_u16();
    let duration_ms = (started.elapsed().as_secs_f64() * 10_000.0).round() / 10.0;
    if status >= 500 {
        tracing::error!(%method, %path, status, duration_ms, "HTTP {method} {path} responded {status}");
    } else if status >= 400 {
        tracing::warn!(%method, %path, status, duration_ms, "HTTP {method} {path} responded {status}");
    } else {
        tracing::info!(%method, %path, status, duration_ms, "HTTP {method} {path} responded {status}");
    }
    response
}
