const { BL } = require("betterlogiclibrary");
const { Defer } = require("betterlogiclibrary/src/bl");
const { Severity } = require("./../lib/syslog-client");
const Datastore = require('nedb');

const path = require("path");

const { createWriteStream, existsSync, mkdirSync, rmSync, unlinkSync, readdirSync, statSync, readFileSync, openSync, readSync, closeSync } = require("fs");
//const fs = require('fs/promises');

let db;

let _filePath;
let _logfile, _appsFile, _hostnamesFile;
const APP_NAME = 'Simple Log';


const F_OK = 0;
const R_OK = 4;
const W_OK = 2;
const X_OK = 1;


const SEVERITIES = {
    '0': 'Emergency',
    '1': 'Alert',
    '2': 'Critical',
    '3': 'Error',
    '4': 'Warning',
    '5': 'Notice',
    '6': 'Info',
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
    '19': 'Scene',
    '20': 'Trigger',
    '21': 'Condition',
    '22': 'Action',
    '23': 'Local7'
};

class Log {

    /**
     * @type {LogBook[]}
     * @readonly
     * @memberof Log
     */
    //get LogBooks() { if (!_logBooks) _logBooks = {}; return _logBooks; }

    //get LogApps() { if (!_logApps) _logApps = []; return _logApps; }
    //get LogHostnames() { if (!_logHostnames) _logHostnames = []; return _logHostnames; }

    constructor({ filePath }) {
        _filePath = filePath;
    }
    async init() {
        db = new Datastore({ filename: _filePath + 'log.endb', autoload: true });

    }
    async destroy() {        
    }

