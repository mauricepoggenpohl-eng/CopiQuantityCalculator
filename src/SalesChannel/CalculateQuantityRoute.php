<?php declare(strict_types=1);

namespace Copi\QuantityCalculator\SalesChannel;

use Copi\QuantityCalculator\Installer\CustomFieldInstaller;
use Copi\QuantityCalculator\Service\QuantityCalculatorService;
use Shopware\Core\Content\Product\ProductException;
use Shopware\Core\Content\Product\SalesChannel\SalesChannelProductEntity;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Criteria;
use Shopware\Core\Framework\Log\Package;
use Shopware\Core\Framework\Plugin\Exception\DecorationPatternException;
use Shopware\Core\Framework\Routing\RoutingException;
use Shopware\Core\Framework\Routing\StoreApiRouteScope;
use Shopware\Core\Framework\Uuid\Uuid;
use Shopware\Core\PlatformRequest;
use Shopware\Core\System\SalesChannel\Entity\SalesChannelRepository;
use Shopware\Core\System\SalesChannel\SalesChannelContext;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * POST /store-api/quantity-calculator/calculate
 *
 * Body: { "productId": "<hex>", "need": <number|string> }
 *
 * Loads the product in the current sales-channel context, reads the configured
 * coverage factor (custom field) and the native min/step/max purchase rules, and
 * returns the required order quantity. This is the authoritative calculation used
 * by headless clients and, via the storefront controller, by the storefront.
 */
#[Route(defaults: [PlatformRequest::ATTRIBUTE_ROUTE_SCOPE => [StoreApiRouteScope::ID]])]
#[Package('checkout')]
class CalculateQuantityRoute extends AbstractCalculateQuantityRoute
{
    public function __construct(
        private readonly SalesChannelRepository $productRepository,
        private readonly QuantityCalculatorService $calculator
    ) {
    }

    public function getDecorated(): AbstractCalculateQuantityRoute
    {
        throw new DecorationPatternException(self::class);
    }

    #[Route(
        path: '/store-api/quantity-calculator/calculate',
        name: 'store-api.quantity-calculator.calculate',
        methods: ['POST']
    )]
    public function calculate(Request $request, SalesChannelContext $context): CalculateQuantityRouteResponse
    {
        $productId = (string) $request->request->get('productId', '');

        if ($productId === '' || !Uuid::isValid($productId)) {
            throw RoutingException::invalidRequestParameter('productId');
        }

        $need = (float) str_replace(',', '.', (string) $request->request->get('need', '0'));

        $product = $this->productRepository
            ->search(new Criteria([$productId]), $context)
            ->get($productId);

        if (!$product instanceof SalesChannelProductEntity) {
            throw ProductException::productNotFound($productId);
        }

        $factor = (float) ($product->getTranslatedCustomFieldsValue(CustomFieldInstaller::FIELD_FACTOR) ?? 0);

        $result = $this->calculator->calculate(
            $need,
            $factor,
            $product->getMinPurchase() ?? 1,
            $product->getCalculatedMaxPurchase(),
            $product->getPurchaseSteps() ?? 1
        );

        $result->setUnit((string) ($product->getTranslatedCustomFieldsValue(CustomFieldInstaller::FIELD_INPUT_UNIT) ?? ''));
        $result->setMode((string) ($product->getTranslatedCustomFieldsValue(CustomFieldInstaller::FIELD_MODE) ?? 'area'));

        return new CalculateQuantityRouteResponse($result);
    }
}
