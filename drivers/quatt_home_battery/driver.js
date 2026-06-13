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
 * Validate check code (6 characters: letters, digits or punctuation)
 */
function validateCheckCode(code) {
  const codePattern = /^.{6}$/;
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

    // Step 1: All credentials in one custom view
    session.setHandler('login', async (data) => {
      accessKeyUuid = (data.username || '').trim();
      serialNumber  = (data.password || '').trim();
      checkCode     = (data.checkCode || '').trim();

      this.log('Pairing with UUID:', accessKeyUuid, 'SN:', serialNumber, 'CC:', checkCode);

      if (!accessKeyUuid || !serialNumber || !checkCode) {
        throw new Error('Vul alle velden in');
      }

      if (!validateUuid(accessKeyUuid)) {
        throw new Error('UUID ongeldig. Verwacht formaat: BAT-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
      }

      if (!validateSerialNumber(serialNumber)) {
        throw new Error('Serienummer ongeldig. Verwacht formaat: QODxxxxxxxxxx (12 cijfers na QOD)');
      }

      if (!validateCheckCode(checkCode)) {
        throw new Error('Check code ongeldig. Verwacht: 6 tekens');
      }

      return true;
    });

    // Step 2: pair with Quatt API and return device list
    session.setHandler('list_devices', async () => {
      this.log('Pairing — UUID:', accessKeyUuid, 'SN:', serialNumber, 'CC:', checkCode);

      // Clear any old stored credentials for fresh pairing
      try {
        await this.homey.settings.unset(STORAGE_KEY);
        this.log('Cleared old credentials for fresh pairing');
      } catch (err) {
        this.log('No old credentials to clear');
      }

      // Create fresh auth client (no stored tokens)
      const auth = new QuattRemoteAuthClient(this.homey);
      const api = new QuattHomeBatteryApiClient(auth, this.homey);

      this.log('Starting authenticateAndPair...');
      let ok;
      try {
        ok = await api.authenticateAndPair(
          accessKeyUuid, serialNumber, checkCode,
          'Homey', 'User'
        );
        this.log('authenticateAndPair result:', ok);
      } catch (err) {
        this.error('Pairing exception:', err);
        this.error('Stack:', err.stack);
        throw new Error(`Koppelen mislukt: ${err.message}`);
      }

      if (!ok) {
        this.error('Pairing returned false (this should not happen)');
        throw new Error('Koppelen mislukt. Controleer UUID, serienummer en check code.');
      }

      this.log('Pairing successful, installation ID:', api.installationId);

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
