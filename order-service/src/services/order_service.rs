//! Business rules for orders:
//!  - A User sees and manages only their own orders; an Admin sees all of them.
//!    Another user's order looks exactly like a missing one (404), so ids are not leaked.
//!  - Products live in the Product Service's own database. The product is looked up through
//!    the Product API (forwarding the caller's token) when an order is created or switched to
//!    a different product; its name and price are copied onto the order (a snapshot).
//!    Keeping the same product keeps the original snapshot, so later price changes never
//!    rewrite an existing order.
//!  - The username comes from the caller's JWT and is also stored on the order.
//!  - TotalPrice is computed by the database (persisted computed column).

use crate::auth::AuthUser;
use crate::clients::product_client::ProductClient;
use crate::error::{codes, AppError};
use crate::models::order::{DeletedOrder, ListQuery, Order, OrderInput, Page, Pagination, ProductSnapshot};
use crate::repositories::order_repository::OrderRepository;

pub struct OrderService {
    orders: OrderRepository,
    products: ProductClient,
}

impl OrderService {
    pub fn new(orders: OrderRepository, products: ProductClient) -> Self {
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
        let snapshot = self.product_snapshot(user, input.product_id).await?;
        let id = self.orders.insert(user.id, &user.username, &input, &snapshot).await?;

        tracing::info!(order_id = id, user_id = user.id, product_id = input.product_id, "Order created");
        self.orders
            .find_by_id(id, None)
            .await?
            .ok_or_else(|| AppError::Internal(format!("order {id} not found right after insert")))
    }

    pub async fn update(&self, user: &AuthUser, id: i32, input: OrderInput) -> Result<Order, AppError> {
        let existing = self.get(user, id).await?;

        let snapshot = if existing.product_id == input.product_id {
            ProductSnapshot { name: existing.product_name, unit_price: existing.unit_price }
        } else {
            self.product_snapshot(user, input.product_id).await?
        };

        if !self.orders.update(id, user.scope(), &input, &snapshot).await? {
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

    /// Looks the product up through the Product API and returns what the order should store.
    async fn product_snapshot(&self, user: &AuthUser, product_id: i32) -> Result<ProductSnapshot, AppError> {
        let product = self
            .products
            .get_product(product_id, &user.token)
            .await?
            .ok_or_else(|| product_not_found(product_id))?;
        Ok(ProductSnapshot { name: product.name, unit_price: product.price })
    }
}

fn order_not_found(id: i32) -> AppError {
    AppError::not_found(codes::ORDER_NOT_FOUND, format!("Order {id} was not found."))
}

fn product_not_found(id: i32) -> AppError {
    AppError::not_found(codes::PRODUCT_NOT_FOUND, format!("Product {id} was not found."))
}
