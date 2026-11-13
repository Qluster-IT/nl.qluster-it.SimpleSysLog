'use strict';
const { BL } = require('betterlogiclibrary');
const Homey = require('homey');
const { randomBytes } = require('crypto');

const hostname = require('os').hostname();

class SyslogClientDriver extends Homey.Driver {
	async onInit() {
		this.hostname = hostname;

		const logCard = this.homey.flow.getActionCard('syslogclient_log');
		logCard.registerRunListener(async (args, state)=>{
			try {				
				const message = typeof args.message === 'string'
					? await BL.decode(args.message)
					: args.message;
				const group = typeof args.group === 'string'
					? await BL.decode(args.group)
					: args.group;
				return await args.device.log({ ...args, message, group });
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

module.exports = SyslogClientDriver;
