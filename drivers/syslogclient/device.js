'use strict';

const { BL } = require('betterlogiclibrary');
const Homey = require('homey');
const syslog = require("./../../lib/syslog-client");

class SyslogClientDevice extends Homey.Device {

	async onInit() {
		syslog.Client.prototype.buildFormattedMessage = function buildFormattedMessage(message, options) {
			// Some applications, like LTE CDR collection, need to be able to
			// back-date log messages based on CDR timestamps across different
			// time zones, because of delayed record collection with 3rd parties.
			// Particular useful in when feeding CDRs to Splunk for indexing.
			var date = (typeof options.timestamp === 'undefined') ? new Date() : options.timestamp;

			var pri = (options.facility * 8) + options.severity;

			var newline = message[message.length - 1] === "\n" ? "" : "\n";

			var timestamp, formattedMessage;
			if (typeof options.rfc3164 !== 'boolean' || options.rfc3164) {
				// RFC 3164 uses an obsolete date/time format and header.
				var elems = date.toString().split(/\s+/);

				// var month = elems[1];
				// var day = elems[2];
				// var time = elems[4];



				var month = BL.datetime.toString('MMM', date, 'en');
				var day = BL.datetime.toString('dd', date, 'en');
				var time = BL.datetime.toString('HH:mm:ss', date, 'en');


				/**
				 ** BSD syslog requires leading 0's to be a space.
				 **/
				if (day[0] === "0")
					day = " " + day.substr(1, 1);

				timestamp = month + " " + day + " " + time;

				formattedMessage = "<"
					+ pri
					+ ">"
					+ timestamp
					+ " "
					+ options.syslogHostname
					+ " "
					+ message
					+ newline;
			} else {
				// RFC 5424 obsoletes RFC 3164 and requires RFC 3339
				// (ISO 8601) timestamps and slightly different header.

				var msgid = (typeof options.msgid === 'undefined') ? "-" : options.msgid;


				formattedMessage = "<"
					+ pri
					+ ">1"				// VERSION 1
					+ " "
					+ this.dateFormatter.call(date)
					+ " "
					+ options.syslogHostname
					+ " "
					+ options.app
					+ " "
					+ process.pid
					+ " "
					+ msgid
					+ " - "				// no STRUCTURED-DATA
					+ message
					+ newline;
			}

			//console.log(formattedMessage);
			return Buffer.from(formattedMessage);
		};

		//syslog

		await this.startsysLog();
	}

	async onUninit() {
		for (const severity of Object.values(this.homey.app.Loggers))
			if (severity && severity.length > 0 && severity.indexOf(this) > -1) severity.splice(severity.indexOf(this), 1);

		if (this.syslogClient) {
			try {
				this.syslogClient.close();
				delete this.syslogClient;
			} catch (error) { }
		}

	}

	async onSettings({ oldSettings, newSettings, changedKeys }) {
		await this.startsysLog(newSettings);
	}


	// startsysLog
	async startsysLog(settings) {
		if (this.syslogClient) this.syslogClient.close();

		settings = settings || this.getSettings();
		this.settings = settings;
		// if (settings.useRfc5424 === false) this.appName = this.settings.appName.replaceAll(' ', '\t');
		// else 
		this.appName = this.settings.appName;
		var syslogOpts = {
			syslogHostname: settings.hostname.replace(' ','\t'),
			transport: (settings.transport === 'udp') ? syslog.Transport.Udp : syslog.Transport.Tcp,
			//facility: settings.syslogfacility,
			//severity: settings.syslogseverity,
			port: settings.port,
			rfc3164: (settings.useRfc5424 === false),
			appName: this.appName,
			tcpTimeout:5000,
			dateFormatter:function (date) {
				return BL.datetime.toString('UTC', date);
				// let zz = BL.datetime.toString('zz', date);
				// let iso = BL.datetime.toString('ISO', date);
				// return iso.substr(0, iso.length-1) + zz + (zz.indexOf(':')==-1 ? ':00' : '');
				// //return '2023-03-17T09:05:53+01:00';
				// return this.toISOString()
			}
		};

		// let severityLogger = this.settings.autolog_severity ? Number.parseInt(this.settings.autolog_severity) : null;
		if (this.settings.autolog_severity) {
			if (!this.homey.app.Loggers[this.settings.autolog_severity]) this.homey.app.Loggers[this.settings.autolog_severity] = [];
			if (this.homey.app.Loggers[this.settings.autolog_severity].indexOf(this) == -1) this.homey.app.Loggers[this.settings.autolog_severity].push(this);
		} else {
			if(this.homey.app.Loggers) for (let i = 0; i < this.homey.app.Loggers.length; i++) {
				const element = this.homey.app.Loggers[i];
				if(element.indexOf(this)>-1) element.splice(element.indexOf(this),1) ;
				
			}
		}


		// syslogClient = syslog.createClient(appSettings.syslogServer, syslogOptions);
		try {
			this.syslogClient = syslog.createClient(settings.server, syslogOpts);
			this.syslogClient.on('error', (error) => {
				console.error(error, error.constructor.name);
			});
		} catch (error) {
			this.error('error creating syslog client', error);

		}

		// if(syslogOpts.rfc3164) syslogClient.log(settings.appName + " " + "Test message", undefined, (error)=> {
		// 	console.log(error);
		// }); else syslogClient.log("Test message", undefined, (error)=> {
		// 	console.log(error);
		// });
	}

	async log({ message, severity, facility, hostname, timestamp, data, group }) {
		if (severity) severity = Number.parseInt(severity); else severity = this.settings.severity;
		if (facility) facility = Number.parseInt(facility); else facility = this.settings.facility;
		const appName = group || this.appName;

		if (!timestamp) timestamp = new Date();
		let opts = { facility, severity, timestamp, app: appName };

		// if (this.settings.useRfc5424 === false)  opts.app = opts.app.replaceAll(' ', '\t');
		// else 
		
		if (!message && data) message = data;

		if (message && this.settings.log_syslogs === true) this.homey.app.addLogToDB(message, appName, { facility, severity, timestamp, source:'syslogclient' });
		

		opts.app = opts.app.replaceAll(' ', '\t');


		let fn = () => {
			if (this.settings.useRfc5424) {
				const a = this.syslogClient.log(message, opts, (error) => {
					console.log(error);
				});
				let b = a;
			}
			else this.syslogClient.log(opts.app + " " + message, opts, (error) => {
				console.log(error);
			});
		};

		try {
			//await this.startsysLog();
			fn();
		} catch (error) {
			// await this.startsysLog();
			// fn();
		}
	}
}

module.exports = SyslogClientDevice;
