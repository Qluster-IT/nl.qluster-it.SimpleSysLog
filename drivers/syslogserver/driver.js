'use strict';
const Homey = require('homey');
const { randomBytes } = require('crypto');

const hostname = require('os').hostname();

class SyslogServerDriver extends Homey.Driver {
	async onInit() {
		this.hostname = hostname;

		// const logCard = this.homey.flow.getActionCard('syslogserver_log');
		// logCard.registerRunListener(async (args, state)=>{
		// 	try {				
		// 		return await args.device.log(args);
		// 	} catch (error) {
		// 		this.error(error);
		// 		throw new Error(error);
		// 	}
		// });
	}

	async onPairListDevices(deviceName) {
		let randomId = randomBytes(24).toString('hex');

        let device = {
            name: 'Syslog server',
            data: {
                id: 'syslogserver'+randomId
            }
        };

        return [device];
    }

	
}

module.exports = SyslogServerDriver;
