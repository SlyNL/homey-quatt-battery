'use strict';

const Homey = require('homey');

class QuattHomeBatteryApp extends Homey.App {

  async onInit() {
    this.log('Quatt Home Battery app started');
  }

  // ── Widget API: GET /state ────────────────────────────────────────────────
  // Called by the battery-dashboard widget every 30 s.
  // Returns a flat object of all capability values for the requested device.
  async getState({ homey, query }) {
    const { deviceId } = query || {};

    try {
      const driver  = this.homey.drivers.getDriver('quatt_home_battery');
      const devices = driver.getDevices();
      const device  = devices.find(d => d.id === deviceId);

      if (!device) return null;

      const cap = (id) => device.getCapabilityValue(id);

      return {
        soc:            cap('measure_battery'),
        power:          cap('measure_power'),
        direction:      cap('quatt_power_flow_direction'),
        action:         cap('quatt_control_action'),
        controlMode:    cap('quatt_control_mode'),
        capacityKwh:    cap('quatt_capacity_kwh'),
        savingsTotal:   cap('quatt_savings_total'),
        savingsYday:    cap('quatt_savings_yesterday'),
        savingsBat:     cap('quatt_savings_battery'),
        savingsSolar:   cap('quatt_savings_solar'),
        savingsImbal:   cap('quatt_savings_imbalance'),
        savingsBatYday: cap('quatt_savings_battery_yesterday'),
        savingsSolYday: cap('quatt_savings_solar_yesterday'),
        savingsImbYday: cap('quatt_savings_imbalance_yesterday'),
        peakCharge:     cap('quatt_peak_charge_kw'),
        peakDischarge:  cap('quatt_peak_discharge_kw'),
        maxSoc:         cap('quatt_max_soc_today'),
        minSoc:         cap('quatt_min_soc_today'),
        solar:          cap('quatt_solar_production_kwh'),
        house:          cap('quatt_house_consumption_kwh'),
        gridIn:         cap('quatt_grid_import_kwh'),
        gridOut:        cap('quatt_grid_export_kwh'),
      };
    } catch (err) {
      this.error('Widget getState error:', err.message);
      return null;
    }
  }

}

module.exports = QuattHomeBatteryApp;
