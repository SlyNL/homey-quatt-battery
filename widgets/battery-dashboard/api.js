'use strict';

module.exports = {
  async getState({ homey }) {
    return homey.app.getWidgetState();
  },
};
