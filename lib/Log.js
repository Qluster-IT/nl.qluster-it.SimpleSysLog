const { BL } = require("betterlogiclibrary");
const { Defer } = require("betterlogiclibrary/src/bl");
const { createWriteStream, existsSync, mkdirSync, readSync, readFileSync, readFile, rmSync, unlinkSync, readdirSync, statSync, closeSync, openSync } = require("fs");
// const { readFile, writeFile, unlink, rename, exists, mkdir, copyFile, readdir, stat } = require('fs');
//const { compressToUint8Array, decompress, compress, compressToUTF16, decompressFromUTF16 } = require("lz-string");
const { promisify } = require('util');
const { randomBytes } = require('crypto');
const { Severity } = require("syslog-client");
const path = require("path");
let converter = require('json-2-csv');

//const existsAsync = promisify(exists);
// const mkdirAsync = promisify(mkdir);
// const readdirAsync = promisify(readdir);
// const statAsync = promisify(stat);

//const openAsync = promisify(open);
//const readAsync = promisify(read);
//const readFileAsync = promisify(readFile);

const fs = require('fs/promises');

let _logBooks;
let _logApps;
let _filePath;
let _logfile, _appsFile;
const APP_NAME = 'Simple Log';


const F_OK=0;
const R_OK=4;
const W_OK=2;
const X_OK=1;


// const FFacility = {
//     Kernel :  0,
//     User   :  1,
//     System :  3,
//     Audit  : 13,
//     Alert  : 14,
//     Local0 : 16,
//     Local1 : 17,
//     Local2 : 18,
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
    '16': 'Local0',
    '17': 'Local1',
    '18': 'Local2',
    '19': 'Local3',
    '20': 'Local4',
    '21': 'Local5',
    '22': 'Local6',
    '23': 'Local7'
};
function substring(str, start, end) {
    return !str?str:str.substring(start, end);
    if(!str) return str;
    let s='', d, _end=(end||str.length);
    while(start<_end) {
      s+=str.substring(start, start + (d=(d=_end-start)>12?12:d));
      start+=d;
    }
    return s;
  }
// String.prototype.substring = function(start, end) {
//     return this;
// };
class Log {

    /**
     * @type {LogBook[]}
     * @readonly
     * @memberof Log
     */
    get LogBooks() { if (!_logBooks) _logBooks = {}; return _logBooks; }

    get LogApps() { if (!_logApps) _logApps = []; return _logApps; }

    constructor({ filePath }) {
        _filePath = filePath;
        _logfile = filePath + 'log.index';
        _appsFile = filePath + 'log.apps';

    }
    async init() {
        let logs;
        //if (existsSync(_logfile)) logs = readFileSync(_logfile);
        try {
            if (await fs.access(_logfile, R_OK) || true) logs = await fs.readFile(_logfile);
        } catch (error) {
            BL.log.error(error);
        }
        if (logs) {
            let logRows = logs.toString('utf8').split('\n');
            for (let i = 0; i < logRows.length - 1; i++) {
                const logRow = logRows[i];
                let log = JSON.parse(`{${logRow.replace('f:', '"file":').replace('d:', '"date":')}}`);
                log.date = new Date(log.date);
                log.file = _filePath + log.file;
                log.path = _filePath;
                let logDate = this.getLogBookDate(log.date);
                log.id = logDate;
                this.LogBooks[logDate] = new LogBook(log);
            }
        }
        let apps;
        //if (existsSync(_appsFile)) apps = readFileSync(_appsFile);
        try {
            if (await fs.access(_appsFile, R_OK)) apps = await fs.readFile(_appsFile);
        }
        catch (ex) { }
        if (apps) {
            let appRows = apps.toString('utf8').split('\n');
            _logApps = appRows;
        }
        this.stream = createWriteStream(_logfile, { flags: 'a', autoClose: true, });
        this.appsStream = createWriteStream(_appsFile, { flags: 'a', autoClose: true, });

    }
    async destroy() {
        for (let i = 0; i < this.LogBooks.length; i++) {
            const logBook = this.LogBooks[i];
            await logBook.destroy();
        }
        this.LogBooks = [];

        if (this.stream) try {
            this.stream.destroy();
            this.stream = null;
        } catch (error) { }

        if (this.appsStream) try {
            this.appsStream.destroy();
            this.appsStream = null;
        } catch (error) { }
    }

