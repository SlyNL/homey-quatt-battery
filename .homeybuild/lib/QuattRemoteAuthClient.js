'use strict';

/**
 * QuattRemoteAuthClient
 *
 * Mirrors the Python QuattRemoteAuthClient from the HA integration.
 * Handles Firebase anonymous signup, token refresh and authenticated
 * requests to the Quatt mobile API (https://mobile-api.quatt.io/api/v1).
 */

const FIREBASE_INSTALLATIONS_URL = 'https://firebaseinstallations.googleapis.com/v1/projects/quatt-production/installations';
const FIREBASE_REMOTE_CONFIG_URL = 'https://firebaseremoteconfig.googleapis.com/v1/projects/1074628551428/namespaces/firebase:fetch';
const FIREBASE_SIGNUP_URL        = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const FIREBASE_ACCOUNT_INFO_URL  = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const FIREBASE_TOKEN_URL         = 'https://securetoken.googleapis.com/v1/token';
const QUATT_API_BASE_URL         = 'https://mobile-api.quatt.io/api/v1';

const GOOGLE_API_KEY            = 'AIzaSyDM4PIXYDS9x53WUj-tDjOVAb6xKgzxX9Y';
const GOOGLE_APP_ID             = '1:1074628551428:android:20ddeaf85c3cfec3336651';
const GOOGLE_APP_INSTANCE_ID    = 'dwNCvvXLQrqvmUJlZajYzG';
const GOOGLE_ANDROID_CERT       = '1110A8F9B0DE16D417086A4BDBCF956070F0FD97';
const GOOGLE_ANDROID_PACKAGE    = 'io.quatt.mobile.android';
const GOOGLE_CLIENT_VERSION     = 'Android/Fallback/X24000001/FirebaseCore-Android';
const GOOGLE_FIREBASE_CLIENT    = 'H4sIAAAAAAAAAKtWKkvMKU0tLk5NLindoKTQHOLqm5mXmpSamFqUWpKeX5SanJiXmpaamFSUmpyRWpRalJqXmpxalJqXlpqUmpRUWpSSmgwAFQonGFAAAAA';

class QuattRemoteAuthClient {

  constructor(homey) {
    this._homey = homey;
    this._idToken = null;
    this._refreshToken = null;
    this._firstName = null;
    this._lastName = null;
    this._fid = null;
    this._firebaseAuthToken = null;
    this._refreshing = false;
  }

  get idToken()        { return this._idToken; }
  get isAuthenticated(){ return this._idToken !== null; }
  get firstName()      { return this._firstName; }
  get lastName()       { return this._lastName; }

  loadTokens(idToken, refreshToken) {
    this._idToken      = idToken      || null;
    this._refreshToken = refreshToken || null;
  }

  loadProfile(firstName, lastName) {
    this._firstName = firstName || null;
    this._lastName  = lastName  || null;
  }

  // ─── Firebase header helpers ────────────────────────────────────────────────

  _firebaseHeaders() {
    return {
      'X-Android-Cert':      GOOGLE_ANDROID_CERT,
      'X-Android-Package':   GOOGLE_ANDROID_PACKAGE,
      'X-Client-Version':    GOOGLE_CLIENT_VERSION,
      'X-Firebase-GMPID':    GOOGLE_APP_ID,
      'X-Firebase-Client':   GOOGLE_FIREBASE_CLIENT,
      'Content-Type':        'application/json',
    };
  }

  // ─── Public methods ──────────────────────────────────────────────────────────

  /**
   * Ensure we have valid tokens. Signs up a new anonymous Firebase user if needed.
   */
  async ensureAuthenticated(firstName, lastName) {
    if (firstName) this._firstName = firstName;
    if (lastName)  this._lastName  = lastName;

    const effectiveFirst = this._firstName || 'Homey';
    const effectiveLast  = this._lastName  || 'User';

    if (this._idToken && this._refreshToken) {
      if (await this.refreshToken()) return true;
      this._homey.log('Stored tokens invalid, performing full signup');
    }

    if (!await this._getFirebaseInstallation())  return false;
    if (!await this._firebaseFetch())            return false;
    if (!await this._signupNewUser())            return false;
    if (!await this._getAccountInfo())           return false;
    if (!await this._updateUserProfile(effectiveFirst, effectiveLast)) return false;

    this._firstName = effectiveFirst;
    this._lastName  = effectiveLast;
    return true;
  }

