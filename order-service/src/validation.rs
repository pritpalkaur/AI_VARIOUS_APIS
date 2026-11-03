//! Input validation. Collects every problem and returns one 400 with all messages.

use std::collections::HashMap;

use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, SubsecRound, Utc};
use serde_json::{Map, Value};

use crate::error::AppError;
use crate::models::order::{ListQuery, OrderInput};

pub const ORDER_STATUSES: [&str; 5] = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"];
const SORTABLE_FIELDS: [&str; 6] = ["id", "orderDate", "quantity", "totalPrice", "status", "createdAt"];

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum BodyMode {
    /// POST: status defaults to Pending, orderDate defaults to now.
    Create,
    /// PUT: every field is required.
    Replace,
}

pub fn parse_id(raw: &str) -> Result<i32, AppError> {
    let valid = !raw.is_empty() && raw.len() <= 10 && raw.bytes().all(|b| b.is_ascii_digit());
    valid
        .then(|| raw.parse::<i32>().ok())
        .flatten()
        .filter(|id| *id >= 1)
        .ok_or_else(|| AppError::Validation("id must be a positive integer.".into()))
}

pub fn validate_list_query(params: &HashMap<String, String>) -> Result<ListQuery, AppError> {
    let mut errors = Vec::new();

    let page = parse_optional_u32(params.get("page"), 1);
    if !matches!(page, Some(1..=100_000)) {
        errors.push("page must be an integer of at least 1.".to_owned());
    }

    let page_size = parse_optional_u32(params.get("pageSize"), 20);
    if !matches!(page_size, Some(1..=100)) {
        errors.push("pageSize must be an integer between 1 and 100.".to_owned());
    }

    let sort_by = match non_empty(params.get("sortBy")) {
        None => "orderDate",
        Some(s) => SORTABLE_FIELDS.iter().copied().find(|f| *f == s).unwrap_or_else(|| {
            errors.push(format!("sortBy must be one of: {}.", SORTABLE_FIELDS.join(", ")));
            "orderDate"
        }),
    };

    let sort_dir = match non_empty(params.get("sortDir")).map(str::to_lowercase).as_deref() {
        None | Some("desc") => "desc",
        Some("asc") => "asc",
        Some(_) => {
            errors.push("sortDir must be asc or desc.".to_owned());
            "desc"
        }
    };

    let status = match non_empty(params.get("status")) {
        None => None,
        Some(s) => {
            let found = find_status(s);
            if found.is_none() {
                errors.push(format!("status must be one of: {}.", ORDER_STATUSES.join(", ")));
            }
            found
        }
    };

    if !errors.is_empty() {
        return Err(AppError::Validation(errors.join(" ")));
    }
    Ok(ListQuery {
        page: page.unwrap_or(1),
        page_size: page_size.unwrap_or(20),
        sort_by,
        sort_dir,
        status,
    })
}

pub fn validate_order_body(body: &Value, mode: BodyMode) -> Result<OrderInput, AppError> {
    let Some(obj) = body.as_object() else {
        return Err(AppError::Validation("Request body must be a JSON object.".into()));
    };
    let mut errors = Vec::new();

    let product_id = int_field(obj, "productId", 1, i32::MAX as i64, &mut errors);
    let quantity = int_field(obj, "quantity", 1, 10_000, &mut errors);

    let status = match obj.get("status") {
        None | Some(Value::Null) if mode == BodyMode::Create => Some("Pending"),
        None | Some(Value::Null) => {
            errors.push("status is required.".to_owned());
            None
        }
        Some(Value::String(s)) => {
            let found = find_status(s.trim());
            if found.is_none() {
                errors.push(format!("status must be one of: {}.", ORDER_STATUSES.join(", ")));
            }
            found
        }
        Some(_) => {
            errors.push("status must be a string.".to_owned());
            None
        }
    };

    let order_date = match obj.get("orderDate") {
        None | Some(Value::Null) if mode == BodyMode::Create => Some(Utc::now().naive_utc().trunc_subsecs(3)),
        None | Some(Value::Null) => {
            errors.push("orderDate is required.".to_owned());
            None
        }
        Some(Value::String(s)) => {
            let parsed = parse_order_date(s.trim());
            if parsed.is_none() {
                errors.push(
                    "orderDate must be an ISO-8601 date (YYYY-MM-DD) or date-time (e.g. 2026-11-03T14:30:00Z) between the years 2000 and 2100."
                        .to_owned(),
                );
            }
            parsed
        }
        Some(_) => {
            errors.push("orderDate must be a string.".to_owned());
            None
        }
    };

    match (product_id, quantity, status, order_date) {
        (Some(product_id), Some(quantity), Some(status), Some(order_date)) if errors.is_empty() => {
            Ok(OrderInput { product_id, quantity, status, order_date })
        }
        _ => Err(AppError::Validation(errors.join(" "))),
    }
}

fn int_field(obj: &Map<String, Value>, name: &str, min: i64, max: i64, errors: &mut Vec<String>) -> Option<i32> {
    match obj.get(name) {
        None | Some(Value::Null) => {
            errors.push(format!("{name} is required."));
            None
        }
        Some(v) => match v.as_i64() {
            Some(n) if (min..=max).contains(&n) => Some(n as i32),
            Some(_) => {
                errors.push(format!("{name} must be between {min} and {max}."));
                None
            }
            None => {
                errors.push(format!("{name} must be an integer."));
                None
            }
        },
    }
}

/// Accepts RFC 3339 date-times (any offset, converted to UTC) or a plain YYYY-MM-DD date.
fn parse_order_date(s: &str) -> Option<NaiveDateTime> {
    let parsed = DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc).naive_utc())
        .ok()
        .or_else(|| {
            NaiveDate::parse_from_str(s, "%Y-%m-%d")
                .ok()
                .and_then(|d| d.and_hms_opt(0, 0, 0))
        })?;
    (2000..=2100).contains(&parsed.year()).then(|| parsed.trunc_subsecs(3))
}

fn find_status(s: &str) -> Option<&'static str> {
    ORDER_STATUSES.iter().copied().find(|st| st.eq_ignore_ascii_case(s))
}

fn non_empty(value: Option<&String>) -> Option<&str> {
    value.map(|s| s.trim()).filter(|s| !s.is_empty())
}

/// Missing/empty -> Some(default); not a plain unsigned integer -> None (invalid).
fn parse_optional_u32(value: Option<&String>, default: u32) -> Option<u32> {
    match non_empty(value) {
        None => Some(default),
        Some(s) if s.len() <= 9 && s.bytes().all(|b| b.is_ascii_digit()) => s.parse().ok(),
        Some(_) => None,
    }
}