    clearLog(days) {
        if (days) {
            let date = new Date(); date = date.setDate(date.getDate() - days);

            let keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'desc');
            for (let i = 0; i < keys.length; i++) {
                const logBookKey = keys[i];
                const logBook = this.LogBooks[logBookKey];
                if (logBook.date <= date) {
                    try { unlinkSync(logBook.file + '.index'); } catch (ex) {
                        //this.error(ex);
                    }
                    try { unlinkSync(logBook.file + '.log'); } catch (ex) {
                        //this.error(ex);
                    }
                    delete this.LogBooks[logBookKey];
                }
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
            this.writeLine({ message: "Removed log data older then " + days + " Day(s)", app: "Simple LOG" });
        }

        else {
            _logApps = [];
            let items = readdirSync(_filePath);
            for (let i = 0; i < items.length; i++) {
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
            this.writeLine({ message: "Cleared all logging data", app: "Simple LOG" });
        }
    }

    async getLogs({ severity, facility, app, message, timestamp_fromUTC, timestamp_toUTC, skip, take, maxSizeKb, lastLog, timestampFormat, returnType } = {}) {
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

                let l;
                try {
                    l = await logBook.getLogs(opts);
                } catch (error) {
                    BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
                    continue;
                }
                l.size = this.roughSizeOfObject(l) * 2;

                size += l;
                logs = logs.concat(l);
                if (logId && logId == logBookKey) {
                    let ind = BL._.findIndex(logs, x => x.i == logI);
                    if (ind) logs = BL._.drop(logs, ind);
                }

                //if (maxSizeKb && size > maxSizeKb * 1000) {
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

                //size = this.roughSizeOfObject(logs) * 2;
                size = BL._.sumBy(logs, 'size');
                if (maxSizeKb && size > maxSizeKb * 1000)
                    break;
                //}

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

        let result = {};
        switch (returnType) {
            case 'csv':
                for (let i = 0; i < logs.length; i++) {
                    const log = logs[i];
                    log.severity = SEVERITIES[log.severity];
                    log.facility = FACILITIES[log.facility];                    
                }
                result.csv = await converter.json2csvAsync(logs, {useDateIso8601Format:true, emptyFieldValue:''});
                if(maxSizeKb && result.csv.length>maxSizeKb) result.csv = substring(result.csv, 0, (maxSizeKb * 1000));
                break;
            default:
                result.logs = logs;
                break;
        }
        return result;
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
        if (opts.app && opts.app.length > 50) throw new Error('App name must not be longer than 50 Characters.');
        if (!opts.timestamp) opts.timestamp = new Date();
        if (opts.message !== undefined && opts.message !== null && typeof (opts.message) != 'string') opts.message = opts.message.toString();

        if (opts.app) {
            let i;
            if ((i = this.LogApps.indexOf(opts.app)) > -1) opts.app = i;
            else {
                this.appsStream.write(opts.app + '\n');
                this.LogApps.push(opts.app);
                opts.app = this.LogApps.length - 1;
            }
        }
        return this.getLogBook(opts.timestamp).writeLine(opts);

        //if(this.stream) this.stream.write(JSON.stringify(arguments[0]) + '\r\n');
    }

    /**
     * 
     * @param {Date} date 
     * @returns 
     */
    getLogBookDate(date) {
        return `${date.getUTCFullYear()}/${(date.getUTCMonth() + 1).toString().padStart(2, '0')}/${date.getUTCDate().toString().padStart(2, '0')}`;
        return BL.datetime.toString('yyyy/MM/dd', date);
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
                this.LogBooks[logDate] = new LogBook({ id: logDate, file: _filePath + logDate, date });
                if (this.stream) this.stream.write(`f:${JSON.stringify(logDate)},d:${date.getTime()}\n`);
            }
            return this.LogBooks[logDate];
        } catch (error) {
            BL.homey.error(error);
        }
    }
}



class LogBook {

    constructor({ id, file, date }) {
        this.id = id;
        this.date = date;
        this.datestarttime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        this.file = file;
        this.path = substring(this.file, 0, this.file.lastIndexOf('/'));
        this.filesCreated = false;
    }

    async destroy() {
        if (this.fdRead) try {
            this.fdRead.close();
            this.fdRead = null;
        } catch (error) { }

        if (this.logStream) try {
            this.logStream.destroy();
            this.logStream = null;
        } catch (error) { }

        if (this.indexStream) try {
            this.indexStream.destroy();
            this.indexStream = null;
        } catch (error) { }
    }

    createFile() {
        let path = this.path;

        if (!(existsSync(path))) mkdirSync(path, { recursive: true });

        this.logStream = createWriteStream(this.file + '.log', { flags: 'a', autoClose: true, encoding: "utf8" });
        this.indexStream = createWriteStream(this.file + '.index', { flags: 'a', autoClose: true });
        this.filesCreated = true;
    }

