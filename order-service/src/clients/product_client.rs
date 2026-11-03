//! Client for the Product API. Products live in the Product Service's own database
//! (ProductApiDb), so the Order Service never reads them with SQL - it asks the API.
//! The caller's bearer token is forwarded: any logged-in user may read products.

use std::time::Duration;

use rust_decimal::Decimal;
use serde::Deserialize;

use crate::config::ProductServiceConfig;
use crate::error::AppError;
use crate::models::order::ProductRef;

const SERVICE_NAME: &str = "Product";

pub struct ProductClient {
    http: reqwest::Client,
    base_url: String,
}

/// The parts of the Product API's `{ success, data: {...} }` envelope we use.
#[derive(Deserialize)]
struct Envelope {
    success: bool,
    data: Option<ProductDto>,
}

#[derive(Deserialize)]
struct ProductDto {
    name: String,
    #[serde(with = "rust_decimal::serde::float")]
    price: Decimal,
}

impl ProductClient {
    pub fn new(cfg: &ProductServiceConfig) -> Result<Self, String> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_millis(cfg.timeout_ms))
            .build()
            .map_err(|e| format!("cannot create HTTP client: {e}"))?;
        Ok(Self { http, base_url: cfg.url.clone() })
    }

    /// Ok(Some) = product exists, Ok(None) = 404 from the Product API,
    /// Err(ServiceUnavailable) = unreachable, timed out, or an unexpected answer.
    pub async fn get_product(&self, id: i32, bearer_token: &str) -> Result<Option<ProductRef>, AppError> {
        let url = format!("{}/api/products/{id}", self.base_url);
        let started = std::time::Instant::now();

        let result = self.http.get(&url).bearer_auth(bearer_token).send().await;
        let elapsed_ms = started.elapsed().as_millis();

        let response = result.map_err(|e| {
            tracing::error!(product_id = id, elapsed_ms, error = %e, "Product service call failed");
            AppError::ServiceUnavailable(SERVICE_NAME)
        })?;

        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !status.is_success() {
            tracing::error!(product_id = id, status = status.as_u16(), "Product service returned an unexpected status");
            return Err(AppError::ServiceUnavailable(SERVICE_NAME));
        }

        let body: Envelope = response.json().await.map_err(|e| {
            tracing::error!(product_id = id, error = %e, "Product service returned an unreadable body");
            AppError::ServiceUnavailable(SERVICE_NAME)
        })?;
        match (body.success, body.data) {
            (true, Some(p)) => {
                tracing::debug!(product_id = id, elapsed_ms, "Product looked up");
                Ok(Some(ProductRef { name: p.name, price: p.price }))
            }
            _ => {
                tracing::error!(product_id = id, "Product service response had no product data");
                Err(AppError::ServiceUnavailable(SERVICE_NAME))
            }
        }
    }
}
