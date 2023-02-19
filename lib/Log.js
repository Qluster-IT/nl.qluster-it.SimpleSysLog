const { BL } = require("betterlogiclibrary");
const { Defer } = require("betterlogiclibrary/src/bl");
const { createWriteStream, open, read, existsSync, mkdirSync, readSync, readFileSync, readFile } = require("fs");
// const { readFile, writeFile, unlink, rename, exists, mkdir, copyFile, readdir, stat } = require('fs');
//const { compressToUint8Array, decompress, compress, compressToUTF16, decompressFromUTF16 } = require("lz-string");
const { promisify } = require('util');
const { randomBytes } = require('crypto');

// const existsAsync = promisify(exists);
// const mkdirAsync = promisify(mkdir);
// const readdirAsync = promisify(readdir);
// const statAsync = promisify(stat);

const openAsync = promisify(open);
const readAsync = promisify(read);
const readFileAsync = promisify(readFile);

let _logBooks;
let _filePath;
let _logfile;

class Log {

    /**
     * @type {LogBook[]}
     * @readonly
     * @memberof Log
     */
    get LogBooks() { if (!_logBooks) _logBooks = {}; return _logBooks; }

    constructor({ filePath }) {
        _filePath = filePath;
        _logfile = filePath + 'log.jsons';
        let logs;
        if (existsSync(_logfile)) logs = readFileSync(_logfile);//, {flag:'r'})
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
        this.stream = createWriteStream(_logfile, { flags: 'a', autoClose: true, });

    }

    async getLogs({ skip, take, maxSizeKb, lastLog }) {
        let logs = [];
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
            let l = await logBook.getLogs();
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
        //BL.homey.log(this.roughSizeOfObject(logs));
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

    async writeLine({ message, severity, facility, timestamp = new Date(), data, group }) {
        return this.getLogBook(timestamp).writeLine(...arguments);

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
    }

    writeLine({ message, severity = '', facility = '', timestamp, appName = '' } = {}) {
        if (!this.filesCreated) this.createFile();
        if (!this.logStream) return;
        let defer = new Defer();

        let timeNr = (timestamp.getTime() - this.datestarttime);

        //let msg = timeNr + ';' + severity + ';' + facility + ';' + appName + ';' + message;//compress(message);
        //let msg = facility + ';' + appName + ';' + JSON.stringify(message);//compress(message);
        let msg = (appName ? JSON.stringify(appName) : '') + ',' + JSON.stringify(message);//compress(message);

        let bytes = msg + '\n';

        this.logStream.write(bytes, (error) => {
            if (error) defer.reject(new Error(error));
            defer.resolve();
        });
        //let index = [bytes.length,timeNr,severity,facility];
        this.indexStream.write(`${bytes.length};${timeNr};${severity};${facility}\n`);
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

    async getLogs() {
        let logs = [];
        let index = await readFileAsync(this.file + '.index');
        if (index) {
            let logFile = (await readFileAsync(this.file + '.log')).toString('utf8');
            index = index.toString('utf8');
            let indexes = index.split('\n');
            let position = 0;
            for (let i = 0; i < indexes.length - 1; i++) {
                const _index = indexes[i].split(';');
                let log = {
                    i,
                    id: this.id + '$' + i,
                    timestamp: new Date(Number.parseInt(_index[1]) + this.datestarttime),
                    severity: _index[2],
                    facility: _index[3]
                };
                let length = Number.parseInt(_index[0]);
                //let logString = logFile ? logFile.substring(position, position+length) : await this.read(position, length);
                let logString = logFile.substring(position, position + length);
                let logStrings = JSON.parse(`[${logString.startsWith(',') ? '""' : ''}${logString}]`);
                //let logStrings = log
                log.string = logString;
                log.appName = logStrings[0];
                log.message = logStrings[1];

                logs.push(log);
                position += length;
            }
        }
        return logs;
    }
}

module.exports = { Log };