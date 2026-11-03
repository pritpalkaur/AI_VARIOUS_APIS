mod auth;
mod config;
mod db;
mod error;
mod handlers;
mod logging;
mod models;
mod repositories;
mod response;
mod routes;
mod services;
mod validation;

#[cfg(test)]
mod tests;

use std::net::Ipv4Addr;
use std::process::ExitCode;

use tokio::net::TcpListener;

use crate::config::Config;

#[tokio::main]
async fn main() -> ExitCode {
    // Load .env into the environment; real environment variables take precedence.
    let _ = dotenvy::dotenv();

    let config = match Config::from_env() {
        Ok(config) => config,
        Err(errors) => {
            eprintln!("Invalid configuration: {errors}");
            return ExitCode::FAILURE;
        }
    };

    // Keep the guard alive until main returns so buffered file logs are flushed.
    let _log_guard = match logging::init(&config) {
        Ok(guard) => guard,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };
    tracing::info!(log_level = %config.log_level, "Order service starting");

    // The single connection pool for this process.
    let pool = match db::create_pool(&config.db).await {
        Ok(pool) => pool,
        Err(e) => {
            tracing::error!(error = %e, "Order service failed to start: database unavailable");
            return ExitCode::FAILURE;
        }
    };

    let state = routes::AppState::new(pool.clone(), &config.jwt);
    let app = routes::build_router(state, &config.cors_origins);

    let listener = match TcpListener::bind((Ipv4Addr::LOCALHOST, config.port)).await {
        Ok(listener) => listener,
        Err(e) => {
            tracing::error!(error = %e, port = config.port, "Cannot bind HTTP port");
            return ExitCode::FAILURE;
        }
    };
    tracing::info!("Order service listening on http://localhost:{}", config.port);

    let served = axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await;

    // The router (and its pool clones) was consumed by serve(); dropping the last handle
    // closes every pooled connection.
    drop(pool);
    tracing::info!("SQL connection pool closed");

    match served {
        Ok(()) => {
            tracing::info!("Order service stopped");
            ExitCode::SUCCESS
        }
        Err(e) => {
            tracing::error!(error = %e, "HTTP server error");
            ExitCode::FAILURE
        }
    }
}

/// Resolves on Ctrl+C (all platforms) or SIGTERM (Unix). In-flight requests finish first.
async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(e) = tokio::signal::ctrl_c().await {
            tracing::error!(error = %e, "Cannot listen for Ctrl+C");
            std::future::pending::<()>().await;
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("Order service shutting down, finishing in-flight requests...");
}