    async clearLog(days) {
        if (days) {
            let date = new Date(); date = date.setDate(date.getDate() - (days + 1));
            let logbookDelete = false;
            let keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'desc');
            for (let i = 0; i < keys.length; i++) {
                const logBookKey = keys[i];
                const logBook = this.LogBooks[logBookKey];
                if (logBook.date <= date) {
                    logbookDelete = true;
                    try { unlinkSync(logBook.file + '.index'); } catch (ex) {
                        //this.error(ex);
                    }
                    try { unlinkSync(logBook.file + '.log'); } catch (ex) {
                        //this.error(ex);
                    }
                    delete this.LogBooks[logBookKey];
                }
                await logBook.destroy();
            }
            if (this.stream) this.stream.destroy();
            unlinkSync(_logfile);
            this.stream = createWriteStream(_logfile, { flags: 'a', autoClose: true, });
            keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'asc');
            for (let i = 0; i < keys.length; i++) {
                const logBookKey = keys[i];
                const logBook = this.LogBooks[logBookKey];
                if (this.stream) this.stream.write(`f:${JSON.stringify(logBook.id)},d:${logBook.date.getTime()}\n`);
            }
            if (logbookDelete === true) this.writeLine({ message: "Removed log data older then " + days + " Day(s)", app: "Simple Log" });
        } else {
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
            for (let i = 0; i < this.LogBooks.length; i++) {
                const logBook = this.LogBooks[i];
                logBook.destroy();
            }
            await this.init();
            this.writeLine({ message: "Cleared all logging data", app: "Simple Log" });
        }
    }

    async getLogs({ severity, facility, hostname, app, message, timestamp_fromUTC, timestamp_toUTC, skip, take, maxSizeKb, lastLog, timestampFormat, returnType } = {}) {
        try {

            let logs = [];
            let opts = BL._.cloneDeep(arguments[0]) || {};
            if (opts.timestamp_fromUTC) {
                opts.timestamp_fromUTC = new Date(opts.timestamp_fromUTC);
                opts.timestamp_fromUTC = BL.datetime.asLocale(opts.timestamp_fromUTC);
            }
            if (opts.timestamp_toUTC) {
                opts.timestamp_toUTC = new Date(opts.timestamp_toUTC);
                opts.timestamp_toUTC = BL.datetime.asLocale(opts.timestamp_toUTC);
                let t = new Date(opts.timestamp_toUTC.setDate(opts.timestamp_toUTC.getDate() + 1)); // till the end of the day
                opts.timestamp_toUTC = t;//new Date(t.setMilliseconds(t.getMilliseconds() - 1));
            }
            //return {logs, csv:''};
            try {

                if (app) {
                    opts.apps = [];
                    for (let i = 0; i < this.LogApps.length; i++)
                        if (this.LogApps[i].toLowerCase().indexOf(app.toLowerCase()) > -1) opts.apps.push(i);
                }
                if (hostname) {
                    opts.hostnames = [];
                    for (let i = 0; i < this.LogHostnames.length; i++)
                        if (this.LogHostnames[i].toLowerCase().indexOf(app.toLowerCase()) > -1) opts.hostnames.push(i);
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

                    let l;
                    //if (true) {
                    try {
                        l = await logBook.getLogs(opts);
                        //logBook.destroy();
                    } catch (error) {
                        BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
                        continue;
                    }
                    for (let j = 0; j < l.length; j++)
                        (l[j].size = (this.roughSizeOfObject(l[j]) * 2));


                    //}
                    logs = logs.concat(l);

                    if (logId && logId == logBookKey) {
                        let ind = BL._.findIndex(logs, x => x.i == logI);
                        if (ind) logs = BL._.drop(logs, ind);
                    }

                    if (skip && dropped < skip) {
                        logs = BL._.orderBy(logs, 'timestamp', 'desc');
                        let toDrop = (skip - dropped);
                        if (logs.length >= toDrop) { dropped += toDrop; logs = BL._.drop(logs, toDrop); }// (dropped += toDrop));
                        else { dropped += logs.length; logs = []; }
                    }
                    if (take && logs.length >= take) {
                        logs = BL._.orderBy(logs, 'timestamp', 'desc');
                        logs.length = take;
                        break;
                    }

                    size = BL._.sumBy(logs, 'size');
                    if (maxSizeKb && size > maxSizeKb * 1000)
                        break;

                }
                logs = BL._.orderBy(logs, 'timestamp', 'desc');
                if (skip && (skip - dropped)) logs = BL._.drop(logs, skip - dropped);
                if (take) logs = BL._.take(logs, take);

                //size = this.roughSizeOfObject(logs) * 2;
                size = BL._.sumBy(logs, 'size');

                if (maxSizeKb && size > maxSizeKb * 1000) {
                    let reduce = 1.0 / (maxSizeKb * 1000) * size;
                    logs = BL._.take(logs, logs.length / reduce);
                }
                for (let i = 0; i < logs.length; i++) {
                    const log = logs[i];
                    if (timestampFormat) log.timestamp_formatted = BL.datetime.toString(timestampFormat, log.timestamp);
                    delete log.size;
                }
                //BL.homey.log(this.roughSizeOfObject(logs));


            } catch (error) {
                BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
            }
            // BL.homey.log('roughSizeOfObject this.Log', this.roughSizeOfObject(this));
            // BL.homey.log('roughSizeOfObject this.Log.LogBooks', this.roughSizeOfObject(this.LogBooks));
            // BL.homey.log('roughSizeOfObject _logBooks', this.roughSizeOfObject(_logBooks));
            // BL.homey.log('roughSizeOfObject BL.homey.app', this.roughSizeOfObject(BL.homey.app));

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
                case 'csv_base64':
                    //result.csv = await converter.json2csvAsync(logs, { useDateIso8601Format: true, emptyFieldValue: '' });
                    result.csv = await BL.json.toCsv(logs, { useDateIso8601Format: true, emptyFieldValue: '' });
                    if (maxSizeKb && result.csv.length > maxSizeKb) result.csv = substring(result.csv, 0, (maxSizeKb * 1000));
                    if (returnType == 'csv_base64') {
                        result.csv = Buffer.from(result.csv).toString('base64');
                    }
                    //delete result.logs;
                    break;
                case 'xlsx':
                case 'xlsx_base64':
                    let date = BL.json.exports.excel_defaultdateformat || 'yyyy-mm-dd hh:mm:ss';
                    let schema = [
                        {
                            column: BL.homey.__('Timestamp'),
                            type: Date,
                            format: date,
                            value: log => BL.datetime.toLocale(log.timestamp),
                            width: date.length //BL._.maxBy(logs, 'timestamp.length')
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
                        buffer: true, //returnType == 'xlsx' ? true : false,
                        //dateFormat: 'yyyy-mm-ddThh:mm:ss'
                    });
                    result.xlsx = xlsxBuffer;
                    if (returnType == 'xlsx_base64') {
                        result.xlsx = Buffer.from(result.xlsx).toString('base64');
                    }
                    break;
                case 'json':
                case 'json_base64':
                    result.json = JSON.stringify(logs);
                    if (returnType == 'json_base64') {
                        result.json = Buffer.from(result.json).toString('base64');
                    }
                    break;
                default:
                    result.logs = logs;

                    break;
            }
            //BL.homey.settings.set()
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
        let opts = { message, severity, facility, hostname, timestamp : timestamp || new Date(), app }; //BL._.cloneDeep(...arguments);
        if (opts.app && opts.app.length > 100) throw new Error('App name must not be longer than 100 Characters.');
        //if (!opts.timestamp) opts.timestamp = new Date();
        if (opts.message !== undefined && opts.message !== null && typeof (opts.message) != 'string') opts.message = opts.message.toString();

        try {
            db.insert(opts);
        } catch (error) {
            BL.homey.error(error, 'opts', opts);
            throw new Error(error);
        }


    }

    
    
    submitLogBookForDiagnostic(logBookKey) {

        const logBook = this.LogBooks[logBookKey];
        if (logBook) logBook.submitForDiagnostic();
    }

    retrieveLogBookDiagnostic(logBookKey) {

        const logBook = this.LogBooks[logBookKey];
        if (logBook) return logBook.retrieveForDiagnostic();
    }
}


module.exports = { Log, SEVERITIES, FACILITIES };