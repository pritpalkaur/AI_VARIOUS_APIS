//! HTTP layer: extract + validate input, call the service, wrap the result in the envelope.
//! Every handler returns Result<Response, AppError>; `?` hands any error to AppError's
//! IntoResponse (Rust's replacement for try/catch).

use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::header::LOCATION;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::Value;

use super::ApiJson;
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::response;
use crate::routes::AppState;
use crate::validation::{self, BodyMode};

/// GET /api/orders?page=&pageSize=&sortBy=&sortDir=&status=
pub async fn list_orders(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, AppError> {
    let query = validation::validate_list_query(&params)?;
    let page = state.orders.list(&user, query).await?;
    Ok(response::ok(StatusCode::OK, page, "Orders retrieved."))
}

/// GET /api/orders/{id}
pub async fn get_order(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let id = validation::parse_id(&id)?;
    let order = state.orders.get(&user, id).await?;
    Ok(response::ok(StatusCode::OK, order, "Order retrieved."))
}

/// POST /api/orders
pub async fn create_order(
    State(state): State<AppState>,
    user: AuthUser,
    ApiJson(body): ApiJson<Value>,
) -> Result<Response, AppError> {
    let input = validation::validate_order_body(&body, BodyMode::Create)?;
    let order = state.orders.create(&user, input).await?;
    let location = format!("/api/orders/{}", order.id);
    Ok(([(LOCATION, location)], response::ok(StatusCode::CREATED, order, "Order created.")).into_response())
}

/// PUT /api/orders/{id}
pub async fn update_order(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<Value>,
) -> Result<Response, AppError> {
    let id = validation::parse_id(&id);
    let input = validation::validate_order_body(&body, BodyMode::Replace);
    let (id, input) = match (id, input) {
        (Ok(id), Ok(input)) => (id, input),
        (Err(AppError::Validation(a)), Err(AppError::Validation(b))) => {
            return Err(AppError::Validation(format!("{a} {b}")));
        }
        (Err(e), _) | (_, Err(e)) => return Err(e),
    };
    let order = state.orders.update(&user, id, input).await?;
    Ok(response::ok(StatusCode::OK, order, "Order updated."))
}

/// DELETE /api/orders/{id}
pub async fn delete_order(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let id = validation::parse_id(&id)?;
    let deleted = state.orders.delete(&user, id).await?;
    Ok(response::ok(StatusCode::OK, deleted, "Order deleted."))
}
