const { BL } = require("betterlogiclibrary");
const { Defer } = require("betterlogiclibrary/src/bl");
const { statSync, openSync, read, closeSync, createWriteStream, unlinkSync } = require("fs");
//const { Defer } = require("betterlogiclibrary/src/bl");
const { Severity } = require("syslog-client");


const APP_NAME = 'Simple Log';


const F_OK = 0;
const R_OK = 4;
const W_OK = 2;
const X_OK = 1;


// const FFacility = {
//     Kernel :  0,
//     User   :  1,
//     System :  3,
//     Audit  : 13,
//     Alert  : 14,
//     Flow : 16,
//     Device : 17,
//     App : 18,
//     Local3 : 19,
//     Local4 : 20,
//     Local5 : 21,
//     Local6 : 22,
//     Local7 : 23
// };

// const SSeverity = {
//     Emergency     : 0,
//     Alert         : 1,
//     Critical      : 2,
//     Error         : 3,
//     Warning       : 4,
//     Notice        : 5,
//     Informational : 6,
//     Debug         : 7
// }

const SEVERITIES = {
    '0': 'Emergency',
    '1': 'Alert',
    '2': 'Critical',
    '3': 'Error',
    '4': 'Warning',
    '5': 'Notice',
    '6': 'Informational',
    '7': 'Debug'
};
const FACILITIES = {
    '0': 'Kernel',
    '1': 'User',
    '3': 'System',
    '13': 'Audit',
    '14': 'Alert',
    '16': 'Flow',
    '17': 'Device',
    '18': 'App',
    '19': 'Local3',
    '20': 'Local4',
    '21': 'Local5',
    '22': 'Local6',
    '23': 'Local7'
};
function substring(str, start, end) {
    return !str ? str : str.substring(start, end);
    // if (!str) return str;
    // let s = '', d, _end = (end || str.length);
    // while (start < _end) {
    //     s += str.substring(start, start + (d = (d = _end - start) > 12 ? 12 : d));
    //     start += d;
    // }
    // return s;
}

class Log {

    /**
     * @type {LogBook[]}
     * @readonly
     * @memberof Log
     */
    // get LogBooks() { if (!this.logBooks) this.logBooks = {}; return this.logBooks; }

    // get LogApps() { if (!this.logApps) this.logApps = []; return this.logApps; }

    constructor() {
        this.logFileName = `/userdata/Log.json`;
    }

    async init() {
        try {
            // try { unlinkSync(this.logFileName); } catch (ex) {
            //     //this.error(ex);
            // }
            let strings = [];
            try {
                for await (const chunk of this.generateChunks(this.logFileName, 100000)) {
                    strings.push(chunk);
                }
            } catch (error) {
                BL.homey.error(error);
            }
            //console.log(new TextDecoder().decode(Buffer.concat(strings)));
            if (strings && strings.length) this.logs = JSON.parse('[' + new TextDecoder().decode(Buffer.concat(strings)) + ']');
            else this.logs = [];
            
            this.logs = BL._.orderBy(this.logs, 'timestamp', 'desc');
            for (let i = 0; i < this.logs.length; i++) {
                const log = this.logs[i];
                log.timestamp = new Date(log.timestamp);
            }

            for (let i = 0; i < strings.length; i++) {
                strings[i].fill(null);
            }
            strings.length = 0;

        } catch (error) {
            BL.homey.error('Log init', error);
        }

    }
    async destroy() {
        if (this.stream) try {
            this.stream.destroy();
            this.stream = null;
        } catch (error) { }

        // for (let i = 0; i < this.LogBooks.length; i++) {
        //     const logBook = this.LogBooks[i];
        //     await logBook.destroy();
        // }
        // this.logBooks = {};

        /* CLEAR THE OLD LOG FILES
            let items;
            try {
                items = readdirSync(_filePath);
            } catch (error) {

            }
            if (items) for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const f = path.join(_filePath, item);
                let stat = statSync(f);
                if (stat.isDirectory()) {
                    try { rmSync(f, { recursive: true, force: true }); } catch (ex) {

                        this.error(ex);
                    }
                } else if (stat.isFile()) {
                    try { unlinkSync(f); } catch (ex) {
                        this.error(ex);
                    }
                }
            }
        */
    }


