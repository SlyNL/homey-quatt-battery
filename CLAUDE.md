# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Na elke taak — vaste volgorde

1. **Smoketest:** `npm run smoketest`
2. **Sanity check:** `npm run build`
3. **Bump:** `npm version patch` (of minor/major naar gelang de wijziging)
4. **Specs:** werk relevante readme en bestanden in `/specs` bij

Voor deze plugin (geen npm) betekent dit:
1. **Smoketest:** `php -l` op gewijzigde PHP-bestanden
2. **Sanity check:** logica-trace (transients, AJAX-flows, cache-invalidatie)
3. **Bump:** verhoog `Version:` in de plugin-header én `DWO_VERSION` in `drukwerkdeal-order.php` — beide tegelijk, zelfde getal, formaat `0.xx`
4. **Specs/README:** werk `README.md` changelog-sectie bij

## Versieconventie

Formaat: `0.major_minor` — geen semver. Elke functionele wijziging = nieuwe versie. Zie `feedback_dwo_versioning.md` in memory.

## Architectuur

**Bootstrap:** `drukwerkdeal-order.php` definieert `DWO_VERSION`, `DWO_DIR`, `DWO_URL` en laadt alle klassen via `require_once`.

**API-laag:** `DWO_Api_Client` doet alle Printdeal v3 REST-calls. JWT-token wordt gecached als transient (`dwo_jwt_*`, 50 min). Alle product/order/webhook-methoden gaan via `request()` of `webhook_request()`.

**WooCommerce-koppeling (`DWO_Woo_Integration`):** centrale klasse. Registreert:
- Productmeta-box (SKU, markup, volgorde, splits-config)
- Frontend configurator (`woocommerce_before_add_to_cart_button`) — rendert lege div, JS laadt data via AJAX
- AJAX-handlers: `dwo_frontend_product` (productdata + volgorde), `dwo_frontend_validate` (prijs live), `dwo_admin_get_attrs` (sortable list), `dwo_frontend_artwork_upload`
- Cart-validatie en cart-item-data

**Caching — twee lagen:**
- Server: transient `dwo_cfg_{md5(sku_productid)}`, TTL 6 uur. Wordt gebust in `save_product_field()` bij elke SKU- of volgorde-wijziging.
- Browser: `sessionStorage` met sleutel `dwo_cfg_{sku}_{productid}_{DWO_VERSION}`. Auto-bust bij versie-bump.

**Volgorde configurator:** `_dwo_attr_order` (JSON-array van attribuutnamen) wordt opgeslagen als post meta. `ajax_frontend_product()` sorteert hierop; fallback is `DWO_Api_Client::NL_ATTRIBUTE_ORDER`. De admin-drag-UI schrijft de volgorde naar een hidden input; bij opslaan wordt de transient direct verwijderd.

**Webhooks (`DWO_Webhooks`):** REST-endpoint `POST /wp-json/dwo/v1/webhook`. Verificatie via HMAC-SHA256 (`X-Printdeal-Signature`) of legacy `?secret=` parameter. Verwerkt `order.created` en `orderline.status.updated`. Custom WC-orderstatus: `wc-dwd-shipped`.

**E-mails (`WC_Email_DWO_Status`):** geregistreerd als WooCommerce e-mailklasse. Getriggerd vanuit `DWO_Webhooks::handle_status_updated()` bij `artwork-approved`, `in-production`, `shipped`, `delivered`, `cancelled`.

## Uitbreidingspunten

- **`dwo_attribute_nl_order` filter:** overschrijf de standaard NL-sorteervolgorde van attributen wanneer geen custom volgorde is opgeslagen.
- **`DWO_Api_Client::NL_ATTRIBUTE_ORDER`** en **`DELIVERY_API_NAMES`** zijn constants die de attribuut-herkenning sturen.