    writeLine({ message, severity = '', facility = '', timestamp, app = '' } = {}) {
        if (!this.filesCreated) this.createFile();
        if (!this.logStream) return;
        let defer = new Defer();

        let timeNr = (timestamp.getTime() - this.datestarttime);

        //let msg = timeNr + ';' + severity + ';' + facility + ';' + app + ';' + message;//compress(message);
        //let msg = facility + ';' + app + ';' + JSON.stringify(message);//compress(message);
        //let msg = (app ? JSON.stringify(app) : '') + ',' + JSON.stringify(message);//compress(message);

        let msg = JSON.stringify(message);
        let bytes = msg + '\n';

        this.logStream.write(bytes, (error) => {
            if (error) defer.reject(new Error(error));
            defer.resolve();
        });
        //let index = [bytes.length,timeNr,severity,facility];
        this.indexStream.write(`${bytes.length};${timeNr};${severity};${facility};${app}\n`);
        // if(this.index.length) index.unshift(this.index[this.index.length-1][0]+this.index[this.index.length-1][1]);
        // else index.unshift(0);
        // this.index.push(index);

        return defer.promise;
    }

    async read(start, length) {
        let defer = new Defer();
        //if (!this.fdRead) this.fdRead = await openSync(this.file + '.log', 'r');
        if (!this.fdRead) this.fdRead = await fs.open(this.file + '.log', 'r');

        var buffer = Buffer.alloc(length);
        //await readAsync(this.fdRead, buffer, 0, length, start);        
        //readSync(this.fdRead, buffer, 0, length, start);
        await this.fdRead.read(buffer, 0, length, start);
        return buffer.toString('utf8');
    }


    async getLogFile() {
        try {
            if (!this._logFile) this._logFile = (await fs.readFile(this.file + '.log')).toString('utf8'); //readFileSync(this.file + '.log').toString('utf8'); //(await readFileAsync(this.file + '.log')).toString('utf8');   
        } catch (error) {
        }
        return this._logFile;
    }

    async getLogs({ severity, facility, apps, message, take, skip } = {}) {
        if(this.logs && this.logs.length) return this.logs;
        let logs = [];
        try {

            let index = (await fs.readFile(this.file + '.index'));//this._index || readFileSync(this.file + '.index');// await readFileAsync(this.file + '.index');
            //this._index = index; // saves it for debugging?
            if (index) {
                //let logFile = (await readFileAsync(this.file + '.log')).toString('utf8');
                index = index.toString('utf8');
                let indexes = index.split('\n');
                let position = 0;
                for (let i = 0; i < indexes.length - 1; i++) {
                    const _index = indexes[i].split(';');
                    let length = Number.parseInt(_index[0]);
                    let oldPos = position;
                    position += length;
                    let _severity = Number.parseInt(_index[2]);
                    if (severity !== undefined && _severity !== severity) continue;
                    let _facility = Number.parseInt(_index[3]);
                    if (facility !== undefined && _facility !== facility) continue;
                    let _app = Number.parseInt(_index[4]);
                    if (apps !== undefined && apps.indexOf(_app) === -1)
                        continue;
                    let log = {
                        //i,
                        id: this.id + '$' + i,
                        timestamp: new Date(Number.parseInt(_index[1]) + this.datestarttime),
                        //severity: _severity,// || 6,
                        //facility: _facility
                    };
                    if (!Number.isNaN(_app) && _app !== undefined && _app !== null) log.app = BL.homey.app.Log.LogApps[_app];
                    if (!Number.isNaN(_severity)) log.severity = _severity;
                    if (!Number.isNaN(_facility)) log.facility = _facility;
                    //if (_facility !== undefined && _facility !== null && _facility !== '') log.facility = _facility;
                    
                    log.length = length;
                    log.position = oldPos;

                    logs.push(log);

                    //if (logs.length >= take && !skip) break;
                }
            }
        } catch (error) {
            BL.homey.error(error);
        }
        let a = await this.getLogFile();
        let logFile = logs.length >= 10 ? await this.getLogFile() : null; // Or greater than x %?

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            let logString = logFile ? substring(logFile, log.position, log.position + log.length) : await this.read(log.position, log.length);
            // let logStrings = JSON.parse(`[${logString.startsWith(',') ? '""' : ''}${logString}]`);
            // log.app = BL.homey.app.Log.LogApps[logStrings[0]];
            // log.message = logStrings[1];
            log.message = JSON.parse(logString);
            delete log.length;
            delete log.position;
        }
        if (message) logs = BL._.filter(logs, x => x.message.toLowerCase().indexOf(message.toLowerCase()) > -1);

        delete this._logFile; // for debugging disable this line.
        if (this.fdRead) try {
            this.fdRead.close();
            this.fdRead = null;
        } catch (error) {
            BL.homey.error(error);
        }
        //this.logs = logs; // for debugging, enable this line.
        return logs;
    }
}

module.exports = { Log };