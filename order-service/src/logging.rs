//! tracing setup: human-readable console output + daily rolling JSON file (14 days kept).

use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter};

use crate::config::Config;

/// The returned guard must stay alive for the whole program; dropping it flushes the file log.
pub fn init(config: &Config) -> Result<WorkerGuard, String> {
    std::fs::create_dir_all(&config.log_dir)
        .map_err(|e| format!("cannot create log directory {}: {e}", config.log_dir.display()))?;

    let appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("order-service")
        .filename_suffix("log")
        .max_log_files(14)
        .build(&config.log_dir)
        .map_err(|e| format!("cannot create log file: {e}"))?;
    let (file_writer, guard) = tracing_appender::non_blocking(appender);

    let level = match config.log_level.trim().to_lowercase().as_str() {
        "trace" => "trace",
        "debug" => "debug",
        "warn" | "warning" => "warn",
        "error" | "fatal" => "error",
        _ => "info",
    };
    // Library noise (TLS handshakes, connection chatter) is capped at warn.
    let filter = EnvFilter::try_new(format!("{level},tiberius=warn,hyper=warn,tower_http=warn"))
        .map_err(|e| format!("invalid LOG_LEVEL: {e}"))?;

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_target(false))
        .with(fmt::layer().json().with_ansi(false).with_writer(file_writer))
        .try_init()
        .map_err(|e| format!("cannot initialise logging: {e}"))?;

    Ok(guard)
}
