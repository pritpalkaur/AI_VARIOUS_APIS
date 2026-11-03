use chrono::{DateTime, NaiveDateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;

/// An order as returned by the API (joined with product name and username).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Order {
    pub id: i32,
    pub product_id: i32,
    pub product_name: String,
    pub user_id: i32,
    pub username: String,
    pub quantity: i32,
    #[serde(with = "rust_decimal::serde::float")]
    pub unit_price: Decimal,
    #[serde(with = "rust_decimal::serde::float")]
    pub total_price: Decimal,
    pub status: String,
    pub order_date: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Validated body for POST (create) and PUT (full replace).
#[derive(Debug, Clone)]
pub struct OrderInput {
    pub product_id: i32,
    pub quantity: i32,
    pub status: &'static str,
    /// UTC, stored in a DATETIME2 column.
    pub order_date: NaiveDateTime,
}

/// The product fields the order service needs (id and current price).
#[derive(Debug, Clone)]
pub struct ProductRef {
    pub id: i32,
    pub price: Decimal,
}

/// Validated list query. sort_by/sort_dir are whitelisted values, passed as SQL parameters.
#[derive(Debug, Clone)]
pub struct ListQuery {
    pub page: u32,
    pub page_size: u32,
    pub sort_by: &'static str,
    pub sort_dir: &'static str,
    pub status: Option<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub page: u32,
    pub page_size: u32,
    pub total_items: i32,
    pub total_pages: u32,
}

#[derive(Debug, Serialize)]
pub struct Page<T: Serialize> {
    pub items: Vec<T>,
    pub pagination: Pagination,
}

#[derive(Debug, Serialize)]
pub struct DeletedOrder {
    pub id: i32,
}
