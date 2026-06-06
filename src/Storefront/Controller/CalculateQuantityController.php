<?php declare(strict_types=1);

namespace Copi\QuantityCalculator\Storefront\Controller;

use Copi\QuantityCalculator\SalesChannel\AbstractCalculateQuantityRoute;
use Shopware\Core\Framework\Log\Package;
use Shopware\Core\PlatformRequest;
use Shopware\Core\System\SalesChannel\SalesChannelContext;
use Shopware\Storefront\Controller\StorefrontController;
use Shopware\Storefront\Framework\Routing\StorefrontRouteScope;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Thin storefront wrapper around the Store API calculate route so the storefront
 * JavaScript can request the authoritative server-side calculation without a
 * Store API access key (same pattern as the core CookieController/CookieRoute).
 *
 * POST /quantity-calculator/calculate  (name: frontend.quantity-calculator.calculate)
 */
#[Route(defaults: [PlatformRequest::ATTRIBUTE_ROUTE_SCOPE => [StorefrontRouteScope::ID]])]
#[Package('checkout')]
class CalculateQuantityController extends StorefrontController
{
    public function __construct(private readonly AbstractCalculateQuantityRoute $route)
    {
    }

    #[Route(
        path: '/quantity-calculator/calculate',
        name: 'frontend.quantity-calculator.calculate',
        methods: ['POST']
    )]
    public function calculate(Request $request, SalesChannelContext $context): JsonResponse
    {
        $result = $this->route->calculate($request, $context)->getResult();

        return new JsonResponse($result);
    }
}
