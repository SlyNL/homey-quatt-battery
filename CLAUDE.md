# CLAUDE.md — Quatt Home Battery (Homey-app)

> ## ⚠️ EERSTE TAAK IN DEZE MAP: dit bestand vullen
>
> Dit bestand is op 2026-09-26 leeggemaakt. Er stond een letterlijke kopie in van
> de `CLAUDE.md` van **Drukwerkdeal Order** — `DWO_VERSION`, de Printdeal API,
> WooCommerce-hooks, `php -l` als smoketest, een kleurenpalet. Dit project is
> **geen WordPress-plugin en bevat geen PHP**, dus daar klopte niets van.
>
> **Voordat je hier aan een taak begint:** vul de secties hieronder, en **vraag de
> eigenaar** wat je niet uit de code kunt aflezen. Begin niet aan de inhoudelijke
> taak voordat dit klopt.
>
> De algemene werkwijze in `/Users/Sylvester/VSC/.claude/CLAUDE.md` geldt hier
> deels: **diagnose op bewijs** en **een check moet kunnen falen** zijn
> taal-onafhankelijk en gelden wél. De afrondvolgorde daar noemt `php -l` en een
> plugin-header; hier geldt `npm run lint` en `app.json`.

## Wat dit is

Een **Homey-app** (Athom) die in de **Homey App Store** staat. Node.js met de
Homey SDK. Geen WordPress, geen PHP.

Geverifieerd uit `app.json` en `package.json`:

| Veld | Waarde |
| --- | --- |
| App-id | `io.quatt.battery` |
| Naam | Quatt Home Battery |
| Versie | 2.0.2 |
| Homey SDK | 3 |
| Lint/validate | `npm run lint` → `homey app validate` |
| Driver | `drivers/quatt_home_battery` |

Er is een `.homeychangelog.json` met per-versie changelog-teksten (Engels). Uit de
inhoud blijkt dat deze app naar de store gaat: een entry luidt "Fixes to deploy in
store". Dit is daarmee het enige project hier met een **publieke distributie naar
een externe store** — dat betekent reviewrichtlijnen van Athom, en dat een fout
buiten je eigen beheer terechtkomt.

## Afrondvolgorde voor dit project

Afwijkend van de master, want er is geen PHP:

1. **Smoketest:** `npm run lint` (= `homey app validate`). Dat valideert `app.json`,
   drivers en capabilities — dit is het equivalent van `php -l` hier.
2. **Sanity:** *nog te bepalen; er zijn geen tests. Zie de vragen hieronder.*
3. **Bump:** `version` in `app.json`, semver (nu `2.0.2`).
4. **Changelog:** voeg een entry toe in `.homeychangelog.json` onder het nieuwe
   versienummer. Let op: die teksten zijn **publiek zichtbaar in de store**, dus
   schrijf ze voor eindgebruikers, niet als commitbericht.
5. **Commit/push:** zie master. Nog te bevestigen of hier een GitHub-repo bij hoort.

## Nog te vullen — vraag dit aan de eigenaar

- [ ] **Is er een GitHub-repo?** Er is een `CONTRIBUTING.md`, wat op een publieke
      repo duidt. Welke? En hoort daar een release-flow bij (tag → store-upload)?
- [ ] **Hoe publiceer je?** `homey app publish` handmatig, of via CI?
- [ ] **Tests.** Er zijn geen tests, alleen `homey app validate`. Wil je die
      erbij? De master-regel "een check moet kunnen falen" heeft nu niets om op
      te grijpen.
- [ ] **Staat dit in de publieke store** onder jouw naam, en zijn er gebruikers?
      Dat bepaalt hoe voorzichtig een wijziging moet zijn.
- [ ] **Relatie met Quatt.** Is dit een officiële integratie of een eigen
      koppeling op hun API? Bij het laatste: wat gebeurt er als hun API wijzigt?

## Architectuur

*Nog niet beschreven. Kern zit in `app.js` en `drivers/quatt_home_battery/` —
beschrijf dat pas nadat je het gelezen hebt.*
