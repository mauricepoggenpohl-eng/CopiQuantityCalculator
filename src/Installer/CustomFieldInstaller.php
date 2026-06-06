<?php declare(strict_types=1);

namespace Copi\QuantityCalculator\Installer;

use Shopware\Core\Framework\Context;
use Shopware\Core\Framework\DataAbstractionLayer\EntityRepository;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Criteria;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Filter\EqualsFilter;
use Shopware\Core\Framework\Uuid\Uuid;
use Shopware\Core\System\CustomField\CustomFieldTypes;

/**
 * Creates (and removes) the product custom field set used to configure the
 * quantity calculator per product.
 *
 * These fields are the single storage layer for the per-product configuration:
 * the dedicated "Quantity calculator" product tab (Administration), the storefront
 * widget, the Store API route and the cart all read/write the same keys.
 *
 * The Administration ships a focused tab that edits these fields with a proper UI
 * (see Resources/app/administration). The generic "Specifications -> Custom fields"
 * card still renders them too (same data), so configuration also works without an
 * Administration build.
 *
 * IDs are derived deterministically from stable names via {@see Uuid::fromStringToHex()}
 * so install is idempotent (upsert) and uninstall can target the same records.
 */
class CustomFieldInstaller
{
    public const SET_NAME = 'quantity_calculator';

    public const FIELD_ENABLED = 'quantity_calculator_enabled';
    public const FIELD_MODE = 'quantity_calculator_mode';
    public const FIELD_FACTOR = 'quantity_calculator_factor';
    public const FIELD_INPUT_UNIT = 'quantity_calculator_input_unit';
    public const FIELD_HELP_TEXT = 'quantity_calculator_help_text';

    public function __construct(private readonly EntityRepository $customFieldSetRepository)
    {
    }

    public function install(Context $context): void
    {
        $this->customFieldSetRepository->upsert([$this->buildCustomFieldSet()], $context);
    }

    public function uninstall(Context $context): void
    {
        $id = $this->customFieldSetRepository->searchIds(
            (new Criteria())->addFilter(new EqualsFilter('name', self::SET_NAME)),
            $context
        )->firstId();

        if ($id === null) {
            return;
        }

        $this->customFieldSetRepository->delete([['id' => $id]], $context);
    }

    /**
     * @return array<string, mixed>
     */
    private function buildCustomFieldSet(): array
    {
        return [
            'id' => Uuid::fromStringToHex(self::SET_NAME),
            'name' => self::SET_NAME,
            'config' => [
                'label' => [
                    'en-GB' => 'Quantity calculator',
                    'de-DE' => 'Mengenrechner',
                ],
                'translated' => true,
            ],
            'relations' => [
                [
                    'id' => Uuid::fromStringToHex(self::SET_NAME . '.relation.product'),
                    'entityName' => 'product',
                ],
            ],
            'customFields' => [
                $this->switchField(self::FIELD_ENABLED, 1, [
                    'en-GB' => 'Enable quantity calculator',
                    'de-DE' => 'Mengenrechner aktivieren',
                ]),
                $this->selectField(self::FIELD_MODE, 2, [
                    'en-GB' => 'Calculation type',
                    'de-DE' => 'Berechnungsart',
                ], [
                    ['value' => 'area', 'label' => ['en-GB' => 'Area (e.g. m²)', 'de-DE' => 'Fläche (z. B. m²)']],
                    ['value' => 'length', 'label' => ['en-GB' => 'Length (e.g. m)', 'de-DE' => 'Länge (z. B. m)']],
                    ['value' => 'consumption', 'label' => ['en-GB' => 'Consumption', 'de-DE' => 'Verbrauch']],
                ]),
                $this->floatField(self::FIELD_FACTOR, 3, [
                    'en-GB' => 'Coverage per sales unit',
                    'de-DE' => 'Bedarf je Verkaufseinheit',
                ], [
                    'en-GB' => 'How much of the customer input one sales unit covers. Example: one box of flooring covers 2.5 m² -> enter 2.5. Required quantity = ceil(need / this value).',
                    'de-DE' => 'Wie viel des Kundenbedarfs eine Verkaufseinheit abdeckt. Beispiel: ein Paket Bodenbelag deckt 2,5 m² ab -> 2,5 eintragen. Benötigte Menge = aufgerundet(Bedarf / dieser Wert).',
                ]),
                $this->textField(self::FIELD_INPUT_UNIT, 4, [
                    'en-GB' => 'Input unit label (e.g. m², m, L)',
                    'de-DE' => 'Einheit der Eingabe (z. B. m², m, l)',
                ]),
                $this->textField(self::FIELD_HELP_TEXT, 5, [
                    'en-GB' => 'Help text shown to the customer',
                    'de-DE' => 'Hilfetext für den Kunden',
                ]),
            ],
        ];
    }

    /**
     * @param array<string, string> $label
     *
     * @return array<string, mixed>
     */
    private function switchField(string $name, int $position, array $label): array
    {
        return [
            'id' => Uuid::fromStringToHex(self::SET_NAME . '.' . $name),
            'name' => $name,
            'type' => CustomFieldTypes::BOOL,
            'config' => [
                'label' => $label,
                'componentName' => 'sw-field',
                'customFieldType' => 'switch',
                'type' => 'switch',
                'customFieldPosition' => $position,
            ],
        ];
    }

    /**
     * @param array<string, string> $label
     *
     * @return array<string, mixed>
     */
    private function textField(string $name, int $position, array $label): array
    {
        return [
            'id' => Uuid::fromStringToHex(self::SET_NAME . '.' . $name),
            'name' => $name,
            'type' => CustomFieldTypes::TEXT,
            'config' => [
                'label' => $label,
                'componentName' => 'sw-field',
                'customFieldType' => 'text',
                'type' => 'text',
                'customFieldPosition' => $position,
            ],
        ];
    }

    /**
     * @param array<string, string> $label
     * @param array<string, string> $helpText
     *
     * @return array<string, mixed>
     */
    private function floatField(string $name, int $position, array $label, array $helpText): array
    {
        return [
            'id' => Uuid::fromStringToHex(self::SET_NAME . '.' . $name),
            'name' => $name,
            'type' => CustomFieldTypes::FLOAT,
            'config' => [
                'label' => $label,
                'helpText' => $helpText,
                'componentName' => 'sw-field',
                'customFieldType' => 'number',
                'type' => 'number',
                'numberType' => 'float',
                'min' => 0,
                'customFieldPosition' => $position,
            ],
        ];
    }

    /**
     * @param array<string, string> $label
     * @param array<int, array<string, mixed>> $options
     *
     * @return array<string, mixed>
     */
    private function selectField(string $name, int $position, array $label, array $options): array
    {
        return [
            'id' => Uuid::fromStringToHex(self::SET_NAME . '.' . $name),
            'name' => $name,
            'type' => CustomFieldTypes::SELECT,
            'config' => [
                'label' => $label,
                'componentName' => 'sw-single-select',
                'customFieldType' => 'select',
                'options' => $options,
                'customFieldPosition' => $position,
            ],
        ];
    }
}
