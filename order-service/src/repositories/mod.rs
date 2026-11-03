pub mod order_repository;

use tiberius::{FromSql, Row};

use crate::error::{AppError, DbContext};

/// Reads a NOT NULL column, turning a type mismatch or unexpected NULL into an AppError.
pub(crate) fn col<'a, T: FromSql<'a>>(row: &'a Row, name: &'static str) -> Result<T, AppError> {
    row.try_get::<T, _>(name)
        .db_ctx("read_column")?
        .ok_or_else(|| AppError::Internal(format!("column {name} was unexpectedly NULL")))
}
