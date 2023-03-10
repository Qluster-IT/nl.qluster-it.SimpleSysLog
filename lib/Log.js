const { BL } = require("betterlogiclibrary");
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
    get LogBooks() { if (!this.logBooks) this.logBooks = {}; return this.logBooks; }

    get LogApps() { if (!this.logApps) this.logApps = []; return this.logApps; }

    constructor() {

    }
    async init() {
        let logBookIndexes;
        try {
            logBookIndexes = BL.homey.settings.get('LogBooks');
        } catch (error) {
            //BL.homey.error(error);
        }
        if (logBookIndexes) {

            for (const logBookKey in logBookIndexes) {
                if (Object.hasOwnProperty.call(logBookIndexes, logBookKey)) {
                    const logBookIndex = logBookIndexes[logBookKey];
                    this.LogBooks[logBookKey] = null;
                    try {
                        this.LogBooks[logBookKey] = new LogBook({ date: logBookIndex.date, id: logBookKey });
                    } catch (error) {

                    }
                }
            }
        }

        try {
            this.logApps = BL.homey.settings.get('LogApps');
        }
        catch (ex) { }

    }
    async destroy() {
        for (let i = 0; i < this.LogBooks.length; i++) {
            const logBook = this.LogBooks[i];
            await logBook.destroy();
        }
        this.logBooks = {};

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

    getAppId(appName) {
        let i;
        if ((i = this.LogApps.indexOf(appName)) > -1) return i;
        else {
            this.LogApps.push(appName);
            BL.homey.settings.set('LogApps', this.LogApps);
            return this.LogApps.length - 1;
        }
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

    async getLogs({ severity, facility, app, message, timestamp_fromUTC, timestamp_toUTC, skip, take, maxSizeKb, lastLog, timestampFormat, returnType } = {}) {
        try {
            lastLog = null;

            let logs = [];
            let opts = BL._.cloneDeep(arguments[0]) || {};
            if (opts.timestamp_fromUTC) {
                opts.timestamp_fromUTC = new Date(opts.timestamp_fromUTC);
                opts.timestamp_fromUTC = BL.datetime.fromUTC(opts.timestamp_fromUTC);
            }
            if (opts.timestamp_toUTC) {
                opts.timestamp_toUTC = new Date(opts.timestamp_toUTC);
                opts.timestamp_toUTC = BL.datetime.fromUTC(opts.timestamp_toUTC);
                let t = new Date(opts.timestamp_toUTC.setDate(opts.timestamp_toUTC.getDate() + 1));
                opts.timestamp_toUTC = t;//new Date(t.setMilliseconds(t.getMilliseconds() - 1));
            }
            //return {logs, csv:''};
            try {

                if (app) {
                    opts.apps = [];//BL._.filter(this.LogApps, x=>x.indexOf(app)>-1);
                    for (let i = 0; i < this.LogApps.length; i++)
                        if (this.LogApps[i].toLowerCase().indexOf(app.toLowerCase()) > -1) opts.apps.push(i);
                }
                let keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'desc');
                let logId = lastLog ? lastLog.split('$')[0] : null;
                let logI = lastLog ? lastLog.split('$')[1] : null;

                let size = 0, dropped = 0;
                let justRun = logId ? false : true;
                if (logId) skip = 0;
                for (let i = 0; i < keys.length; i++) {
                    const logBookKey = keys[i];
                    if (logId && logId == logBookKey) justRun = true;
                    if (!justRun) continue;
                    const logBook = this.LogBooks[logBookKey];
                    if (opts.timestamp_fromUTC && logBook.date && logBook.date < opts.timestamp_fromUTC) break;
                    if (opts.timestamp_toUTC && logBook.date && logBook.date >= opts.timestamp_toUTC) continue;

                    let newLogs;
                    try {
                        newLogs = logBook.getLogs(opts);
                    } catch (error) {
                        BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
                        continue;
                    }

                    logs = logs.concat(newLogs);

                    if (skip && dropped < skip) {
                        logs = BL._.orderBy(logs, 'timestamp', 'desc');
                        let toDrop = (skip - dropped);
                        if (logs.length >= toDrop) { dropped += toDrop; logs = BL._.drop(logs, toDrop); }
                        else { dropped += logs.length; logs = []; }
                    }
                    if (take && logs.length >= take) {
                        logs = BL._.orderBy(logs, 'timestamp', 'desc');
                        logs.length = take;
                        break;
                    }


                    //newLogs.size = this.roughSizeOfObject(newLogs) * 2;

                    //size += l.size;
                    //logs = logs.concat(l);
                    if (logId && logId == logBookKey) {
                        let ind = BL._.findIndex(logs, x => x.i == logI);
                        if (ind) logs = BL._.drop(logs, ind);
                    }


                    // //size = this.roughSizeOfObject(logs) * 2;
                    // size = BL._.sumBy(logs, 'size');
                    // if (maxSizeKb && size > maxSizeKb * 1000)
                    //     break;


                }

                //size = BL._.sumBy(logs, 'size');
                //for (let j = 0; j < logs.length; j++) delete logs[j].size;

                logs = BL._.orderBy(logs, 'timestamp', 'desc');
                if (skip && (skip - dropped)) logs = BL._.drop(logs, skip - dropped);
                if (take) logs = BL._.take(logs, take);

                size = this.roughSizeOfObject(logs) * 2;

                if (maxSizeKb && size > maxSizeKb * 1000) {
                    let reduce = 1.0 / (maxSizeKb * 1000) * size;
                    logs = BL._.take(logs, logs.length / reduce);
                }

                //BL.homey.log(this.roughSizeOfObject(logs));


            } catch (error) {
                BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
            }


            //BL.homey.log('logs', logs);
            logs = BL._.cloneDeep(logs);
            for (let i = 0; i < logs.length; i++) {
                const log = logs[i];
                if (timestampFormat) log.timestamp_formatted = BL.datetime.toString(timestampFormat, log.timestamp);
                log.app = this.LogApps[log.app];
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
                        dateFormat: 'yyyy-mm-ddThh:mm:ss'
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

    async writeLine({ message, severity, facility, timestamp = new Date(), app } = {}) {
        let opts = BL._.cloneDeep(...arguments);
        if (opts.app && opts.app.length > 100) throw new Error('App name must not be longer than 100 Characters.');
        if (!opts.timestamp) opts.timestamp = new Date();
        if (opts.message !== undefined && opts.message !== null && typeof (opts.message) != 'string') opts.message = opts.message.toString();

        if (opts.app) opts.app = this.getAppId(opts.app);

        try {
            return this.getLogBook(opts.timestamp).writeLine(opts);
        } catch (error) {
            BL.homey.error(error, 'opts', opts);
            throw new Error(error);
        }


        //if(this.stream) this.stream.write(JSON.stringify(arguments[0]) + '\r\n');
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
        BL.homey.settings.set('LogBooks', BL._.mapValues(this.LogBooks, (x) => {
            return { date: x.date };
        }));
    }
}



class LogBook {

    get LogRecords() { if (!this._logRecords) this._logRecords = []; return this._logRecords; }

    constructor({ id, date }) {
        this.id = id;
        this.date = date;
        //this.datestarttime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        this._logRecords = BL.homey.settings.get('LogBook_' + id);
        for (let i = 0; i < this.LogRecords.length; i++) {
            const logRecord = this.LogRecords[i];
            logRecord.timestamp = new Date(logRecord.timestamp);
        }
    }

    async destroy() {
    }

    delete() {
        this._logRecords = [];
        BL.homey.settings.set('LogBook_' + this.id, null);
    }

    writeLine({ message, severity, facility, timestamp, app } = {}) {
        this.LogRecords.push({ message, severity, facility, timestamp, app });
        BL.homey.settings.set('LogBook_' + this.id, this.LogRecords);
    }

    getLogs({ severity, facility, apps, message, take, skip } = {}) {
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