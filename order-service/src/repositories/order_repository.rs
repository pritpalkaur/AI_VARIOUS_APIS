//! Data access for OrderApiDb.dbo.Orders - this service's own database. Products and users
//! live in other services' databases, so nothing here joins them: each order stores its own
//! ProductName / Username / UnitPrice snapshot.
//!  - Parameterized SQL only (@P1, @P2, ... bound by tiberius); statements are complete literals.
//!  - `scope: Option<i32>`: None = any order (Admin), Some(user_id) = only that user's orders.
//!    It is enforced in SQL with `(@Pn IS NULL OR UserId = @Pn)`.
//!  - Each method takes a pooled connection that returns to the pool when it goes out of scope.

use chrono::{NaiveDateTime, TimeZone, Utc};
use rust_decimal::Decimal;
use tiberius::Row;

use super::col;
use crate::db::DbPool;
use crate::error::{AppError, DbContext};
use crate::models::order::{ListQuery, Order, OrderInput, ProductSnapshot};

#[derive(Clone)]
pub struct OrderRepository {
    pool: DbPool,
}

impl OrderRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Returns (total matching rows, current page). Sorting uses CASE branches selected by
    /// parameters, so no column name is ever spliced into the SQL text.
    pub async fn list(&self, scope: Option<i32>, q: &ListQuery) -> Result<(i32, Vec<Order>), AppError> {
        const SQL: &str = r#"
            SELECT COUNT(*) AS Total
            FROM dbo.Orders
            WHERE (@P1 IS NULL OR UserId = @P1)
              AND (@P2 IS NULL OR Status = @P2)
              AND (@P7 IS NULL OR ProductId = @P7);

            SELECT Id, ProductId, ProductName, UserId, Username, Quantity, UnitPrice, TotalPrice,
                   Status, OrderDate, CreatedAt, UpdatedAt
            FROM dbo.Orders
            WHERE (@P1 IS NULL OR UserId = @P1)
              AND (@P2 IS NULL OR Status = @P2)
              AND (@P7 IS NULL OR ProductId = @P7)
            ORDER BY
              CASE WHEN @P3 = 'id'         AND @P4 = 'asc'  THEN Id         END ASC,
              CASE WHEN @P3 = 'id'         AND @P4 = 'desc' THEN Id         END DESC,
              CASE WHEN @P3 = 'orderDate'  AND @P4 = 'asc'  THEN OrderDate  END ASC,
              CASE WHEN @P3 = 'orderDate'  AND @P4 = 'desc' THEN OrderDate  END DESC,
              CASE WHEN @P3 = 'quantity'   AND @P4 = 'asc'  THEN Quantity   END ASC,
              CASE WHEN @P3 = 'quantity'   AND @P4 = 'desc' THEN Quantity   END DESC,
              CASE WHEN @P3 = 'totalPrice' AND @P4 = 'asc'  THEN TotalPrice END ASC,
              CASE WHEN @P3 = 'totalPrice' AND @P4 = 'desc' THEN TotalPrice END DESC,
              CASE WHEN @P3 = 'status'     AND @P4 = 'asc'  THEN Status     END ASC,
              CASE WHEN @P3 = 'status'     AND @P4 = 'desc' THEN Status     END DESC,
              CASE WHEN @P3 = 'createdAt'  AND @P4 = 'asc'  THEN CreatedAt  END ASC,
              CASE WHEN @P3 = 'createdAt'  AND @P4 = 'desc' THEN CreatedAt  END DESC,
              Id ASC
            OFFSET @P5 ROWS FETCH NEXT @P6 ROWS ONLY;
        "#;

        let offset = ((q.page - 1) * q.page_size) as i32;
        let page_size = q.page_size as i32;

        let mut conn = self.pool.get().await?;
        let results = conn
            .query(SQL, &[&scope, &q.status, &q.sort_by, &q.sort_dir, &offset, &page_size, &q.product_id])
            .await
            .db_ctx("orders.list")?
            .into_results()
            .await
            .db_ctx("orders.list")?;

        let total = match results.first().and_then(|rows| rows.first()) {
            Some(row) => col::<i32>(row, "Total")?,
            None => 0,
        };
        let items = results
            .get(1)
            .map(|rows| rows.iter().map(map_order).collect::<Result<Vec<_>, _>>())
            .transpose()?
            .unwrap_or_default();

        Ok((total, items))
    }

    pub async fn find_by_id(&self, id: i32, scope: Option<i32>) -> Result<Option<Order>, AppError> {
        const SQL: &str = r#"
            SELECT Id, ProductId, ProductName, UserId, Username, Quantity, UnitPrice, TotalPrice,
                   Status, OrderDate, CreatedAt, UpdatedAt
            FROM dbo.Orders
            WHERE Id = @P1
              AND (@P2 IS NULL OR UserId = @P2);
        "#;

        let mut conn = self.pool.get().await?;
        let row = conn
            .query(SQL, &[&id, &scope])
            .await
            .db_ctx("orders.find_by_id")?
            .into_row()
            .await
            .db_ctx("orders.find_by_id")?;

        row.as_ref().map(map_order).transpose()
    }

    /// Inserts an order and returns its new Id.
    pub async fn insert(
        &self,
        user_id: i32,
        username: &str,
        input: &OrderInput,
        product: &ProductSnapshot,
    ) -> Result<i32, AppError> {
        const SQL: &str = r#"
            INSERT INTO dbo.Orders (ProductId, ProductName, UserId, Username, Quantity, UnitPrice, Status, OrderDate)
            OUTPUT INSERTED.Id
            VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8);
        "#;

        let mut conn = self.pool.get().await?;
        let row = conn
            .query(
                SQL,
                &[
                    &input.product_id,
                    &product.name.as_str(),
                    &user_id,
                    &username,
                    &input.quantity,
                    &product.unit_price,
                    &input.status,
                    &input.order_date,
                ],
            )
            .await
            .db_ctx("orders.insert")?
            .into_row()
            .await
            .db_ctx("orders.insert")?
            .ok_or_else(|| AppError::Internal("INSERT into dbo.Orders returned no row".into()))?;

        col::<i32>(&row, "Id")
    }

    /// Full replace. Returns false when no order matched (missing or outside the caller's scope).
    pub async fn update(
        &self,
        id: i32,
        scope: Option<i32>,
        input: &OrderInput,
        product: &ProductSnapshot,
    ) -> Result<bool, AppError> {
        const SQL: &str = r#"
            UPDATE dbo.Orders
            SET ProductId = @P3, ProductName = @P4, Quantity = @P5, UnitPrice = @P6, Status = @P7,
                OrderDate = @P8, UpdatedAt = SYSUTCDATETIME()
            WHERE Id = @P1
              AND (@P2 IS NULL OR UserId = @P2);
        "#;

        let mut conn = self.pool.get().await?;
        let result = conn
            .execute(
                SQL,
                &[
                    &id,
                    &scope,
                    &input.product_id,
                    &product.name.as_str(),
                    &input.quantity,
                    &product.unit_price,
                    &input.status,
                    &input.order_date,
                ],
            )
            .await
            .db_ctx("orders.update")?;

        Ok(result.total() > 0)
    }

    /// Returns false when no order matched (missing or outside the caller's scope).
    pub async fn delete(&self, id: i32, scope: Option<i32>) -> Result<bool, AppError> {
        const SQL: &str = r#"
            DELETE FROM dbo.Orders
            WHERE Id = @P1
              AND (@P2 IS NULL OR UserId = @P2);
        "#;

        let mut conn = self.pool.get().await?;
        let result = conn.execute(SQL, &[&id, &scope]).await.db_ctx("orders.delete")?;
        Ok(result.total() > 0)
    }
}

fn map_order(row: &Row) -> Result<Order, AppError> {
    // DATETIME2 columns hold UTC (SYSUTCDATETIME) - tag them so JSON ends with "Z".
    let utc = |name: &'static str| col::<NaiveDateTime>(row, name).map(|dt| Utc.from_utc_datetime(&dt));

    Ok(Order {
        id: col::<i32>(row, "Id")?,
        product_id: col::<i32>(row, "ProductId")?,
        product_name: col::<&str>(row, "ProductName")?.to_owned(),
        user_id: col::<i32>(row, "UserId")?,
        username: col::<&str>(row, "Username")?.to_owned(),
        quantity: col::<i32>(row, "Quantity")?,
        unit_price: col::<Decimal>(row, "UnitPrice")?,
        total_price: col::<Decimal>(row, "TotalPrice")?,
        status: col::<&str>(row, "Status")?.to_owned(),
        order_date: utc("OrderDate")?,
        created_at: utc("CreatedAt")?,
        updated_at: utc("UpdatedAt")?,
    })
}
