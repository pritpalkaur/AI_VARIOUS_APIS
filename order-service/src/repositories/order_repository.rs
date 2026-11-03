//! Data access for dbo.Orders.
//!  - Parameterized SQL only (@P1, @P2, ... bound by tiberius); statements are complete literals.
//!  - `scope: Option<i32>`: None = any order (Admin), Some(user_id) = only that user's orders.
//!    It is enforced in SQL with `(@Pn IS NULL OR o.UserId = @Pn)`.
//!  - Each method takes a pooled connection that returns to the pool when it goes out of scope.

use chrono::{NaiveDateTime, TimeZone, Utc};
use rust_decimal::Decimal;
use tiberius::Row;

use super::col;
use crate::db::DbPool;
use crate::error::{AppError, DbContext};
use crate::models::order::{ListQuery, Order, OrderInput};

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
            FROM dbo.Orders o
            WHERE (@P1 IS NULL OR o.UserId = @P1)
              AND (@P2 IS NULL OR o.Status = @P2);

            SELECT o.Id, o.ProductId, p.Name AS ProductName, o.UserId, u.Username,
                   o.Quantity, o.UnitPrice, o.TotalPrice, o.Status, o.OrderDate,
                   o.CreatedAt, o.UpdatedAt
            FROM dbo.Orders o
            JOIN dbo.Products p ON p.Id = o.ProductId
            JOIN dbo.Users u    ON u.Id = o.UserId
            WHERE (@P1 IS NULL OR o.UserId = @P1)
              AND (@P2 IS NULL OR o.Status = @P2)
            ORDER BY
              CASE WHEN @P3 = 'id'         AND @P4 = 'asc'  THEN o.Id         END ASC,
              CASE WHEN @P3 = 'id'         AND @P4 = 'desc' THEN o.Id         END DESC,
              CASE WHEN @P3 = 'orderDate'  AND @P4 = 'asc'  THEN o.OrderDate  END ASC,
              CASE WHEN @P3 = 'orderDate'  AND @P4 = 'desc' THEN o.OrderDate  END DESC,
              CASE WHEN @P3 = 'quantity'   AND @P4 = 'asc'  THEN o.Quantity   END ASC,
              CASE WHEN @P3 = 'quantity'   AND @P4 = 'desc' THEN o.Quantity   END DESC,
              CASE WHEN @P3 = 'totalPrice' AND @P4 = 'asc'  THEN o.TotalPrice END ASC,
              CASE WHEN @P3 = 'totalPrice' AND @P4 = 'desc' THEN o.TotalPrice END DESC,
              CASE WHEN @P3 = 'status'     AND @P4 = 'asc'  THEN o.Status     END ASC,
              CASE WHEN @P3 = 'status'     AND @P4 = 'desc' THEN o.Status     END DESC,
              CASE WHEN @P3 = 'createdAt'  AND @P4 = 'asc'  THEN o.CreatedAt  END ASC,
              CASE WHEN @P3 = 'createdAt'  AND @P4 = 'desc' THEN o.CreatedAt  END DESC,
              o.Id ASC
            OFFSET @P5 ROWS FETCH NEXT @P6 ROWS ONLY;
        "#;

        let offset = ((q.page - 1) * q.page_size) as i32;
        let page_size = q.page_size as i32;

        let mut conn = self.pool.get().await?;
        let results = conn
            .query(SQL, &[&scope, &q.status, &q.sort_by, &q.sort_dir, &offset, &page_size])
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
            SELECT o.Id, o.ProductId, p.Name AS ProductName, o.UserId, u.Username,
                   o.Quantity, o.UnitPrice, o.TotalPrice, o.Status, o.OrderDate,
                   o.CreatedAt, o.UpdatedAt
            FROM dbo.Orders o
            JOIN dbo.Products p ON p.Id = o.ProductId
            JOIN dbo.Users u    ON u.Id = o.UserId
            WHERE o.Id = @P1
              AND (@P2 IS NULL OR o.UserId = @P2);
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
    pub async fn insert(&self, user_id: i32, input: &OrderInput, unit_price: Decimal) -> Result<i32, AppError> {
        const SQL: &str = r#"
            INSERT INTO dbo.Orders (ProductId, UserId, Quantity, UnitPrice, Status, OrderDate)
            OUTPUT INSERTED.Id
            VALUES (@P1, @P2, @P3, @P4, @P5, @P6);
        "#;

        let mut conn = self.pool.get().await?;
        let row = conn
            .query(
                SQL,
                &[&input.product_id, &user_id, &input.quantity, &unit_price, &input.status, &input.order_date],
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
        unit_price: Decimal,
    ) -> Result<bool, AppError> {
        const SQL: &str = r#"
            UPDATE dbo.Orders
            SET ProductId = @P3, Quantity = @P4, UnitPrice = @P5, Status = @P6, OrderDate = @P7,
                UpdatedAt = SYSUTCDATETIME()
            WHERE Id = @P1
              AND (@P2 IS NULL OR UserId = @P2);
        "#;

        let mut conn = self.pool.get().await?;
        let result = conn
            .execute(
                SQL,
                &[&id, &scope, &input.product_id, &input.quantity, &unit_price, &input.status, &input.order_date],
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
