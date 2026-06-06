# Quantity Calculator (Mengenrechner) — Shopware 6.7

Automatically turns a customer's **need** (area, length or consumption) into the
**required order quantity** right on the product detail page, respects the
product's min / step / max purchase rules, and carries the entered need into
cart, checkout and order.

Built and verified against **Shopware 6.7.10.1**.

---

## Why

In standard Shopware customers have to work out the order quantity themselves.
For products sold by area, length or consumption (flooring, cable, paint, …)
this regularly causes wrong orders. This plugin does the maths for them.

## Features

- Calculates the required quantity from a customer input.
- Supports the typical cases **area**, **length** and **consumption**.
- Integrated directly into the product detail buy box.
- Writes the result into the native quantity field, so it flows **seamlessly
  into cart and checkout** (and the order).
- Shows **minimum**, **step** and **maximum** purchase hints at the input.
- Per-product configuration via custom fields; global display options via the
  plugin settings. Optional help text guides the customer.

---

## Requirements

- Shopware `~6.7.0`
- PHP 8.2+ (as required by Shopware 6.7)

## Installation

### Via ZIP (Administration)

1. **Settings → System → Plugins → Upload plugin**, choose the ZIP.
2. Install and activate **Quantity Calculator**.
3. Compile the storefront theme so the widget assets are served:
   ```bash
   bin/console assets:install
   bin/console theme:compile
   bin/console cache:clear
   ```

> The plugin ships a **pre-built** storefront JavaScript bundle
> (`Resources/app/storefront/dist/storefront/js/quantity-calculator/quantity-calculator.js`),
> so **no Node/webpack build is required**. `theme:compile` picks it up automatically.

### Via CLI

```bash
bin/console plugin:refresh
bin/console plugin:install --activate QuantityCalculator
bin/console assets:install
bin/console theme:compile
bin/console cache:clear
```

### Rebuilding the storefront JS from source (optional)

Only needed if you change the ES module sources under
`Resources/app/storefront/src/`:

```bash
./bin/build-storefront.sh
```

---

## Configuration

### Per product (dedicated tab)

On install a custom field set **"Quantity calculator"** is added to the product
entity. With the Administration built, open a product → **Quantity calculator**
tab for a focused configuration UI:

| Field | Meaning |
|-------|---------|
| **Enable quantity calculator** | Turns the widget on for this product. |
| **Calculation type** | `Area` / `Length` / `Consumption` (affects labels only). |
| **Coverage per sales unit** | How much of the customer input **one sales unit** covers. E.g. one box of flooring covers `2.5` m² → enter `2.5`. |
| **Input unit label** | Shown next to the input, e.g. `m²`, `m`, `L`. |
| **Help text for customers** | Optional sentence shown above the input. |

The dedicated tab and the generic **Specifications → Custom fields → Quantity
calculator** card edit the **same** values — the tab is just a nicer surface.
The custom-field card works without an Administration build, so configuration is
always possible.

> The product tab is Administration code and therefore needs a one-time
> **Administration build** after install:
> ```bash
> bin/build-administration.sh   # or: composer run build:js:admin
> bin/console cache:clear
> ```
> Until then, use the custom-field card (same data).

The **minimum / step / maximum** values come from the product's native
*Advanced pricing / Deliverability* settings (`minPurchase`, `purchaseSteps`,
`maxPurchase`) — configure them there as usual.

### Global (plugin settings)

**Settings → System → Plugins → Quantity Calculator → ⋯ → Config**:

- **Update the order quantity automatically while typing** (default: on)
- **Show minimum / step / maximum purchase hints** (default: on)
- **Fallback input unit label** (default: `m²`)

---

## How the calculation works

All three modes reduce to one formula:

```
requiredQuantity = ceil(need / coveragePerSalesUnit)
```

The result is then **raised to the minimum**, **aligned upward to the purchase
step**, and **capped at the maximum** (to the largest valid step value ≤ max).

**Examples**

