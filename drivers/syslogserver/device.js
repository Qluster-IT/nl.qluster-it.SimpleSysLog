'use strict';

const { BL } = require('betterlogiclibrary');
const Homey = require('homey');
const Syslog = require('./../../lib/simple-syslog-server') ;

class SyslogServerDevice extends Homey.Device {

	async onInit() {
		
		await this.startSysLogServer();
	}

	// async onUninit() {
	// 	for (const severity of Object.values(this.homey.app.Loggers)) 
	// 		if(severity && severity.length>0 && severity.indexOf(this)>-1) severity.splice(severity.indexOf(this),1);			

	// }

	async onSettings({ oldSettings, newSettings, changedKeys }) {
		await this.startSysLogServer(newSettings);
	}


	// startsysLog
	async startSysLogServer(settings) {
		//if(!settings) settings = this.settings;
		
		this.settings = settings || this.getSettings();
		

		if(this.server) {
			this.server.close();
			delete this.server;
		}
		// Create our syslog server with the given transport
		const socktype = 'TCP'; // or 'TCP' or 'TLS'
		const address = ''; // Any
		const port = 514;
		this.server = Syslog(socktype);

		// State Information
		this.listening = false;
		this.clients = [];
		this.count = 0;

		this.server.on('msg', data => {
			//console.log('message received (%i) from %s:%i\n%o\n', ++this.count, data.address, data.port, data);
			if (data && this.settings.log_syslogs === true) this.homey.app.addLogToDB(data.msg, data.tag, { facility:data.facilityCode, severity:data.severityCode, timestamp:data.timestamp, hostname:data.hostname, source:'syslogserver' });
		
			/*
			message received (1) from ::ffff:192.168.1.13:59666
			{
			  "facility": "daemon",
			  "facilityCode": 3,
			  "severity": "info",
			  "severityCode": 6,
			  "tag": "systemd[1]",
			  "timestamp": "2018-12-26T17:53:57.000Z",
			  "hostname": "localhost",
			  "address": "::ffff:192.168.1.13",
			  "family": "IPv6",
			  "port": 20514,
			  "size": 80,
			  "msg": "Started Daily apt download activities."
			}	
			*/
		})
			.on('invalid', err => {
				console.warn('Invalid message format received: %o\n', err);
			})
			.on('error', err => {
				console.warn('Client disconnected abruptly: %o\n', err);
			})
			.on('connection', s => {
				let addr = s.address().address;
				//console.log(`Client connected: ${addr}\n`);
				this.clients.push(s);
				s.on('end', () => {
					//console.log(`Client disconnected: ${addr}\n`);
					let i = this.clients.indexOf(s);
					if (i !== -1)
						this.clients.splice(i, 1);
				});
			})
			.listen({ host: address, port: port })
			.then(() => {
				this.listening = true;
				console.log(`Now listening on: ${address}:${port}`);
			})
			.catch(err => {
				if ((err.code == 'EACCES') && (port < 1024)) {
					console.error('Cannot listen on ports below 1024 without root permissions. Select a higher port number: %o', err);
				}
				else { // Some other error so attempt to close server socket
					console.error(`Error listening to ${address}:${port} - %o`, err);
					try {
						if (this.listening)
							this.server.close();
					}
					catch (err) {
						console.warn(`Error trying to close server socket ${address}:${port} - %o`, err);
					}
				}
			});


	}

}

module.exports = SyslogServerDevice;