  /**
   * Refresh the Firebase id token.
   */
  async refreshToken() {
    if (!this._refreshToken) return false;
    if (this._refreshing) {
      // Wait briefly and assume the other call rotated the token
      await new Promise(resolve => setTimeout(resolve, 500));
      return this._idToken !== null;
    }

    this._refreshing = true;
    try {
      const res = await fetch(`${FIREBASE_TOKEN_URL}?key=${GOOGLE_API_KEY}`, {
        method:  'POST',
        headers: { ...this._firebaseHeaders() },
        body:    JSON.stringify({ grantType: 'refresh_token', refreshToken: this._refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        this._idToken      = data.id_token;
        this._refreshToken = data.refresh_token;
        this._homey.log('Token refresh successful');
        return true;
      }
      this._homey.error('Token refresh failed:', res.status);
      return false;
    } catch (err) {
      this._homey.error('Token refresh error:', err.message);
      return false;
    } finally {
      this._refreshing = false;
    }
  }

  /**
   * Make an authenticated request to the Quatt mobile API.
   * Returns { status, data } — retries once on 401/403.
   */
  async request(method, path, { body = null, params = null, expectedStatuses = [200, 201, 204], retry = true } = {}) {
    if (!this._idToken) return { status: 0, data: null };

    let url = path.startsWith('http') ? path : `${QUATT_API_BASE_URL}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }

    const doRequest = async () => {
      const opts = {
        method,
        headers: {
          'Authorization': `Bearer ${this._idToken}`,
          'Content-Type':  'application/json',
        },
      };
      if (body !== null) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      let data = null;
      try { data = await res.json(); } catch (_) { /* no json body */ }
      return { status: res.status, data };
    };

    try {
      let result = await doRequest();
      if ([401, 403].includes(result.status) && retry) {
        this._homey.log(`Got ${result.status}, refreshing token`);
        if (await this.refreshToken()) {
          result = await doRequest();
        }
      }
      return result;
    } catch (err) {
      this._homey.error(`Request error ${method} ${url}:`, err.message);
      return { status: 0, data: null };
    }
  }

  // ─── Private Firebase flow steps ────────────────────────────────────────────

  async _getFirebaseInstallation() {
    try {
      const res = await fetch(FIREBASE_INSTALLATIONS_URL, {
        method:  'POST',
        headers: {
          'X-Android-Cert':    GOOGLE_ANDROID_CERT,
          'X-Android-Package': GOOGLE_ANDROID_PACKAGE,
          'x-firebase-client': GOOGLE_FIREBASE_CLIENT,
          'x-goog-api-key':    GOOGLE_API_KEY,
          'Content-Type':      'application/json',
        },
        body: JSON.stringify({
          fid:         GOOGLE_APP_INSTANCE_ID,
          appId:       GOOGLE_APP_ID,
          authVersion: 'FIS_v2',
          sdkVersion:  'a:19.0.1',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        this._fid                = data.fid;
        this._firebaseAuthToken  = (data.authToken || {}).token;
        return true;
      }
      this._homey.error('Firebase installation failed:', res.status);
      return false;
    } catch (err) {
      this._homey.error('Firebase installation error:', err.message);
      return false;
    }
  }

  async _firebaseFetch() {
    if (!this._firebaseAuthToken) return false;
    try {
      const res = await fetch(FIREBASE_REMOTE_CONFIG_URL, {
        method:  'POST',
        headers: {
          'X-Android-Cert':                      GOOGLE_ANDROID_CERT,
          'X-Android-Package':                   GOOGLE_ANDROID_PACKAGE,
          'X-Goog-Api-Key':                      GOOGLE_API_KEY,
          'X-Google-GFE-Can-Retry':              'yes',
          'X-Goog-Firebase-Installations-Auth':  this._firebaseAuthToken,
          'X-Firebase-RC-Fetch-Type':            'BASE/1',
          'Content-Type':                         'application/json',
        },
        body: JSON.stringify({
          appVersion:              '1.42.0',
          firstOpenTime:           '2025-10-14T15:00:00.000Z',
          timeZone:                'Europe/Amsterdam',
          appInstanceIdToken:      this._firebaseAuthToken,
          languageCode:            'en-US',
          appBuild:                '964',
          appInstanceId:           GOOGLE_APP_INSTANCE_ID,
          countryCode:             'US',
          analyticsUserProperties: {},
          appId:                   GOOGLE_APP_ID,
          platformVersion:         '33',
          sdkVersion:              '23.0.1',
          packageName:             GOOGLE_ANDROID_PACKAGE,
        }),
      });
      return res.ok;
    } catch (err) {
      this._homey.error('Firebase remote config error:', err.message);
      return false;
    }
  }

  async _signupNewUser() {
    try {
      const res = await fetch(`${FIREBASE_SIGNUP_URL}?key=${GOOGLE_API_KEY}`, {
        method:  'POST',
        headers: this._firebaseHeaders(),
        body:    JSON.stringify({ clientType: 'CLIENT_TYPE_ANDROID' }),
      });
      if (res.ok) {
        const data = await res.json();
        this._idToken      = data.idToken;
        this._refreshToken = data.refreshToken;
        return true;
      }
      this._homey.error('User signup failed:', res.status);
      return false;
    } catch (err) {
      this._homey.error('User signup error:', err.message);
      return false;
    }
  }

  async _getAccountInfo() {
    if (!this._idToken) return false;
    try {
      const res = await fetch(`${FIREBASE_ACCOUNT_INFO_URL}?key=${GOOGLE_API_KEY}`, {
        method:  'POST',
        headers: this._firebaseHeaders(),
        body:    JSON.stringify({ idToken: this._idToken }),
      });
      return res.ok;
    } catch (err) {
      this._homey.error('Get account info error:', err.message);
      return false;
    }
  }

  async _updateUserProfile(firstName, lastName) {
    const { status } = await this.request('PUT', '/me', {
      body:             { firstName, lastName },
      expectedStatuses: [200, 201],
      retry:            false,
    });
    return [200, 201].includes(status);
  }
}

module.exports = QuattRemoteAuthClient;