| Need | Coverage / unit | Min | Step | Max | Result |
|-----:|----------------:|----:|-----:|----:|-------:|
| 30 m² | 2.5 | 1 | 1 | – | **12** |
| 120 m | 50 | 1 | 1 | – | **3** |
| 12 | 1 | 5 | 5 | – | **15** (step) |
| 1000 | 1 | 1 | 1 | 100 | **100** (max) |

When the value is adjusted, a short notice is shown under the input.

## Server-side calculation (Store API)

The same calculation is exposed authoritatively on the server, so headless
storefronts can compute the order quantity too:

```
POST /store-api/quantity-calculator/calculate
Headers: sw-access-key: <your-sales-channel-access-key>, Content-Type: application/json
Body:    { "productId": "<hex product id>", "need": 30 }
```

Response:

```json
{
  "quantity": 12,
  "raw": 12.0,
  "valid": true,
  "adjustedToMin": false,
  "adjustedToMax": false,
  "adjustedToStep": false,
  "unit": "m²",
  "mode": "area",
  "apiAlias": "quantity_calculator_result"
}
```

The server loads the product in the current sales-channel context and reads the
configured factor + native min/step/max — the client cannot tamper with them.
The route is decoratable (`AbstractCalculateQuantityRoute`).

**Using it from the storefront:** enable *Use server-side calculation (Store API)*
in the plugin settings. The storefront then calls a thin same-origin wrapper
(`POST /quantity-calculator/calculate`, route `frontend.quantity-calculator.calculate`)
that delegates to the Store API route, and falls back to the in-browser
calculation if the request fails. Default is off (instant in-browser calculation).

## Cart, checkout & order

The customer's entered need is stored in the line item payload
(`quantityCalcNeed`, `quantityCalcUnit`) and rendered as a small note under the
product label in the cart, off-canvas cart, checkout confirm and order detail —
so the context of the calculated quantity stays visible end to end.

---

## Testing

The calculation is covered on both sides (the two suites assert the same cases):

```bash
node --test tests/js/calculation.test.mjs   # storefront JS (no dependencies)
vendor/bin/phpunit                            # server-side service (run inside Shopware)
```

**Manual storefront test plan**

1. Configure a product (enable, type *Area*, coverage `2.5`, unit `m²`,
   min `1`, step `1`).
2. Open the product page → enter `30` → quantity becomes `12`, result text shows
   "Required order quantity: 12".
3. Add to cart → cart line shows "Calculated for 30 m²" and quantity `12`.
4. Proceed to checkout/confirm → the note and quantity are still present.
5. Set min `5` / step `5`, enter `12` → quantity becomes `15` with a step notice.

---

## File structure

```
QuantityCalculator/
├── composer.json
├── src/
│   ├── QuantityCalculator.php                 # plugin lifecycle (creates custom fields)
│   ├── Installer/CustomFieldInstaller.php     # product custom field set
│   ├── Service/QuantityCalculatorService.php  # authoritative calculation (pure)
│   ├── Struct/QuantityCalculationResult.php   # calculation result payload
│   ├── SalesChannel/                          # Store API route (abstract + concrete + response)
│   ├── Storefront/Controller/                 # frontend wrapper around the Store API route
│   └── Resources/
│       ├── config/config.xml                  # global display options
│       ├── config/services.xml                # DI
│       ├── config/routes.xml                  # route loading (SalesChannel + Storefront)
│       ├── snippet/                           # de-DE / en-GB storefront snippets
│       ├── views/storefront/                  # buy-form + cart label overrides + widget
│       └── app/
│           ├── administration/src/            # product "Quantity calculator" tab (needs admin build)
│           │   ├── main.js
│           │   ├── init/route.js              # routeMiddleware injects the tab route
│           │   ├── module/sw-product/...      # page override (tab item) + tab view
│           │   └── snippet/                    # de-DE / en-GB admin snippets
│           └── storefront/
│               ├── src/                       # ES module sources (main.js, plugin, calc)
│               └── dist/storefront/js/...     # pre-built artifact (no build needed)
└── tests/
    ├── QuantityCalculatorServiceTest.php      # PHPUnit (server-side)
    └── js/calculation.test.mjs                # Node test (storefront JS)
```

## License

MIT