    async clearLog(days) {
        let date = new Date();
        date = date.setDate(date.getDate() - (days || 0));

        let keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'desc');
        for (let i = 0; i < keys.length; i++) {
            const logBookKey = keys[i];
            const logBook = this.LogBooks[logBookKey];
            if (logBook.date <= date) {
                logBook.delete();
                delete this.LogBooks[logBookKey];
            }
        }
        this.setLogBooks();
    }

    readBytes(fd, sharedBuffer) {
        return new Promise((resolve, reject) => {
            read(
                fd,
                sharedBuffer,
                0,
                sharedBuffer.length,
                null,
                (err) => {
                    if (err) { return reject(err); }
                    resolve();
                }
            );
        });
    }

    async * generateChunks(filePath, size) {
        const sharedBuffer = Buffer.alloc(size);
        const stats = statSync(filePath); // file details
        const fd = openSync(filePath); // file descriptor
        let bytesRead = 0; // how many bytes were read
        let end = size;

        for (let i = 0; i < Math.ceil(stats.size / size); i++) {
            await this.readBytes(fd, sharedBuffer);
            bytesRead = (i + 1) * size;
            if (bytesRead > stats.size) {
                // When we reach the end of file, 
                // we have to calculate how many bytes were actually read
                end = size - (bytesRead - stats.size);
            }
            yield Uint8Array.prototype.slice.call(sharedBuffer, 0, end);
        }
        closeSync(fd);
    }

    async getLogs({ severity, facility, hostname, app, message, timestamp_fromUTC, timestamp_toUTC, skip, take, maxSizeKb, lastLog, timestampFormat, returnType } = {}) {
        try {
            BL.homey.log('getLogs', ...arguments);


            let logs = [];
            let opts = BL._.cloneDeep(arguments[0]) || {};
            if (opts.timestamp_fromUTC) {
                opts.timestamp_fromUTC = new Date(opts.timestamp_fromUTC);
                opts.timestamp_fromUTC = BL.datetime.asLocale(opts.timestamp_fromUTC);
            }
            if (opts.timestamp_toUTC) {
                opts.timestamp_toUTC = new Date(opts.timestamp_toUTC);
                opts.timestamp_toUTC = BL.datetime.asLocale(opts.timestamp_toUTC);
                let t = new Date(opts.timestamp_toUTC.setDate(opts.timestamp_toUTC.getDate() + 1));
                opts.timestamp_toUTC = t;//new Date(t.setMilliseconds(t.getMilliseconds() - 1));
            }
            //return {logs, csv:''};
            try {

                // if (app) {
                //     opts.apps = [];//BL._.filter(this.LogApps, x=>x.indexOf(app)>-1);
                //     for (let i = 0; i < this.LogApps.length; i++)
                //         if (this.LogApps[i].toLowerCase().indexOf(app.toLowerCase()) > -1) opts.apps.push(i);
                // }
                
                let dropped = 0;
                let size=0;

                for (let i = 0; i < this.logs.length; i++) {
                    const log = this.logs[i];                    
                    if (opts.timestamp_fromUTC && log.date && log.date < opts.timestamp_fromUTC) break;
                    if (opts.timestamp_toUTC && log.date && log.date >= opts.timestamp_toUTC) continue;                        
                    if (severity !== undefined && logRecord.severity !== severity) continue;
                    if (facility !== undefined && logRecord.facility !== facility) continue;
                    if (app !== undefined && logRecord.app && logRecord.app.toLowerCase().indexOf(app.toLowerCase()) === -1) continue;
                    if (message !== undefined && logRecord.message.toLowerCase().indexOf(message.toLowerCase()) === -1) continue;
                    if(skip>0) {
                        skip--;
                        dropped++;
                        continue;
                    }
                    size += this.roughSizeOfObject(log) * 2;
                    logs.push(log);
                    if (maxSizeKb && size > maxSizeKb * 1000)
                        break;
                }
                if (skip && (skip - dropped)) logs = BL._.drop(logs, skip - dropped);
                if (take) logs = BL._.take(logs, take);

                size = this.roughSizeOfObject(logs) * 2;

                if (maxSizeKb && size > maxSizeKb * 1000) {
                    let reduce = 1.0 / (maxSizeKb * 1000) * size;
                    logs = BL._.take(logs, logs.length / reduce);
                }

                // let keys = BL._.orderBy(Object.keys(this.logs), null, 'desc');
                // let logId = lastLog ? lastLog.split('$')[0] : null;
                // let logI = lastLog ? lastLog.split('$')[1] : null;

                // let size = 0, dropped = 0;
                // let justRun = logId ? false : true;
                // if (logId) skip = 0;
                // for (let i = 0; i < keys.length; i++) {
                //     const logBookKey = keys[i];
                //     if (logId && logId == logBookKey) justRun = true;
                //     if (!justRun) continue;
                //     const logBook = this.logs[logBookKey];
                //     //const logBook = this.LogBooks[logBookKey];
                //     if (opts.timestamp_fromUTC && logBook.date && logBook.date < opts.timestamp_fromUTC) break;
                //     if (opts.timestamp_toUTC && logBook.date && logBook.date >= opts.timestamp_toUTC) continue;

                //     let newLogs;
                //     try {
                //         newLogs = logBook.getLogs(opts);
                //     } catch (error) {
                //         BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
                //         continue;
                //     }

                //     logs = logs.concat(newLogs);

                //     if (skip && dropped < skip) {
                //         logs = BL._.orderBy(logs, 'timestamp', 'desc');
                //         let toDrop = (skip - dropped);
                //         if (logs.length >= toDrop) { dropped += toDrop; logs = BL._.drop(logs, toDrop); }
                //         else { dropped += logs.length; logs = []; }
                //     }
                //     if (take && logs.length >= take) {
                //         logs = BL._.orderBy(logs, 'timestamp', 'desc');
                //         logs.length = take;
                //         break;
                //     }


                //     //newLogs.size = this.roughSizeOfObject(newLogs) * 2;

                //     //size += l.size;
                //     //logs = logs.concat(l);
                //     if (logId && logId == logBookKey) {
                //         let ind = BL._.findIndex(logs, x => x.i == logI);
                //         if (ind) logs = BL._.drop(logs, ind);
                //     }


                //     // //size = this.roughSizeOfObject(logs) * 2;
                //     // size = BL._.sumBy(logs, 'size');
                //     // if (maxSizeKb && size > maxSizeKb * 1000)
                //     //     break;


                // }

                // //size = BL._.sumBy(logs, 'size');
                // //for (let j = 0; j < logs.length; j++) delete logs[j].size;

                // logs = BL._.orderBy(logs, 'timestamp', 'desc');
                // if (skip && (skip - dropped)) logs = BL._.drop(logs, skip - dropped);
                // if (take) logs = BL._.take(logs, take);

                // size = this.roughSizeOfObject(logs) * 2;

                // if (maxSizeKb && size > maxSizeKb * 1000) {
                //     let reduce = 1.0 / (maxSizeKb * 1000) * size;
                //     logs = BL._.take(logs, logs.length / reduce);
                // }

                //BL.homey.log(this.roughSizeOfObject(logs));


            } catch (error) {
                BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
            }


            //BL.homey.log('logs', logs);
            logs = BL._.clone(logs);
            for (let i = 0; i < logs.length; i++) {
                const log = logs[i];
                if (timestampFormat) log.timestamp_formatted = BL.datetime.toString(timestampFormat, log.timestamp);
            }

            // Do this for all exports            
            if (returnType)
                for (let i = 0; i < logs.length; i++) {
                    const log = logs[i];
                    log.severity = SEVERITIES[log.severity];
                    log.facility = FACILITIES[log.facility];
                }
            let result = {};
            switch (returnType) {
                case 'csv':
                    //result.csv = await converter.json2csvAsync(logs, { useDateIso8601Format: true, emptyFieldValue: '' });
                    result.csv = await BL.json.toCsv(logs, { useDateIso8601Format: true, emptyFieldValue: '' });
                    if (maxSizeKb && result.csv.length > maxSizeKb) result.csv = substring(result.csv, 0, (maxSizeKb * 1000));
                    break;
                case 'xlsx':
                    let schema = [
                        {
                            column: BL.homey.__('Timestamp'),
                            type: Date,
                            format: 'yyyy-mm-dd hh:mm:ss',
                            value: log => BL.datetime.toLocale(log.timestamp),
                            width: 'yyyy-mm-dd hh:mm:ss'.length //BL._.maxBy(logs, 'timestamp.length')
                        },
                        {
                            column: BL.homey.__('Severity'),
                            type: String,
                            value: log => log.severity,
                            width: BL._.max([BL._.max(BL._.map(logs, 'severity.length')), BL.homey.__('Severity').length])
                        },
                        {
                            column: BL.homey.__('Facility'),
                            type: String,
                            value: log => log.facility,
                            width: BL._.max([BL._.max(BL._.map(logs, 'facility.length')), BL.homey.__('Facility').length])
                        },
                        {
                            column: BL.homey.__('App'),
                            type: String,
                            value: log => log.app,
                            width: BL._.max([BL._.max(BL._.map(logs, 'app.length')), BL.homey.__('App').length])
                        },
                        {
                            column: BL.homey.__('Message'),
                            type: String,
                            value: log => log.message,
                            width: BL._.max([BL._.max(BL._.map(logs, 'message.length')), BL.homey.__('Message').length])
                        }
                    ];
                    if (BL.homey.app.settings.includeUtcInExcel) schema.unshift({

                        column: BL.homey.__('Timestamp') + ' (UTC)',
                        type: String,
                        value: log => log.timestamp ? log.timestamp.toISOString() : null,
                        width: new Date().toISOString().length // iso dates
                    });
                    let xlsxBuffer = await BL.json.toExcel(logs, {
                        schema,
                        sheet: 'Log',// + BL.datetime.toString('datetime'),
                        stickyRowsCount: 1,
                        buffer: true,
                        //dateFormat: 'yyyy-mm-ddThh:mm:ss'
                    });
                    result.xlsx = xlsxBuffer;

                    break;
                case 'json':
                default:
                    result.logs = logs;
                    break;
            }
            return result;

        } catch (error) {
            BL.homey.error(error);
            throw new Error(error);
        }
    }

    roughSizeOfObject(object) {

        var objectList = [];
        var stack = [object];
        var bytes = 0;

        while (stack.length) {
            var value = stack.pop();

            if (typeof value === 'boolean') {
                bytes += 4;
            }
            else if (typeof value === 'string') {
                bytes += value.length * 2;
            }
            else if (typeof value === 'number') {
                bytes += 8;
            }
            else if
                (
                typeof value === 'object' && objectList.indexOf(value) === -1
            ) {
                objectList.push(value);

                for (var i in value) {
                    stack.push(value[i]);
                }
            }
        }
        return bytes;
    }

    async writeLine({ message, severity, facility, hostname, timestamp = new Date(), app } = {}) {
        return;
        let opts = BL._.cloneDeep(...arguments);
        if (opts.app && opts.app.length > 100) throw new Error('App name must not be longer than 100 Characters.');
        if (!opts.timestamp) opts.timestamp = new Date();
        if (opts.message !== undefined && opts.message !== null && typeof (opts.message) != 'string') opts.message = opts.message.toString();

        try {
            let p = new Defer();
            if(!this.logger) this.logger = [];
            this.logger.push(p);
            
            if(this.logger.length>1) await this.logger[this.logger.length-2];
                
            this.logs.unshift(opts);
            //this.logs = BL._.orderBy(this.logs, 'timestamp', 'desc');
            
            this.logger.shift();
            p.resolve();

            await this.writeLogLine(opts);

        } catch (error) {
            BL.homey.error(error, 'opts', opts);
            throw new Error(error);
        }
    }
    async writeLogLine(args) {
        
        try {
            let p = new Defer();
            if(!this.streamer) this.streamer = [];
            this.streamer.push(p);
            
            if(this.streamer.length>1) await this.streamer[this.streamer.length-2];
                
            if (!this.stream) this.stream = createWriteStream(this.logFileName, { flags: 'a', autoClose: true, });
            if (this.stream) this.writeStream(`${this.logs.length>1?',':''}${JSON.stringify(args)}\n`, (err)=> {
                this.streamer.shift();
                p.resolve();
            });
            await p;
            
            BL.homey.log(this.streamer.length);
        } catch (error) {
            BL.homey.error(error);
        }
    }
    writeStream(data, cb) {
        if (!this.stream.write(data)) {
            this.stream.once('drain', cb);
        } else {
          process.nextTick(cb);
        }
      }

    /**
     * 
     * @param {Date} date 
     * @returns 
     */
    getLogBookDate(date) {
        return `${date.getUTCFullYear()}/${(date.getUTCMonth() + 1).toString().padStart(2, '0')}/${date.getUTCDate().toString().padStart(2, '0')}`;
        //return BL.datetime.toString('yyyy/MM/dd', date);
    }

    /**
     * 
     * @param {Date} date 
     * @returns 
     */

    getLogBook(date) {
        try {
            // let gmt = Number.parseInt(BL.datetime.toString('z', date));
            // date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), -gmt, 0, 0, 0);
            date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
            let logDate = this.getLogBookDate(date);

            if (!this.LogBooks[logDate]) {
                this.LogBooks[logDate] = new LogBook({ id: logDate, date });
                this.setLogBooks();
            }
            return this.LogBooks[logDate];
        } catch (error) {
            BL.homey.error(error);
        }
    }
    setLogBooks() {
        let obj = BL._.mapValues(this.LogBooks, (x) => {
            return { date: x.date.getTime() };
        });
        BL.homey.settings.set('LogBooks', obj);
    }
}



