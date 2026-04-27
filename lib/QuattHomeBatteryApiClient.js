'use strict';

/**
 * QuattHomeBatteryApiClient
 *
 * Mirrors the Python QuattHomeBatteryApiClient from the HA integration.
 * Wraps the Quatt mobile API for home battery status, savings, insights
 * and energy-flow data.
 *
 * API base: https://mobile-api.quatt.io/api/v1
 *
 * Endpoints used:
 *   POST /me/devices/homeBattery/pair
 *   GET  /me/installation/{id}
 *   PATCH /me/installation/{id}/solarCapacitykWp
 *   GET  /me/installation/{id}/homeBattery/status
 *   GET  /me/installation/{id}/insights/homeBattery[/{yyyy}/{mm}/{dd}]
 *   GET  /me/installation/{id}/insights/energyFlow[/{yyyy}[/{mm}[/{dd}]]]
 *   GET  /me/installation/{id}/insights/savings/overview
 */

const INSIGHTS_CACHE_TTL_MS = 60 * 60 * 1000; // 60 min (matches HA INSIGHTS_REMOTE_SCAN_INTERVAL)

class QuattHomeBatteryApiClient {

  /**
   * @param {import('./QuattRemoteAuthClient')} auth  - shared auth client
   * @param {object} homey                            - Homey app instance (for logging)
   * @param {string|null} installationId              - previously paired installation UUID
   */
  constructor(auth, homey, installationId = null) {
    this._auth            = auth;
    this._homey           = homey;
    this._installationId  = installationId;

    // Simple in-process cache: { expiresAt: Date, payload: object }
    this._insightsCache   = null;
    this._energyFlowCache = null;
  }

  get installationId() { return this._installationId; }

  loadInstallationId(id) {
    this._installationId = id || null;
  }

  // ─── Pairing ─────────────────────────────────────────────────────────────────

  /**
   * Authenticate (if not yet) and pair a home battery.
   * @returns {boolean} success
   */
  async authenticateAndPair(accessKeyUuid, serialNumber, checkCode, firstName, lastName) {
    try {
      if (!this._auth.isAuthenticated) {
        const ok = await this._auth.ensureAuthenticated(firstName, lastName);
        if (!ok) return false;
      }

      const installationId = await this._pairHomeBattery(accessKeyUuid, serialNumber, checkCode);
      if (!installationId) return false;

      this._installationId = installationId;
      this._homey.log('Home battery paired, installation id:', installationId);
      return true;
    } catch (err) {
      this._homey.error('Home battery pairing failed:', err.message);
      return false;
    }
  }

  async _pairHomeBattery(accessKeyUuid, serialNumber, checkCode) {
    const { status, data } = await this._auth.request('POST', '/me/devices/homeBattery/pair', {
      body:             { accessKeyUuid, serialNumber, checkCode },
      expectedStatuses: [200, 201],
    });

    if (![200, 201].includes(status) || !data) {
      this._homey.error('Home battery pair failed: status=', status, 'body=', JSON.stringify(data));
      return null;
    }

    const result = (data.result) || {};
    const installationId = result.installationUuid;
    if (!installationId) {
      this._homey.error('Home battery pair returned no installationUuid:', JSON.stringify(data));
      return null;
    }
    return installationId;
  }

  // ─── Status ───────────────────────────────────────────────────────────────────

  /** Fetch live battery status. */
  async getStatus() {
    if (!this._ready()) return null;
    const { status, data } = await this._auth.request(
      'GET',
      `/me/installation/${this._installationId}/homeBattery/status`
    );
    return status === 200 && data ? data : null;
  }

  // ─── Installation ─────────────────────────────────────────────────────────────

  /** Fetch full installation record (includes solarCapacitykWp). */
  async getInstallation() {
    if (!this._ready()) return null;
    const { status, data } = await this._auth.request(
      'GET',
      `/me/installation/${this._installationId}`
    );
    return status === 200 && data ? data : null;
  }

  /** PATCH the installation's solarCapacitykWp field. */
  async updateSolarCapacity(valueKWp) {
    if (!this._ready()) return false;
    const { status } = await this._auth.request(
      'PATCH',
      `/me/installation/${this._installationId}/solarCapacitykWp`,
      { body: { solarCapacitykWp: valueKWp }, expectedStatuses: [200, 201, 204] }
    );
    return [200, 201, 204].includes(status);
  }

