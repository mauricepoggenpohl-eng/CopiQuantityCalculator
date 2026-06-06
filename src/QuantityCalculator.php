<?php declare(strict_types=1);

namespace Copi\QuantityCalculator;

use Copi\QuantityCalculator\Installer\CustomFieldInstaller;
use Shopware\Core\Framework\DataAbstractionLayer\EntityRepository;
use Shopware\Core\Framework\Plugin;
use Shopware\Core\Framework\Plugin\Context\InstallContext;
use Shopware\Core\Framework\Plugin\Context\UninstallContext;

/**
 * Quantity Calculator plugin.
 *
 * Adds a calculator to the product detail page that turns a customer's need
 * (area, length or consumption) into the required order quantity, respecting
 * the product's native min/step/max purchase rules, and carries the entered
 * need into cart and checkout via the line item payload.
 *
 * Per-product configuration is exposed through product custom fields that are
 * created on install (see {@see CustomFieldInstaller}). Global display options
 * live in the plugin system config (Resources/config/config.xml).
 */
class QuantityCalculator extends Plugin
{
    public function install(InstallContext $installContext): void
    {
        parent::install($installContext);

        $this->createCustomFieldInstaller()->install($installContext->getContext());
    }

    public function uninstall(UninstallContext $uninstallContext): void
    {
        parent::uninstall($uninstallContext);

        // Keep the merchant's per-product configuration when "keep user data" was chosen.
        if ($uninstallContext->keepUserData()) {
            return;
        }

        $this->createCustomFieldInstaller()->uninstall($uninstallContext->getContext());
    }

    private function createCustomFieldInstaller(): CustomFieldInstaller
    {
        /** @var EntityRepository $customFieldSetRepository */
        $customFieldSetRepository = $this->container->get('custom_field_set.repository');

        return new CustomFieldInstaller($customFieldSetRepository);
    }
}
