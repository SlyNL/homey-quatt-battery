'use strict';

const { Device } = require('homey');
const QuattRemoteAuthClient     = require('../../lib/QuattRemoteAuthClient');
const QuattHomeBatteryApiClient = require('../../lib/QuattHomeBatteryApiClient');

const STORAGE_KEY = 'quatt_auth';

class QuattHomeBatteryDevice extends Device {

  async onInit() {
    this.log('QuattHomeBatteryDevice init:', this.getName());

    // Re-hydrate auth from shared app-level storage
    let stored = {};
    try {
      stored = (await this.homey.settings.get(STORAGE_KEY)) || {};
    } catch (_) { /* no stored tokens yet */ }

    this._auth = new QuattRemoteAuthClient(this.homey);
    this._auth.loadTokens(stored.idToken, stored.refreshToken);
    this._auth.loadProfile(stored.firstName, stored.lastName);

    const data = this.getData();
    this._api  = new QuattHomeBatteryApiClient(this._auth, this.homey, data.installationId);

    // Internal state for edge-trigger detection
    this._lastSoc           = null;
    this._lastFlowDirection = null;

    // Register flow card handlers
    this._registerFlowCards();

    // Snelle poll (elke minuut) – alleen live status voor vloeiende grafieken
    await this._pollLive();
    this._pollLiveInterval = this.homey.setInterval(
      () => this._pollLive(),
      60 * 1000
    );

    // Trage poll – alle data inclusief insights, savings, energyflow
    await this._poll();
    this._pollInterval = this.homey.setInterval(
      () => this._poll(),
      (this.getSetting('poll_interval') || 5) * 60 * 1000
    );
  }

  _registerFlowCards() {
    // ── Conditions ────────────────────────────────────────────────────────────

    this.homey.flow.getConditionCard('battery_soc_is_above')
      .registerRunListener(async (args) => {
        const soc = await args.device.getCapabilityValue('measure_battery');
        return soc !== null && soc > args.threshold;
      });

    this.homey.flow.getConditionCard('battery_is_charging')
      .registerRunListener(async (args) => {
        const dir = await args.device.getCapabilityValue('quatt_power_flow_direction');
        return String(dir).toLowerCase().includes('charg');
      });

    this.homey.flow.getConditionCard('battery_is_discharging')
      .registerRunListener(async (args) => {
        const dir = await args.device.getCapabilityValue('quatt_power_flow_direction');
        return String(dir).toLowerCase().includes('discharg');
      });

    // Trigger cards are fired from _poll(); no runListener needed for device triggers
  }

  async onSettings({ newSettings }) {
    // Restart polling with new interval
    if (this._pollInterval) this.homey.clearInterval(this._pollInterval);
    this._pollInterval = this.homey.setInterval(
      () => this._poll(),
      (newSettings.poll_interval || 5) * 60 * 1000
    );
    // Live poll altijd op 1 minuut
    if (this._pollLiveInterval) this.homey.clearInterval(this._pollLiveInterval);
    this._pollLiveInterval = this.homey.setInterval(
      () => this._pollLive(),
      60 * 1000
    );

    // Push updated solar capacity to API if changed
    if (newSettings.solar_capacity_kwp !== undefined) {
      const ok = await this._api.updateSolarCapacity(newSettings.solar_capacity_kwp);
      if (!ok) this.error('Failed to update solar capacity via API');
    }
  }

  async onDeleted() {
    if (this._pollInterval)     this.homey.clearInterval(this._pollInterval);
    if (this._pollLiveInterval) this.homey.clearInterval(this._pollLiveInterval);
    this.log('QuattHomeBatteryDevice deleted');
  }

  // ─── Polling ──────────────────────────────────────────────────────────────

