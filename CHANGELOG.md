# Changelog

## 1.0.0

- Initial release.
- Quantity calculator on the product detail page for area / length / consumption.
- Automatic quantity calculation with min / step / max handling.
- Carries the entered need into cart, checkout and order via line item payload.
- Per-product custom fields and global display settings.
- Pre-built storefront bundle (no Node build required).
- Authoritative server-side calculation via Store API (`POST /store-api/quantity-calculator/calculate`), with an optional storefront mode that uses it (and falls back to in-browser).
- Dedicated "Quantity calculator" tab on the product detail page in the Administration (edits the same custom fields with a focused UI; requires an Administration build).
- Storefront "calculating …" hint shown during the server round trip when server-side calculation is enabled.
