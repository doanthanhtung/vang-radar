# API

Base URL: `/api/v1`

## Public

- `GET /health`
- `GET /products`
- `GET /prices/latest`
- `GET /prices/history?productCode=SJC_BAR&range=7d|30d|180d|1y`
- `GET /metrics/latest?productCode=SJC_BAR`
- `GET /metrics/history?productCode=SJC_BAR&range=7d|30d|180d|1y`
- `GET /signals/latest?productCode=SJC_BAR`
- `GET /market/summary`

Public endpoints use:

```http
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
```

## Admin

Admin endpoints use HTTP basic auth and must not be cached.

- `GET /admin/sources/health`
- `GET /admin/jobs`
- `POST /admin/jobs/run-ingestion`
- `GET /admin/data-quality/latest`

Swagger is served at `/docs`.