  /**
   * Snelle poll: alleen live batterijstatus voor vloeiende grafieken in Homey Energy.
   */
  async _pollLive() {
    if (!this._auth.isAuthenticated) return;
    try {
      const statusResp = await this._api.getStatus();
      if (!statusResp || !statusResp.result) return;
      const r = statusResp.result;

      if (r.live) {
        // measure_power: positief = laden, negatief = ontladen
        if (r.live.powerInKW !== undefined || r.live.powerKw !== undefined) {
          const dir = String(r.live.powerFlowDirection || '').toLowerCase();
          const isDischarging = dir.includes('discharg');
          const watts = (r.live.powerInKW ?? r.live.powerKw ?? 0) * 1000 * (isDischarging ? -1 : 1);
          await this._setCapSafe('measure_power', watts);
        }
        if (r.live.chargeStatePercent !== undefined) {
          await this._setCapSafe('measure_battery', r.live.chargeStatePercent);
        }
        if (r.live.powerFlowDirection !== undefined) {
          await this._setCapSafe('quatt_power_flow_direction', String(r.live.powerFlowDirection));
        }
      }
    } catch (err) {
      this.error('Live poll error:', err.message);
    }
  }

  /**
   * Trage poll: alle data inclusief insights, savings en energy flow.
   */
  async _poll() {
    this.log('Polling Quatt Home Battery API...');

    // Ensure auth is valid (token refresh if needed)
    if (!this._auth.isAuthenticated) {
      const ok = await this._auth.ensureAuthenticated();
      if (!ok) {
        this.error('Re-authentication failed');
        this.setUnavailable(this.homey.__('errors.auth_failed'));
        return;
      }
      // Save refreshed tokens
      await this.homey.settings.set(STORAGE_KEY, {
        idToken:      this._auth.idToken,
        refreshToken: this._auth._refreshToken,
        firstName:    this._auth.firstName,
        lastName:     this._auth.lastName,
      });
    }

    let allData;
    try {
      allData = await this._api.getAllData();
    } catch (err) {
      this.error('Poll error:', err.message);
      return;
    }

    if (!allData) {
      this.error('No data returned from API');
      return;
    }

    this.setAvailable();

    // ── Live status capabilities ──────────────────────────────────────────

    if (allData.chargeStatePercent !== undefined) {
      const newSoc = allData.chargeStatePercent;
      const oldSoc = this._lastSoc;

      await this._setCapSafe('measure_battery', newSoc);

      // Fire threshold triggers
      if (oldSoc !== null) {
        const trigBelow = this.homey.flow.getDeviceTriggerCard('battery_soc_below');
        const trigAbove = this.homey.flow.getDeviceTriggerCard('battery_soc_above');
        try {
          await trigBelow.trigger(this, {}, { threshold: newSoc });
        } catch (_) { /* card may not be registered yet */ }
        try {
          await trigAbove.trigger(this, {}, { threshold: newSoc });
        } catch (_) { /* card may not be registered yet */ }
      }
      this._lastSoc = newSoc;
    }

    if (allData.powerKw !== undefined) {
      // Homey home battery convention:
      //   positive = charging (consuming power)
      //   negative = discharging (producing power)
      // Quatt API returns powerKw as unsigned; we derive the sign from powerFlowDirection.
      const dir = String(allData.powerFlowDirection || '').toLowerCase();
      const isDischarging = dir.includes('discharg');
      const watts = allData.powerKw * 1000 * (isDischarging ? -1 : 1);
      await this._setCapSafe('measure_power', watts);
    }

    if (allData.powerFlowDirection !== undefined) {
      const newDir = String(allData.powerFlowDirection).toLowerCase();
      const oldDir = this._lastFlowDirection;

      await this._setCapSafe('quatt_power_flow_direction', String(allData.powerFlowDirection));

      if (oldDir !== null && newDir !== oldDir) {
        const isCharging    = newDir.includes('charg') && !newDir.includes('dis');
        const isDischarging = newDir.includes('discharg');
        const isIdle        = !isCharging && !isDischarging;

        const fire = async (cardId) => {
          try {
            await this.homey.flow.getDeviceTriggerCard(cardId).trigger(this, {}, {});
          } catch (_) { /* ignore if not registered */ }
        };

        if (isCharging)    await fire('battery_charging');
        if (isDischarging) await fire('battery_discharging');
        if (isIdle)        await fire('battery_idle');
      }
      this._lastFlowDirection = newDir;
    }

    if (allData.controlAction !== undefined) {
      await this._setCapSafe('quatt_control_action', String(allData.controlAction));
    }

    if (allData.controlMode !== undefined) {
      await this._setCapSafe('quatt_control_mode', String(allData.controlMode));
    }

    if (allData.capacityKWh !== undefined) {
      await this._setCapSafe('quatt_capacity_kwh', allData.capacityKWh);
    }

    // ── Savings ───────────────────────────────────────────────────────────

    if (allData.savings) {
      const cum  = allData.savings.cumulative || {};
      const yest = allData.savings.yesterday  || {};

      if (cum.totalSavingsEurInclVat !== undefined) {
        await this._setCapSafe('quatt_savings_total', cum.totalSavingsEurInclVat);
      }
      if (yest.totalSavingsEurInclVat !== undefined) {
        await this._setCapSafe('quatt_savings_yesterday', yest.totalSavingsEurInclVat);
      }
    }

    // ── Cumulative energy meters (required for Homey Energy overview) ────────
    //
    // Homey Energy expects meter_power.charged / meter_power.discharged to be
    // CUMULATIVE (ever-increasing) kWh values. The Quatt API exposes lifetime
    // totals via the insights/savings endpoints, so we use those directly.
    //
    // Fallback: if the API doesn't return lifetime totals we accumulate
    // per-poll deltas ourselves using the stored device store.

    if (allData.lifetimeChargedKWh !== undefined) {
      await this._setCapSafe('meter_power.charged', allData.lifetimeChargedKWh);
    } else if (allData.energyFlow && allData.energyFlow.batteryChargedKWh !== undefined) {
      // Accumulate: add today's delta on top of the stored lifetime offset
      await this._accumulateMeter('meter_power.charged', allData.energyFlow.batteryChargedKWh);
    }

    if (allData.lifetimeDischargedKWh !== undefined) {
      await this._setCapSafe('meter_power.discharged', allData.lifetimeDischargedKWh);
    } else if (allData.energyFlow && allData.energyFlow.batteryDischargedKWh !== undefined) {
      await this._accumulateMeter('meter_power.discharged', allData.energyFlow.batteryDischargedKWh);
    }

    // ── Solar capacity sync from API ──────────────────────────────────────

    if (allData.solarCapacitykWp !== undefined) {
      await this.setSettings({ solar_capacity_kwp: allData.solarCapacitykWp });
    }
  }

