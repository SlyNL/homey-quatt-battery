'use strict';

const { Driver } = require('homey');
const QuattRemoteAuthClient     = require('../../lib/QuattRemoteAuthClient');
const QuattHomeBatteryApiClient = require('../../lib/QuattHomeBatteryApiClient');

const STORAGE_KEY = 'quatt_auth';

/**
 * Validate UUID format (BAT-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 */
function validateUuid(uuid) {
  const uuidPattern = /^BAT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(uuid);
}

/**
 * Validate serial number format (QOD + 12 digits)
 */
function validateSerialNumber(serial) {
  const serialPattern = /^QOD\d{12}$/;
  return serialPattern.test(serial);
}

/**
 * Validate check code (4 digits)
 */
function validateCheckCode(code) {
  const codePattern = /^\d{4}$/;
  return codePattern.test(code);
}

class QuattHomeBatteryDriver extends Driver {

  async onInit() {
    this.log('QuattHomeBatteryDriver initialized');

    this.homey.flow.getDeviceTriggerCard('battery_soc_below')
      .registerRunListener(async (args, state) => {
        return state.threshold !== undefined ? args.threshold >= state.threshold : true;
      });

    this.homey.flow.getDeviceTriggerCard('battery_soc_above')
      .registerRunListener(async (args, state) => {
        return state.threshold !== undefined ? args.threshold <= state.threshold : true;
      });
  }

  async onPair(session) {
    let accessKeyUuid = '';
    let serialNumber  = '';
    let checkCode     = '';

    // Step 1: UUID + serial number via built-in login_credentials template
    // username = UUID, password = serial number
    session.setHandler('login', async (data) => {
      accessKeyUuid = (data.username || '').trim();
      serialNumber  = (data.password || '').trim();
      this.log('Pair step 1 — UUID:', accessKeyUuid, 'SN:', serialNumber);
      
      if (!accessKeyUuid || !serialNumber) {
        throw new Error('Vul UUID en serienummer in');
      }
      
      if (!validateUuid(accessKeyUuid)) {
        throw new Error('UUID ongeldig. Verwacht formaat: BAT-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
      }
      
      if (!validateSerialNumber(serialNumber)) {
        throw new Error('Serienummer ongeldig. Verwacht formaat: QODxxxxxxxxxx (12 cijfers na QOD)');
      }
      
      return true;
    });

    // Step 2: check code via custom HTML view
    session.setHandler('check_code', async ({ checkCode: cc }) => {
      checkCode = (cc || '').trim();
      this.log('Pair step 2 — check code:', checkCode);
      
      if (!checkCode) {
        throw new Error('Vul de check code in');
      }
      
      if (!validateCheckCode(checkCode)) {
        throw new Error('Check code ongeldig. Verwacht: 4 cijfers (bijv. 1234)');
      }
      
      return true;
    });

    // Step 3: pair with Quatt API and return device list
    session.setHandler('list_devices', async () => {
      this.log('Pairing — UUID:', accessKeyUuid, 'SN:', serialNumber, 'CC:', checkCode);

      let stored = {};
      try {
        stored = (await this.homey.settings.get(STORAGE_KEY)) || {};
      } catch (err) {
        this.error('Failed to load stored credentials:', err.message);
        // Continue with empty stored object, new auth will be created
      }

      const auth = new QuattRemoteAuthClient(this.homey);
      auth.loadTokens(stored.idToken, stored.refreshToken);
      auth.loadProfile(stored.firstName || 'Homey', stored.lastName || 'User');

      const api = new QuattHomeBatteryApiClient(auth, this.homey);

      const ok = await api.authenticateAndPair(
        accessKeyUuid, serialNumber, checkCode,
        stored.firstName || 'Homey', stored.lastName || 'User'
      );

      if (!ok) throw new Error(this.homey.__('errors.pairing_failed'));

      await this.homey.settings.set(STORAGE_KEY, {
        idToken:      auth.idToken,
        refreshToken: auth._refreshToken,
        firstName:    auth.firstName,
        lastName:     auth.lastName,
      });

      let deviceName = `Quatt Battery (${serialNumber})`;
      try {
        const s = await api.getStatus();
        if (s && s.result && s.result.serial) deviceName = `Quatt Battery ${s.result.serial}`;
      } catch (_) {}

      return [{
        name: deviceName,
        data: {
          id:             api.installationId,
          installationId: api.installationId,
          serialNumber,
          accessKeyUuid,
          checkCode,
        },
        settings: {
          poll_interval:      5,
          solar_capacity_kwp: 0,
        },
      }];
    });
  }
}

module.exports = QuattHomeBatteryDriver;
