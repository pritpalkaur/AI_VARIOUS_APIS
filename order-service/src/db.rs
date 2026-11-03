//! Connection pool: bb8 managing tiberius clients.
//!
//! Rust has no try/catch/finally. Connection release is handled by ownership instead:
//! `pool.get()` returns a `PooledConnection` guard, and when that guard goes out of scope -
//! at the end of a function OR on an early `?` error return - its Drop impl hands the
//! connection back to the pool. No code path can leak a connection.

use std::time::Duration;

use async_trait::async_trait;
use tiberius::{AuthMethod, Client, EncryptionLevel};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

use crate::config::DbConfig;

pub type DbPool = bb8::Pool<TiberiusManager>;
pub type DbClient = Client<Compat<TcpStream>>;

/// Tells bb8 how to open and health-check a SQL Server connection.
pub struct TiberiusManager {
    config: tiberius::Config,
}

#[cfg(test)]
impl TiberiusManager {
    pub fn for_tests(config: tiberius::Config) -> Self {
        Self { config }
    }
}

#[async_trait]
impl bb8::ManageConnection for TiberiusManager {
    type Connection = DbClient;
    type Error = tiberius::error::Error;

    async fn connect(&self) -> Result<Self::Connection, Self::Error> {
        let tcp = TcpStream::connect(self.config.get_addr()).await?;
        tcp.set_nodelay(true)?;
        Client::connect(self.config.clone(), tcp.compat_write()).await
    }

    async fn is_valid(&self, conn: &mut Self::Connection) -> Result<(), Self::Error> {
        conn.simple_query("SELECT 1;").await?.into_row().await?;
        Ok(())
    }

    fn has_broken(&self, _conn: &mut Self::Connection) -> bool {
        false
    }
}

/// Builds the single pool for this process and verifies connectivity once (fail fast).
pub async fn create_pool(cfg: &DbConfig) -> Result<DbPool, String> {
    let mut config = tiberius::Config::new();
    config.host(&cfg.server);
    config.port(cfg.port);
    config.database(&cfg.database);
    config.authentication(AuthMethod::sql_server(&cfg.user, &cfg.password));
    config.encryption(EncryptionLevel::Required);
    if cfg.trust_server_cert {
        config.trust_cert();
    }
    config.application_name("order-service");

    let pool = bb8::Pool::builder()
        .max_size(cfg.pool_max)
        .min_idle(if cfg.pool_min > 0 { Some(cfg.pool_min) } else { None })
        .connection_timeout(Duration::from_secs(cfg.connect_timeout_secs))
        .build(TiberiusManager { config })
        .await
        .map_err(|e| format!("cannot create connection pool: {e}"))?;

    {
        let mut conn = pool.get().await.map_err(|e| format!("cannot connect to SQL Server: {e}"))?;
        conn.simple_query("SELECT 1;")
            .await
            .map_err(|e| format!("connectivity check failed: {e}"))?
            .into_row()
            .await
            .map_err(|e| format!("connectivity check failed: {e}"))?;
    } // connection returned to the pool here

    tracing::info!(
        server = %format!("{},{}", cfg.server, cfg.port),
        database = %cfg.database,
        pool_max = cfg.pool_max,
        "Connected to SQL Server"
    );
    Ok(pool)
}
