use chrono::{DateTime, NaiveDateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;

/// An order as returned by the API. productName and username are snapshots stored on the order.
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

/// The product fields the order service needs, as returned by the Product API.
#[derive(Debug, Clone)]
pub struct ProductRef {
    pub name: String,
    pub price: Decimal,
}

/// What an order stores about its product: copied when the order is created or switched
/// to another product, so the order stays readable even if the product changes later.
#[derive(Debug, Clone)]
pub struct ProductSnapshot {
    pub name: String,
    pub unit_price: Decimal,
}

/// Validated list query. sort_by/sort_dir are whitelisted values, passed as SQL parameters.
#[derive(Debug, Clone)]
pub struct ListQuery {
    pub page: u32,
    pub page_size: u32,
    pub sort_by: &'static str,
    pub sort_dir: &'static str,
    pub status: Option<&'static str>,
    /// ?productId= - used by the Product Service's "does this product have orders?" check.
    pub product_id: Option<i32>,
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
