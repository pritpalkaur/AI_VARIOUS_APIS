//! JWT validation. `AuthUser` is an Axum extractor: adding it to a handler's arguments makes
//! the route require a valid "Authorization: Bearer <token>". The token is never logged.

use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use jsonwebtoken::errors::ErrorKind;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;

use crate::config::JwtConfig;
use crate::error::AppError;
use crate::routes::AppState;

const INVALID_TOKEN: &str = "Missing or invalid access token.";
const EXPIRED_TOKEN: &str = "Access token has expired.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Admin,
    User,
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: i32,
    #[allow(dead_code)]
    pub username: String,
    pub role: Role,
}

impl AuthUser {
    /// None = may see every order (Admin); Some(id) = only orders owned by this user.
    pub fn scope(&self) -> Option<i32> {
        match self.role {
            Role::Admin => None,
            Role::User => Some(self.id),
        }
    }
}

/// Claims written by the Auth Service. exp/iss/aud are checked by `Validation`.
#[derive(Deserialize)]
struct Claims {
    sub: String,
    #[serde(default)]
    username: Option<String>,
    role: String,
}

pub struct JwtValidator {
    key: DecodingKey,
    validation: Validation,
}

impl JwtValidator {
    pub fn new(cfg: &JwtConfig) -> Self {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_issuer(&[&cfg.issuer]);
        validation.set_audience(&[&cfg.audience]);
        validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
        validation.leeway = 30;
        Self { key: DecodingKey::from_secret(cfg.secret.as_bytes()), validation }
    }

    pub fn validate(&self, token: &str) -> Result<AuthUser, AppError> {
        let data = decode::<Claims>(token, &self.key, &self.validation).map_err(|e| {
            tracing::info!(reason = ?e.kind(), "JWT validation failed");
            match e.kind() {
                ErrorKind::ExpiredSignature => AppError::Unauthorized(EXPIRED_TOKEN),
                _ => AppError::Unauthorized(INVALID_TOKEN),
            }
        })?;

        let claims = data.claims;
        let id = claims
            .sub
            .parse::<i32>()
            .ok()
            .filter(|id| *id > 0)
            .ok_or(AppError::Unauthorized(INVALID_TOKEN))?;
        let role = match claims.role.as_str() {
            "Admin" => Role::Admin,
            "User" => Role::User,
            _ => return Err(AppError::Unauthorized(INVALID_TOKEN)),
        };

        Ok(AuthUser { id, username: claims.username.unwrap_or_default(), role })
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized(INVALID_TOKEN))?;

        let (scheme, token) = header.split_once(' ').ok_or(AppError::Unauthorized(INVALID_TOKEN))?;
        if !scheme.eq_ignore_ascii_case("bearer") || token.trim().is_empty() {
            return Err(AppError::Unauthorized(INVALID_TOKEN));
        }

        state.jwt.validate(token.trim())
    }
}
