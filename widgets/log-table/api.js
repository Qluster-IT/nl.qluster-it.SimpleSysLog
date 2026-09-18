'use strict';

module.exports = {
  async getLanguage({ homey, body }) {
    // access the post body and perform some action on it.
    //console.log('homey.i18n.getLanguage()' + homey.i18n.getLanguage());
    return homey.i18n.getLanguage();
  },
  async log({ homey, body }) {
    // access the post body and perform some action on it.
    if(body.exception) homey.error(JSON.stringify(body.exception));
    return homey.log(body.message);
  },
  async getSettings({ homey, params, body }) {
    homey.log('getsettings:');
    homey.log(params);
    return homey.settings.get('log-table-settings-' + params.widgetId)
  },
  async getLogs({ homey }) {
    homey.log('getLogs');

    if (!homey.app.Log) return homey.app.getLogFromBackLog();
    //if(!homey.app.Log) throw new Error(homey.__('bllNotStartedYet'));
    let result = await homey.app.Log.getLogs({ maxSizeKb: 900 });//BL._.take(, 1000);
    return result;
    //return homey.app.getLog();
  },
  async queryLogs({ homey, body }) {
    homey.log('queryLogs');
    if (!homey.app.Log) throw new Error(homey.__('bllNotStartedYet'));
    body.maxSizeKb = 900;
    let result = await homey.app.Log.getLogs(body);//BL._.take(, 1000);
    return result;
  }
};
