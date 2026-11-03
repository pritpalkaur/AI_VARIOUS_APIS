//! Success half of the shared JSON envelope: { "success": true, "data": ..., "message": "..." }

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
struct ApiSuccess<T: Serialize> {
    success: bool,
    data: T,
    message: String,
}

pub fn ok<T: Serialize>(status: StatusCode, data: T, message: impl Into<String>) -> Response {
    let body = ApiSuccess { success: true, data, message: message.into() };
    (status, Json(body)).into_response()
}
