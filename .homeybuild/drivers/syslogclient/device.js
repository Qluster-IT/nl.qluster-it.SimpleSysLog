'use strict';

const Homey = require('homey');
const syslog = require("syslog-client");
let syslogClient;

class SyslogClientDevice extends Homey.Device {
	async onInit() {
		this.startsysLog();
	}
	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.startsysLog();
	}
		

	// startsysLog
	startsysLog() {
		let settings = this.getSettings();
		var syslogOpts = {
			syslogHostname: this.driver.hostname,
			//transport: (settings.transport === 'UDP') ? syslog.Transport.Udp : syslog.Transport.Tcp,
			//facility: settings.syslogfacility,
			//severity: settings.syslogseverity,
			port: settings.port,
			//rfc3164: (!settings.enablerfc5424),
			appName: settings.appName
		};

		// syslogClient = syslog.createClient(appSettings.syslogServer, syslogOptions);
		syslogClient = syslog.createClient(settings.hostname, syslogOpts);
		syslogClient.on('error', (error) => {
			console.error(error, error.constructor.name);
			
		});
	}
}

module.exports = SyslogClientDevice;
