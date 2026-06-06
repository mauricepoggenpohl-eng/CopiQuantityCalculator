import deDE from '../snippet/de-DE.json';
import enGB from '../snippet/en-GB.json';

const CHILD_ROUTE_NAME = 'sw.product.detail.quantityCalculator';

/**
 * Registers a thin "plugin" module whose only job is to inject a child route into
 * the existing product detail route via `routeMiddleware` (the documented way to
 * add a tab route to a core module). The middleware runs for every top-level route,
 * so it is guarded to the product detail route and against duplicate registration.
 *
 * `next` is a no-op here (core calls each middleware as `frame(() => {}, route)`),
 * `currentRoute` is the parent route whose `children` is already an array at this point.
 */
Shopware.Module.register('copi-quantity-calculator', {
    type: 'plugin',
    name: 'copi-quantity-calculator',
    title: 'copi-quantity-calculator.general.title',
    description: 'copi-quantity-calculator.general.description',
    color: '#57D9A3',
    icon: 'regular-calculator',

    snippets: {
        'de-DE': deDE,
        'en-GB': enGB,
    },

    routeMiddleware(next, currentRoute) {
        if (
            currentRoute.name === 'sw.product.detail'
            && Array.isArray(currentRoute.children)
            && !currentRoute.children.some((child) => child.name === CHILD_ROUTE_NAME)
        ) {
            currentRoute.children.push({
                name: CHILD_ROUTE_NAME,
                path: '/sw/product/detail/:id/quantity-calculator',
                component: 'copi-qc-product-detail',
                meta: {
                    parentPath: 'sw.product.index',
                    privilege: 'product.viewer',
                },
            });
        }

        next(currentRoute);
    },
});
