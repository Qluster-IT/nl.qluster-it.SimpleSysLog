'use strict';

const Homey = require('homey');

const hostname = require('os').hostname();

class SyslogDriver extends Homey.Driver {
	async onInit() {
		this.hostname = hostname;
	}
	
}

module.exports = SyslogDriver;
