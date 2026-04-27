'use strict';

const Homey = require('homey');

class QuattHomeBatteryApp extends Homey.App {

  async onInit() {
    this.log('Quatt Home Battery app started');
  }

}

module.exports = QuattHomeBatteryApp;