class LogBook {

    get LogRecords() { if (!this._logRecords) this._logRecords = []; return this._logRecords; }

    constructor({ id, date }) {
        this.id = id;
        this.date = date;
        //this.datestarttime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        this._logRecords = BL.homey.settings.get('LogBook_' + id);
        if (typeof (this._logRecords) == 'string') this._logRecords = JSON.parse(this._logRecords);
        for (let i = 0; i < this.LogRecords.length; i++) {
            const logRecord = this.LogRecords[i];
            logRecord.timestamp = new Date(logRecord.timestamp);
        }
    }

    async destroy() {
    }

    delete() {
        this._logRecords = [];
        BL.homey.settings.unset('LogBook_', null);
    }

    writeLine({ message, severity, facility, hostname, timestamp, app } = {}) {
        this.LogRecords.push({ message, severity, facility, hostname, timestamp, app });
        BL.homey.settings.set('LogBook_' + this.id, this.LogRecords);
    }

    getLogs({ severity, facility, hostname, apps, message, take, skip } = {}) {
        let results = [];
        try {
            for (let i = 0; i < this.LogRecords.length; i++) {
                const logRecord = this.LogRecords[i];


                if (severity !== undefined && logRecord.severity !== severity) continue;
                if (facility !== undefined && logRecord.facility !== facility) continue;

                if (apps !== undefined && logRecord.app && apps.indexOf(logRecord.app) === -1) continue;
                if (message !== undefined && logRecord.message.toLowerCase().indexOf(message.toLowerCase()) === -1) continue;

                //log = BL._.clone(log);
                results.push(logRecord);
            }
        } catch (error) {
            BL.homey.error(error);
        }

        return results;
    }

}

module.exports = { Log };