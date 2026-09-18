'use strict';

module.exports = {
  async getLanguage({ homey, body }) {
    // access the post body and perform some action on it.
    console.log('homey.i18n.getLanguage()' + homey.i18n.getLanguage());
    return homey.i18n.getLanguage();
  },
  async log({ homey, body }) {
    // access the post body and perform some action on it.
    if(body.exception) homey.error(JSON.stringify(body.exception));
    return homey.log(body.message);
  },
  async getsettings({ homey, params, body }) {
    return homey.settings.get('log-table-settings-' + params.widgetId)
  }
};
