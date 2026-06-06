import template from './sw-product-detail.html.twig';

/**
 * Extends the core product detail page to add the "Quantity calculator" tab item.
 * The matching child route is registered in `../../../../init/route.js`.
 */
Shopware.Component.override('sw-product-detail', {
    template,
});