  /**
   * Accumulate a "today" kWh value on top of a persisted lifetime offset so that
   * meter_power capabilities are always cumulative and never decrease.
   *
   * Strategy: we persist a "base" offset (= cumulative total at midnight) in the
   * device store. Each poll adds (today's kWh) on top of that base.
   * At day-rollover (today's value < last today's value) we update the base.
   *
   * @param {string} capId   - capability id, e.g. 'meter_power.charged'
   * @param {number} todayKwh - today's kWh value from the API (resets each day)
   */
  async _accumulateMeter(capId, todayKwh) {
    if (todayKwh === null || todayKwh === undefined) return;

    const storeKey   = `__meter_base_${capId.replace('.', '_')}`;
    const lastKey    = `__meter_last_${capId.replace('.', '_')}`;
    let base         = (await this.getStoreValue(storeKey)) || 0;
    const lastToday  = (await this.getStoreValue(lastKey))  || 0;

    // Detect day rollover: today's value reset (decreased significantly)
    if (todayKwh < lastToday - 0.01) {
      base += lastToday;
      await this.setStoreValue(storeKey, base);
    }

    await this.setStoreValue(lastKey, todayKwh);
    await this._setCapSafe(capId, base + todayKwh);
  }

  /**
   * Safe capability setter – only updates when capability is registered
   * and the value is not null/undefined.
   */
  async _setCapSafe(capId, value) {
    if (value === null || value === undefined) return;
    if (!this.hasCapability(capId)) return;
    try {
      await this.setCapabilityValue(capId, value);
    } catch (err) {
      this.error(`setCapabilityValue(${capId}) failed:`, err.message);
    }
  }
}

module.exports = QuattHomeBatteryDevice;
