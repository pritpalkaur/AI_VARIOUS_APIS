//! Read-only access to dbo.Products (owned by the Product Service).

use rust_decimal::Decimal;

use super::col;
use crate::db::DbPool;
use crate::error::{AppError, DbContext};
use crate::models::order::ProductRef;

#[derive(Clone)]
pub struct ProductRepository {
    pool: DbPool,
}

impl ProductRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_id(&self, id: i32) -> Result<Option<ProductRef>, AppError> {
        // `conn` is returned to the pool when it goes out of scope (normal return or `?`).
        let mut conn = self.pool.get().await?;
        let row = conn
            .query("SELECT Id, Price FROM dbo.Products WHERE Id = @P1;", &[&id])
            .await
            .db_ctx("products.find_by_id")?
            .into_row()
            .await
            .db_ctx("products.find_by_id")?;

        row.map(|r| {
            Ok(ProductRef {
                id: col::<i32>(&r, "Id")?,
                price: col::<Decimal>(&r, "Price")?,
            })
        })
        .transpose()
    }
}