  // ─── Insights ────────────────────────────────────────────────────────────────

  /**
   * Fetch home battery insights.
   * Without date args returns today. With all three returns that specific date.
   */
  async getHomeBatteryInsights(year = null, month = null, day = null) {
    if (!this._ready()) return null;
    let path = `/me/installation/${this._installationId}/insights/homeBattery`;
    if (year !== null && month !== null && day !== null) {
      path += `/${String(year).padStart(4,'0')}/${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
    }
    const { status, data } = await this._auth.request('GET', path);
    return status === 200 && data ? data : null;
  }

  /** Cached version of today's insights. */
  async _getTodayInsightsCached() {
    const now = Date.now();
    if (this._insightsCache && this._insightsCache.expiresAt > now) {
      return this._insightsCache.payload;
    }
    const insights = await this.getHomeBatteryInsights();
    if (!insights) {
      return this._insightsCache ? this._insightsCache.payload : null;
    }
    this._insightsCache = { expiresAt: now + INSIGHTS_CACHE_TTL_MS, payload: insights };
    return insights;
  }

  // ─── Energy flow ────────────────────────────────────────────────────────────

  /**
   * Fetch energy-flow timeseries + aggregate totals.
   * Scope rules (mirroring HA):
   *   no args        → today
   *   year+month+day → one day
   *   year+month     → one month
   *   year           → one year
   */
  async getEnergyFlow(year = null, month = null, day = null) {
    if (!this._ready()) return null;

    // Default to today
    if (year === null && month === null && day === null) {
      const today = new Date();
      year  = today.getFullYear();
      month = today.getMonth() + 1;
      day   = today.getDate();
    }

    let path = `/me/installation/${this._installationId}/insights/energyFlow`;
    if (year  !== null) path += `/${String(year).padStart(4,'0')}`;
    if (month !== null) path += `/${String(month).padStart(2,'0')}`;
    if (day   !== null) path += `/${String(day).padStart(2,'0')}`;

    const { status, data } = await this._auth.request('GET', path);
    return status === 200 && data ? data : null;
  }

  async _getTodayEnergyFlowCached() {
    const now = Date.now();
    if (this._energyFlowCache && this._energyFlowCache.expiresAt > now) {
      return this._energyFlowCache.payload;
    }
    const flow = await this.getEnergyFlow();
    if (!flow) {
      return this._energyFlowCache ? this._energyFlowCache.payload : null;
    }
    this._energyFlowCache = { expiresAt: now + INSIGHTS_CACHE_TTL_MS, payload: flow };
    return flow;
  }

  // ─── Savings ─────────────────────────────────────────────────────────────────

  /** Fetch savings overview (cumulative + yesterday). */
  async getSavingsOverview() {
    if (!this._ready()) return null;
    const { status, data } = await this._auth.request(
      'GET',
      `/me/installation/${this._installationId}/insights/savings/overview`
    );
    return status === 200 && data ? data : null;
  }

  // ─── Combined poll ────────────────────────────────────────────────────────────

  /**
   * Fetch all data in one call and merge into a flat object suitable for
   * Homey capability updates. Returns null when nothing could be fetched.
   *
   * Shape of returned object (all keys optional / may be undefined):
   * {
   *   // Live status
   *   chargeStatePercent, powerKw, powerFlowDirection,
   *   controlAction, controlMode, capacityKWh, inverterPowerKw,
   *   serial, lastMeasurementAt,
   *
   *   // Savings
   *   savings: {
   *     cumulative: { totalEurInclVat, homeBatteryEurInclVat, solarEurInclVat, imbalanceEurInclVat },
   *     yesterday:  { totalEurInclVat, homeBatteryEurInclVat, solarEurInclVat, imbalanceEurInclVat },
   *   },
   *
   *   // Today's insights (derived from 15-min timeseries)
   *   insights: {
   *     totalChargedKwh, totalDischargedKwh,
   *     peakChargeKw, peakDischargeKw,
   *     maxChargeStatePercent, minChargeStatePercent,
   *   },
   *
   *   // Today's energy-flow aggregated totals
   *   energyFlow: {
   *     batteryChargedKWh, batteryDischargedKWh,
   *     solarProductionKWh, houseConsumptionKWh,
   *     gridImportKWh, gridExportKWh,
   *   },
   *
   *   solarCapacitykWp,
   * }
   */
  async getAllData() {
    const out = {};

    // 1. Live status
    const statusResp = await this.getStatus();
    if (statusResp && statusResp.result) {
      const r = statusResp.result;
      if (r.live) {
        out.chargeStatePercent = r.live.chargeStatePercent;
        out.powerKw            = r.live.powerInKW ?? r.live.powerKw;
        out.powerFlowDirection = r.live.powerFlowDirection;
        out.controlAction      = r.live.controlAction;
      }
      out.controlMode    = r.controlMode;
      out.capacityKWh    = r.capacityKWh;
      out.inverterPowerKw= r.inverterPowerKw;
      out.serial         = r.serial;
      out.lastMeasurementAt = r.lastMeasurementAt;
    }

    // 2. Savings overview
    const savingsResp = await this.getSavingsOverview();
    if (savingsResp && savingsResp.result) {
      const r = savingsResp.result;
      out.savings = {
        cumulative: _centsToEur(r.cumulative),
        yesterday:  _centsToEur(r.yesterday),
      };
    }

    // 3. Today's insights (cached, summarised)
    const insightsResp = await this._getTodayInsightsCached();
    if (insightsResp && insightsResp.result) {
      out.insights = _summariseTodayInsights(insightsResp.result);
    }

    // 4. Installation (solar capacity)
    const instResp = await this.getInstallation();
    if (instResp && instResp.result) {
      out.solarCapacitykWp = instResp.result.solarCapacitykWp;
    }

    // 5. Today's energy-flow (cached)
    const flowResp = await this._getTodayEnergyFlowCached();
    if (flowResp && flowResp.result) {
      const agg = flowResp.result.aggregated;
      if (agg) {
        out.energyFlow = {
          batteryChargedKWh:    agg.batteryChargedKWh,
          batteryDischargedKWh: agg.batteryDischargedKWh,
          solarProductionKWh:   agg.solarProductionKWh,
          houseConsumptionKWh:  agg.houseConsumptionKWh,
          gridImportKWh:        agg.gridImportKWh,
          gridExportKWh:        agg.gridExportKWh,
        };
      }
    }

    return Object.keys(out).length > 0 ? out : null;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  _ready() {
    return this._auth.isAuthenticated && this._installationId !== null;
  }
}

// ─── Pure helper functions ──────────────────────────────────────────────────

/**
 * Expand *Cents fields into *Eur float fields (÷100), mirroring _add_euro_fields()
 */
function _centsToEur(section) {
  if (!section || typeof section !== 'object') return {};
  const out = { ...section };
  for (const key of Object.keys(section)) {
    if (key.includes('Cents') && section[key] != null) {
      try {
        out[key.replace('Cents', 'Eur')] = parseFloat(section[key]) / 100;
      } catch (_) { /* ignore */ }
    }
  }
  return out;
}

/**
 * Reduce the 15-min timeseries returned by the today insights endpoint
 * to a small set of scalar summary fields. Mirrors _summarize_today_insights().
 */
function _summariseTodayInsights(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  let totalChargedKwh    = 0;
  let totalDischargedKwh = 0;
  let peakChargeKw       = 0;
  let peakDischargeKw    = 0;
  const chargeStates     = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const powerKw = parseFloat(entry.powerInKW);
    if (!isNaN(powerKw)) {
      const energyKwh = powerKw * 0.25; // 15 min = 0.25 h
      if (energyKwh > 0) {
        totalChargedKwh += energyKwh;
        peakChargeKw = Math.max(peakChargeKw, powerKw);
      } else if (energyKwh < 0) {
        totalDischargedKwh += -energyKwh;
        peakDischargeKw = Math.max(peakDischargeKw, -powerKw);
      }
    }
    const cs = parseInt(entry.chargeState);
    if (!isNaN(cs)) chargeStates.push(cs);
  }

  return {
    totalChargedKwh:    Math.round(totalChargedKwh    * 1000) / 1000,
    totalDischargedKwh: Math.round(totalDischargedKwh * 1000) / 1000,
    peakChargeKw:       Math.round(peakChargeKw       * 1000) / 1000,
    peakDischargeKw:    Math.round(peakDischargeKw    * 1000) / 1000,
    maxChargeStatePercent: chargeStates.length ? Math.max(...chargeStates) : null,
    minChargeStatePercent: chargeStates.length ? Math.min(...chargeStates) : null,
  };
}

module.exports = QuattHomeBatteryApiClient;
