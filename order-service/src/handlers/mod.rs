pub mod orders;

use axum::extract::FromRequest;

use crate::error::AppError;

/// `axum::Json` whose rejection (bad JSON, wrong Content-Type) is our JSON error envelope
/// instead of Axum's plain-text response.
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(AppError))]
pub struct ApiJson<T>(pub T);
