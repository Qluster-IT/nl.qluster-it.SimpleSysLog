const { BL } = require("betterlogiclibrary");
const { Defer } = require("betterlogiclibrary/src/bl");
const { createWriteStream, open, read, existsSync, mkdirSync, readSync, readFileSync, readFile } = require("fs");
// const { readFile, writeFile, unlink, rename, exists, mkdir, copyFile, readdir, stat } = require('fs');
//const { compressToUint8Array, decompress, compress, compressToUTF16, decompressFromUTF16 } = require("lz-string");
const { promisify } = require('util');
const { randomBytes } = require('crypto');
const { Severity } = require("syslog-client");

// const existsAsync = promisify(exists);
// const mkdirAsync = promisify(mkdir);
// const readdirAsync = promisify(readdir);
// const statAsync = promisify(stat);

const openAsync = promisify(open);
const readAsync = promisify(read);
const readFileAsync = promisify(readFile);

let _logBooks;
let _logApps;
let _filePath;
let _logfile, _appsFile;
const APP_NAME = 'Simple Log';





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
        let logs;
        if (existsSync(_logfile)) logs = readFileSync(_logfile);
        if (logs) {
            let logRows = logs.toString('utf8').split('\n');
            for (let i = 0; i < logRows.length - 1; i++) {
                const logRow = logRows[i];
                let log = JSON.parse(`{${logRow.replace('f:', '"file":').replace('d:', '"date":')}}`);
                log.date = new Date(log.date);
                log.file = filePath + log.file;
                let logDate = this.getLogBookDate(log.date);
                log.id = logDate;
                this.LogBooks[logDate] = new LogBook(log);
            }
        }
        let apps;
        if (existsSync(_appsFile)) apps = readFileSync(_appsFile);
        if (apps) {
            let appRows = apps.toString('utf8').split('\n');
            _logApps = appRows;
        }
        this.stream = createWriteStream(_logfile, { flags: 'a', autoClose: true, });
        this.appsStream = createWriteStream(_appsFile, { flags: 'a', autoClose: true, });

    }

    async getLogs({ severity, facility, app, message, skip, take, maxSizeKb, lastLog, timestampFormat } = {}) {
        let logs = [];
        let opts = BL._.cloneDeep(arguments[0]);
        try {
            
            if(app) {
                opts.apps = [];//BL._.filter(this.LogApps, x=>x.indexOf(app)>-1);
                for (let i = 0; i < this.LogApps.length; i++)
                    if(this.LogApps[i].toLowerCase().indexOf(app.toLowerCase())>-1) opts.apps.push(i);
            }
            let keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'desc');
            let size = 0;
            let dropped = 0;
            //lastDate = new Date(lastDate.setDate(lastDate.getDate()-1));
            let logId = lastLog ? lastLog.split('$')[0] : null;
            let logI = lastLog ? lastLog.split('$')[1] : null;
            let justRun = logId ? false : true;
            if (logId) skip = 0;
            for (let i = 0; i < keys.length; i++) {
                const logBookKey = keys[i];
                if (logId && logId == logBookKey) justRun = true;
                if (!justRun) continue;
                const logBook = this.LogBooks[logBookKey];
                let l;
                try {
                    l = await logBook.getLogs(opts);
                } catch (error) {
                    BL.homey.app.addLogToDB(error.toString(), APP_NAME, {severity:Severity.Debug});
                    continue;
                }
                
                size += this.roughSizeOfObject(l) * 2;
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
                if(take && logs.length>=take) {                    
                    logs = BL._.orderBy(logs, 'timestamp', 'desc');
                    logs.length = take;
                    break;
                }
                size = this.roughSizeOfObject(logs) * 2;
                if (maxSizeKb && size > maxSizeKb * 1000)
                    break;
                //}
                
            }
            logs = BL._.orderBy(logs, 'timestamp', 'desc');
            if (skip && (skip - dropped)) logs = BL._.drop(logs, skip - dropped);
            if (take) logs = BL._.take(logs, take);

            size = this.roughSizeOfObject(logs) * 2;

            if (maxSizeKb && size > maxSizeKb * 1000) {
                let reduce = 1.0 / (maxSizeKb * 1000) * size;
                logs = BL._.take(logs, logs.length / reduce);
            }
            for (let i = 0; i < logs.length; i++) {
                const log = logs[i];
                if (timestampFormat) log.timestamp_formatted = BL.datetime.toString(timestampFormat, log.timestamp);
            }
            //BL.homey.log(this.roughSizeOfObject(logs));


        } catch (error) {
            BL.homey.app.addLogToDB(error.toString(), APP_NAME, {severity:Severity.Debug});
        }
        return logs;
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

    async writeLine({ message, severity, facility, timestamp = new Date(), app }) {
        if(app && app.length>50) throw new Error('App name longer then 50 Characters.');
        let opts = BL._.cloneDeep(...arguments);
        if(app) {
            let i;
            if((i=this.LogApps.indexOf(app))>-1) opts.app = i;
            else {
                this.appsStream.write(app + '\n');
                this.LogApps.push(app);
                opts.app = this.LogApps.length-1;
            }
        }
        return this.getLogBook(timestamp).writeLine(opts);

        //if(this.stream) this.stream.write(JSON.stringify(arguments[0]) + '\r\n');
    }

    getLogBookDate(date) {
        return BL.datetime.toString('yyyy/MM/dd', date);
    }

    getLogBook(date) {
        try {
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
        this.datestarttime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();// , date.getUTCHours()
        this.file = file;
        this.filesCreated = false;
    }

    createFile() {
        let path = this.file.substring(0, this.file.lastIndexOf('/'));

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
        if (!this.fdRead) this.fdRead = await openAsync(this.file + '.log', 'r');

        var buffer = Buffer.alloc(length);
        await readAsync(this.fdRead, buffer, 0, length, start);
        return buffer.toString('utf8');
    }


    async getLogFile() {
        if (!this._logFile) this._logFile = (await readFileAsync(this.file + '.log')).toString('utf8');
        return this._logFile;
    }

    async getLogs({ severity, facility, apps, message, take, skip } = {}) {
        let logs = [];
        let index = await readFileAsync(this.file + '.index');
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
                if (apps !== undefined && apps.indexOf(_app)===-1)
                 continue;
                let log = {
                    //i,
                    id: this.id + '$' + i,
                    timestamp: new Date(Number.parseInt(_index[1]) + this.datestarttime),
                    severity: _severity,// || 6,
                    facility: _facility
                };
                if(_app!==undefined && _app!==null) log.app = BL.homey.app.Log.LogApps[_app];

                log.length = length;
                log.position = oldPos;

                logs.push(log);

                //if (logs.length >= take && !skip) break;
            }
        }
        let logFile = logs.length >= 10 ? await this.getLogFile() : null; // Or greater than x %?

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            let logString = logFile ? logFile.substring(log.position, log.position + log.length) : await this.read(log.position, log.length);
            // let logStrings = JSON.parse(`[${logString.startsWith(',') ? '""' : ''}${logString}]`);
            // log.app = BL.homey.app.Log.LogApps[logStrings[0]];
            // log.message = logStrings[1];
            log.message = JSON.parse(logString);
            delete log.length;
            delete log.position;
        }
        if(message) logs = BL._.filter(logs, x=>x.message.toLowerCase().indexOf(message.toLowerCase())>-1);

        delete this._logFile;
        return logs;
    }
}

module.exports = { Log };