//! Router-level tests for everything that happens before the database is touched:
//! authentication, validation, error envelope, 404/405/415. Run with `cargo test`.
//! The pool is built without connecting, so no SQL Server is needed.

use std::time::Duration;

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde_json::{json, Value};
use tower::ServiceExt;

use crate::config::JwtConfig;
use crate::db::TiberiusManager;
use crate::routes::{build_router, AppState};

const SECRET: &str = "test-secret-test-secret-test-secret-123";

fn app() -> Router {
    let mut config = tiberius::Config::new();
    config.host("127.0.0.1");
    config.port(1); // never contacted by these tests
    let pool = bb8::Pool::builder()
        .connection_timeout(Duration::from_millis(200))
        .build_unchecked(TiberiusManager::for_tests(config));

    let jwt = JwtConfig { secret: SECRET.into(), issuer: "auth-service".into(), audience: "app-clients".into() };
    build_router(AppState::new(pool, &jwt), &["http://localhost:5173".to_owned()])
}

fn token(role: &str, exp_offset_secs: i64, audience: &str) -> String {
    let now = chrono::Utc::now().timestamp();
    let claims = json!({
        "sub": "7", "username": "bob", "role": role,
        "iss": "auth-service", "aud": audience,
        "iat": now, "exp": now + exp_offset_secs,
    });
    encode(&Header::default(), &claims, &EncodingKey::from_secret(SECRET.as_bytes())).unwrap()
}

async fn call(method: &str, uri: &str, bearer: Option<&str>, body: Option<(&str, &str)>) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(t) = bearer {
        req = req.header(header::AUTHORIZATION, format!("Bearer {t}"));
    }
    let req = match body {
        Some((content_type, text)) => {
            req.header(header::CONTENT_TYPE, content_type).body(Body::from(text.to_owned())).unwrap()
        }
        None => req.body(Body::empty()).unwrap(),
    };

    let res = app().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn error_code(body: &Value) -> &str {
    assert_eq!(body["success"], false, "error envelope expected: {body}");
    body["error"]["code"].as_str().unwrap_or_default()
}

#[tokio::test]
async fn health_is_public() {
    let (status, body) = call("GET", "/health", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], true);
    assert_eq!(body["data"]["service"], "order-service");
}

#[tokio::test]
async fn missing_token_is_401() {
    let (status, body) = call("GET", "/api/orders", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(error_code(&body), "UNAUTHORIZED");
}

#[tokio::test]
async fn expired_token_is_401_with_expiry_message() {
    let (status, body) = call("GET", "/api/orders", Some(&token("User", -300, "app-clients")), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"]["message"], "Access token has expired.");
}

#[tokio::test]
async fn wrong_audience_is_401() {
    let (status, _) = call("GET", "/api/orders", Some(&token("User", 300, "someone-else")), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn unknown_role_is_401() {
    let (status, _) = call("GET", "/api/orders", Some(&token("Root", 300, "app-clients")), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn bad_id_is_400() {
    let (status, body) = call("GET", "/api/orders/abc", Some(&token("User", 300, "app-clients")), None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(error_code(&body), "VALIDATION_ERROR");
}

#[tokio::test]
async fn bad_list_query_is_400() {
    let uri = "/api/orders?pageSize=500&sortBy=hack&status=Lost";
    let (status, body) = call("GET", uri, Some(&token("Admin", 300, "app-clients")), None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let message = body["error"]["message"].as_str().unwrap();
    assert!(message.contains("pageSize") && message.contains("sortBy") && message.contains("status"), "{message}");
}

#[tokio::test]
async fn invalid_order_body_is_400_with_all_errors() {
    let body = r#"{"productId": 0, "quantity": 2.5, "orderDate": "03/11/2026"}"#;
    let (status, res) =
        call("POST", "/api/orders", Some(&token("User", 300, "app-clients")), Some(("application/json", body))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let message = res["error"]["message"].as_str().unwrap();
    assert!(message.contains("productId") && message.contains("quantity") && message.contains("orderDate"), "{message}");
}

#[tokio::test]
async fn put_requires_every_field() {
    let body = r#"{"productId": 1, "quantity": 1}"#;
    let (status, res) =
        call("PUT", "/api/orders/1", Some(&token("User", 300, "app-clients")), Some(("application/json", body))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let message = res["error"]["message"].as_str().unwrap();
    assert!(message.contains("status is required") && message.contains("orderDate is required"), "{message}");
}

#[tokio::test]
async fn malformed_json_is_400() {
    let (status, body) =
        call("POST", "/api/orders", Some(&token("User", 300, "app-clients")), Some(("application/json", "{bad"))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(error_code(&body), "INVALID_JSON");
}

#[tokio::test]
async fn wrong_content_type_is_415() {
    let (status, body) =
        call("POST", "/api/orders", Some(&token("User", 300, "app-clients")), Some(("text/plain", "{}"))).await;
    assert_eq!(status, StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(error_code(&body), "UNSUPPORTED_MEDIA_TYPE");
}

#[tokio::test]
async fn unknown_route_is_404_and_wrong_method_is_405() {
    let (status, body) = call("GET", "/nope", None, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(error_code(&body), "NOT_FOUND");

    let (status, body) = call("PATCH", "/api/orders", None, None).await;
    assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(error_code(&body), "METHOD_NOT_ALLOWED");
}
