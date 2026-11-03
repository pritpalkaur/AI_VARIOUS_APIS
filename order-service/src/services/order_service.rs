//! Business rules for orders:
//!  - A User sees and manages only their own orders; an Admin sees all of them.
//!    Another user's order looks exactly like a missing one (404), so ids are not leaked.
//!  - UnitPrice is copied from the product when the order is created, and re-copied only
//!    when an update switches the order to a different product.
//!  - TotalPrice is computed by the database (persisted computed column).

use crate::auth::AuthUser;
use crate::error::{codes, AppError, DbErrorKind};
use crate::models::order::{DeletedOrder, ListQuery, Order, OrderInput, Page, Pagination};
use crate::repositories::order_repository::OrderRepository;
use crate::repositories::product_repository::ProductRepository;

pub struct OrderService {
    orders: OrderRepository,
    products: ProductRepository,
}

impl OrderService {
    pub fn new(orders: OrderRepository, products: ProductRepository) -> Self {
        Self { orders, products }
    }

    pub async fn list(&self, user: &AuthUser, query: ListQuery) -> Result<Page<Order>, AppError> {
        let (total, items) = self.orders.list(user.scope(), &query).await?;
        let total_pages = (total.max(0) as u32).div_ceil(query.page_size);
        Ok(Page {
            items,
            pagination: Pagination {
                page: query.page,
                page_size: query.page_size,
                total_items: total,
                total_pages,
            },
        })
    }

    pub async fn get(&self, user: &AuthUser, id: i32) -> Result<Order, AppError> {
        self.orders.find_by_id(id, user.scope()).await?.ok_or_else(|| order_not_found(id))
    }

    pub async fn create(&self, user: &AuthUser, input: OrderInput) -> Result<Order, AppError> {
        let product = self
            .products
            .find_by_id(input.product_id)
            .await?
            .ok_or_else(|| product_not_found(input.product_id))?;

        let id = self
            .orders
            .insert(user.id, &input, product.price)
            .await
            .map_err(|e| map_foreign_key(e, input.product_id))?;

        tracing::info!(order_id = id, user_id = user.id, product_id = product.id, "Order created");
        self.orders
            .find_by_id(id, None)
            .await?
            .ok_or_else(|| AppError::Internal(format!("order {id} not found right after insert")))
    }

    pub async fn update(&self, user: &AuthUser, id: i32, input: OrderInput) -> Result<Order, AppError> {
        let existing = self.get(user, id).await?;

        let unit_price = if existing.product_id == input.product_id {
            existing.unit_price
        } else {
            self.products
                .find_by_id(input.product_id)
                .await?
                .ok_or_else(|| product_not_found(input.product_id))?
                .price
        };

        let updated = self
            .orders
            .update(id, user.scope(), &input, unit_price)
            .await
            .map_err(|e| map_foreign_key(e, input.product_id))?;
        if !updated {
            return Err(order_not_found(id)); // deleted between the read and the update
        }

        tracing::info!(order_id = id, user_id = user.id, "Order updated");
        self.get(user, id).await
    }

    pub async fn delete(&self, user: &AuthUser, id: i32) -> Result<DeletedOrder, AppError> {
        if !self.orders.delete(id, user.scope()).await? {
            return Err(order_not_found(id));
        }
        tracing::info!(order_id = id, user_id = user.id, "Order deleted");
        Ok(DeletedOrder { id })
    }
}

fn order_not_found(id: i32) -> AppError {
    AppError::not_found(codes::ORDER_NOT_FOUND, format!("Order {id} was not found."))
}

fn product_not_found(id: i32) -> AppError {
    AppError::not_found(codes::PRODUCT_NOT_FOUND, format!("Product {id} was not found."))
}

/// A product or user deleted between our check and the write trips the foreign key.
fn map_foreign_key(err: AppError, product_id: i32) -> AppError {
    if let AppError::Database { kind: DbErrorKind::ForeignKeyViolation(Some(name)), .. } = &err {
        match name.as_str() {
            "FK_Orders_Products" => return product_not_found(product_id),
            "FK_Orders_Users" => return AppError::Unauthorized("User account no longer exists."),
            _ => {}
        }
    }
    err
}
