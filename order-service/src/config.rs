//! Settings read from environment variables (.env is loaded into the environment first).
//! None of these structs derive Debug, so secrets cannot be printed by accident.

use std::env;
use std::fmt::Display;
use std::path::PathBuf;
use std::str::FromStr;

pub struct Config {
    pub port: u16,
    pub cors_origins: Vec<String>,
    pub db: DbConfig,
    pub jwt: JwtConfig,
    pub log_level: String,
    pub log_dir: PathBuf,
}

pub struct DbConfig {
    pub server: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub trust_server_cert: bool,
    pub pool_min: u32,
    pub pool_max: u32,
    pub connect_timeout_secs: u64,
}

pub struct JwtConfig {
    pub secret: String,
    pub issuer: String,
    pub audience: String,
}

impl Config {
    /// Reads and validates every setting. Returns all problems at once; never includes values.
    pub fn from_env() -> Result<Self, String> {
        let mut r = EnvReader::default();

        let config = Config {
            port: r.number("PORT", 5003u16, 1, 65535),
            cors_origins: r
                .optional("CORS_ORIGIN", "http://localhost:5173")
                .split(',')
                .map(|s| s.trim().to_owned())
                .filter(|s| !s.is_empty())
                .collect(),
            db: DbConfig {
                server: r.required("DB_SERVER", true),
                port: r.number("DB_PORT", 1433u16, 1, 65535),
                database: r.required("DB_NAME", true),
                user: r.required("DB_USER", true),
                password: r.required("DB_PASSWORD", false),
                trust_server_cert: r.boolean("DB_TRUST_SERVER_CERT", false),
                pool_min: r.number("DB_POOL_MIN", 0u32, 0, 100),
                pool_max: r.number("DB_POOL_MAX", 10u32, 1, 200),
                connect_timeout_secs: r.number("DB_CONNECT_TIMEOUT_SECONDS", 15u64, 1, 120),
            },
            jwt: JwtConfig {
                secret: r.required("JWT_SECRET", false),
                issuer: r.required("JWT_ISSUER", true),
                audience: r.required("JWT_AUDIENCE", true),
            },
            log_level: r.optional("LOG_LEVEL", "info"),
            log_dir: PathBuf::from(r.optional("LOG_DIR", "logs")),
        };

        if !config.jwt.secret.is_empty() && config.jwt.secret.len() < 32 {
            r.errors.push("JWT_SECRET must be at least 32 characters".into());
        }
        if config.jwt.secret.to_lowercase().starts_with("replace_with") {
            r.errors.push("JWT_SECRET still has the placeholder value from .env.example".into());
        }
        if config.db.pool_min > config.db.pool_max {
            r.errors.push("DB_POOL_MIN must not be greater than DB_POOL_MAX".into());
        }

        if r.errors.is_empty() {
            Ok(config)
        } else {
            Err(r.errors.join("; "))
        }
    }
}

#[derive(Default)]
struct EnvReader {
    errors: Vec<String>,
}

impl EnvReader {
    fn raw(name: &str) -> Option<String> {
        env::var(name).ok().filter(|v| !v.trim().is_empty())
    }

    fn required(&mut self, name: &str, trim: bool) -> String {
        match Self::raw(name) {
            Some(v) if trim => v.trim().to_owned(),
            Some(v) => v,
            None => {
                self.errors.push(format!("{name} is required"));
                String::new()
            }
        }
    }

    fn optional(&mut self, name: &str, default: &str) -> String {
        Self::raw(name).map(|v| v.trim().to_owned()).unwrap_or_else(|| default.to_owned())
    }

    fn number<T>(&mut self, name: &str, default: T, min: T, max: T) -> T
    where
        T: FromStr + PartialOrd + Display + Copy,
    {
        let Some(raw) = Self::raw(name) else { return default };
        match raw.trim().parse::<T>() {
            Ok(v) if v >= min && v <= max => v,
            _ => {
                self.errors.push(format!("{name} must be a number between {min} and {max}"));
                default
            }
        }
    }

    fn boolean(&mut self, name: &str, default: bool) -> bool {
        let Some(raw) = Self::raw(name) else { return default };
        match raw.trim().to_lowercase().as_str() {
            "true" => true,
            "false" => false,
            _ => {
                self.errors.push(format!("{name} must be true or false"));
                default
            }
        }
    }
}
