# Quatt Home Battery – Homey App

Unofficial Homey integration for the **Quatt Home Battery**, based on the reverse-engineered Quatt mobile API.

> ⚠️ **Beta status** – the Quatt mobile API is reverse-engineered and may change without notice.
> No official support from Quatt.

---

## Features

| Category | Capabilities |
|---|---|
| Live status | State of charge (%), Power (W), Power flow direction, Control action, Control mode, Battery capacity (kWh) |
| Savings | Total cumulative savings (€ incl. VAT), Yesterday's savings (€) |
| Today's insights | Energy charged/discharged (kWh), Peak charge/discharge power |
| Energy flow | Solar production, House consumption, Grid import/export (kWh) |
| Settings | Poll interval, Solar capacity (kWp) |

---

## Pairing

You need three values from the **battery label** or the **Quatt mobile app**:

1. **UUID** (access key)
2. **Serial number**
3. **Check code**

### Steps

1. In Homey, go to **Devices → Add device → Quatt Home Battery**
2. Enter your **first name** and **last name** (used for anonymous Firebase auth; stored on your Homey)
3. Enter the **UUID** and **serial number**
4. Enter the **check code**
5. Homey pairs the battery via the Quatt API and creates the device

---

## Project structure

```
homey-quatt-battery/
├── app.js                              Main app entry
├── app.json                            Homey manifest (capabilities, driver, settings)
├── package.json
├── locales/
│   ├── en.json
│   └── nl.json
├── lib/
│   ├── QuattRemoteAuthClient.js        Firebase anonymous auth + token refresh
│   └── QuattHomeBatteryApiClient.js    Quatt mobile API wrapper
└── drivers/
    └── quatt_home_battery/
        ├── driver.js                   Handles pairing flow
        ├── device.js                   Polls API, updates capabilities
        └── pair/
            └── check_code.html         Custom pairing step for check code
```

---

## API reference

All calls go to `https://mobile-api.quatt.io/api/v1` with a Firebase Bearer token.

| Method | Path | Purpose |
|---|---|---|
| POST | `/me/devices/homeBattery/pair` | Pair battery → returns `installationUuid` |
| GET  | `/me/installation/{id}` | Installation details (incl. `solarCapacitykWp`) |
| PATCH| `/me/installation/{id}/solarCapacitykWp` | Update solar capacity |
| GET  | `/me/installation/{id}/homeBattery/status` | Live status |
| GET  | `/me/installation/{id}/insights/homeBattery[/{yyyy}/{mm}/{dd}]` | 15-min timeseries |
| GET  | `/me/installation/{id}/insights/energyFlow[/{yyyy}[/{mm}[/{dd}]]]` | Energy flow |
| GET  | `/me/installation/{id}/insights/savings/overview` | Savings overview |

---

## Credits

Based on the work of [@WoutervanderLoopNL](https://github.com/WoutervanderLoopNL) who reverse-engineered
the Quatt mobile app, and the [home-assistant-quatt](https://github.com/marcoboers/home-assistant-quatt) integration.
