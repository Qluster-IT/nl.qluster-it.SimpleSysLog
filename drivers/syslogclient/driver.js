'use strict';
const Homey = require('homey');
const { randomBytes } = require('crypto');

const hostname = require('os').hostname();

class SyslogDriver extends Homey.Driver {
	async onInit() {
		this.hostname = hostname;

		const logCard = this.homey.flow.getActionCard('syslogclient_log');
		logCard.registerRunListener(async (args, state)=>{
			try {				
				return await args.device.log(args);
			} catch (error) {
				this.error(error);
				throw new Error(error);
			}
		});
	}

	async onPairListDevices(deviceName) {
		let randomId = randomBytes(24).toString('hex');

        let device = {
            name: 'Syslog client',
            data: {
                id: 'syslogclient'+randomId
            }
        };

        return [device];
    }

	
}

module.exports = SyslogDriver;
