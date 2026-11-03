//! The service's single error type. Every fallible function returns Result<T, AppError> and
//! uses `?`; IntoResponse turns any AppError into the shared JSON error envelope.
//! Database details are logged where they happen and never sent to the client.

use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

pub mod codes {
    pub const VALIDATION_ERROR: &str = "VALIDATION_ERROR";
    pub const INVALID_JSON: &str = "INVALID_JSON";
    pub const UNSUPPORTED_MEDIA_TYPE: &str = "UNSUPPORTED_MEDIA_TYPE";
    pub const UNAUTHORIZED: &str = "UNAUTHORIZED";
    pub const FORBIDDEN: &str = "FORBIDDEN";
    pub const NOT_FOUND: &str = "NOT_FOUND";
    pub const METHOD_NOT_ALLOWED: &str = "METHOD_NOT_ALLOWED";
    pub const ORDER_NOT_FOUND: &str = "ORDER_NOT_FOUND";
    pub const PRODUCT_NOT_FOUND: &str = "PRODUCT_NOT_FOUND";
    pub const INTERNAL_ERROR: &str = "INTERNAL_ERROR";
}

const GENERIC_ERROR: &str = "An unexpected error occurred.";

#[derive(Debug)]
pub enum DbErrorKind {
    // The constraint name is only read through Debug (logged), never matched on.
    UniqueViolation(#[allow(dead_code)] Option<String>),
    ForeignKeyViolation(Option<String>),
    Other,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("validation failed: {0}")]
    Validation(String),

    #[error("invalid JSON body: {0}")]
    InvalidJson(String),

    #[error("unsupported media type")]
    UnsupportedMediaType,

    #[error("unauthorized: {0}")]
    Unauthorized(&'static str),

    #[allow(dead_code)] // kept for parity with the other services' error set
    #[error("forbidden")]
    Forbidden,

    #[error("not found: {message}")]
    NotFound { code: &'static str, message: String },

    #[error("route not found")]
    RouteNotFound,

    #[error("method not allowed")]
    MethodNotAllowed,

    #[error("database error in {operation}: {source}")]
    Database {
        operation: &'static str,
        kind: DbErrorKind,
        #[source]
        source: tiberius::error::Error,
    },

    #[error("connection pool error: {0}")]
    Pool(String),

    #[error("internal error: {0}")]
    Internal(String),
}

impl AppError {
    pub fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        AppError::NotFound { code, message: message.into() }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message): (StatusCode, &str, String) = match &self {
            AppError::Validation(m) => (StatusCode::BAD_REQUEST, codes::VALIDATION_ERROR, m.clone()),
            AppError::InvalidJson(_) => (
                StatusCode::BAD_REQUEST,
                codes::INVALID_JSON,
                "Request body is missing or is not valid JSON.".into(),
            ),
            AppError::UnsupportedMediaType => (
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                codes::UNSUPPORTED_MEDIA_TYPE,
                "Content-Type must be application/json.".into(),
            ),
            AppError::Unauthorized(m) => (StatusCode::UNAUTHORIZED, codes::UNAUTHORIZED, (*m).into()),
            AppError::Forbidden => (
                StatusCode::FORBIDDEN,
                codes::FORBIDDEN,
                "You do not have permission to perform this action.".into(),
            ),
            AppError::NotFound { code, message } => (StatusCode::NOT_FOUND, code, message.clone()),
            AppError::RouteNotFound => (
                StatusCode::NOT_FOUND,
                codes::NOT_FOUND,
                "The requested resource was not found.".into(),
            ),
            AppError::MethodNotAllowed => (
                StatusCode::METHOD_NOT_ALLOWED,
                codes::METHOD_NOT_ALLOWED,
                "HTTP method not allowed for this resource.".into(),
            ),
            // Already logged with context where they were created.
            AppError::Database { .. } | AppError::Pool(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, codes::INTERNAL_ERROR, GENERIC_ERROR.into())
            }
            AppError::Internal(detail) => {
                tracing::error!(error = %detail, "Internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, codes::INTERNAL_ERROR, GENERIC_ERROR.into())
            }
        };

        let body = json!({ "success": false, "error": { "code": code, "message": message } });
        (status, Json(body)).into_response()
    }
}

/// Malformed body / wrong Content-Type from the ApiJson extractor.
impl From<JsonRejection> for AppError {
    fn from(rejection: JsonRejection) -> Self {
        match rejection {
            JsonRejection::MissingJsonContentType(_) => AppError::UnsupportedMediaType,
            other => AppError::InvalidJson(other.body_text()),
        }
    }
}

/// Failure to check a connection out of the pool (timeout or connect error).
impl From<bb8::RunError<tiberius::error::Error>> for AppError {
    fn from(err: bb8::RunError<tiberius::error::Error>) -> Self {
        tracing::error!(error = %err, "Could not get a database connection from the pool");
        AppError::Pool(err.to_string())
    }
}

/// `.db_ctx("orders.list")` - attaches the operation name, classifies constraint errors and logs.
pub trait DbContext<T> {
    fn db_ctx(self, operation: &'static str) -> Result<T, AppError>;
}

impl<T> DbContext<T> for Result<T, tiberius::error::Error> {
    fn db_ctx(self, operation: &'static str) -> Result<T, AppError> {
        self.map_err(|source| {
            let kind = classify(&source);
            match &kind {
                DbErrorKind::Other => tracing::error!(operation, error = %source, "Database error"),
                constraint => tracing::info!(operation, ?constraint, "Constraint violated"),
            }
            AppError::Database { operation, kind, source }
        })
    }
}

fn classify(err: &tiberius::error::Error) -> DbErrorKind {
    if let tiberius::error::Error::Server(token) = err {
        let name = extract_constraint_name(token.message());
        return match token.code() {
            2627 | 2601 => DbErrorKind::UniqueViolation(name),
            547 => DbErrorKind::ForeignKeyViolation(name),
            _ => DbErrorKind::Other,
        };
    }
    DbErrorKind::Other
}

/// Finds e.g. FK_Orders_Products in SQL Server's message (quoted with ' or ").
fn extract_constraint_name(message: &str) -> Option<String> {
    ["FK_", "UQ_", "IX_"].iter().find_map(|prefix| {
        let start = message.find(prefix)?;
        let name: String = message[start..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
            .collect();
        Some(name)
    })
}
