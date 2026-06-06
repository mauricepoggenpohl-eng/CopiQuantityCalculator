/*
 * Administration entry point for the Quantity Calculator plugin.
 *
 * Adds a dedicated "Quantity calculator" tab to the product detail page as a nicer
 * alternative to the generic custom-field card. It edits the same product custom
 * fields (`quantity_calculator_*`), so no storefront/Store API change is required.
 *
 * Requires an Administration build (`bin/build-administration.sh`) — there is no
 * pre-built admin bundle convention like the storefront has.
 */

// 1. The tab view component (referenced by the injected child route).
import './module/sw-product/view/copi-qc-product-detail';

// 2. Override the product detail page to render the tab item.
import './module/sw-product/page/sw-product-detail';

// 3. Register the child route via routeMiddleware (also carries the admin snippets).
import './init/route';
