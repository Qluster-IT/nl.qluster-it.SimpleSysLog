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
        if(existsSync(_logfile)) logs = readFileSync(_logfile);//, {flag:'r'})
        if(logs) {
            let logRows = logs.toString('utf8').split('\n');
            for (let i = 0; i < logRows.length-1; i++) {
                const logRow = logRows[i];
                let log = JSON.parse(`{${logRow.replace('f:','"file":').replace('d:','"date":')}}`);
                log.date = new Date(log.date);
                log.file = filePath + log.file;
                let logDate = this.getLogBookDate(log.date);
                this.LogBooks[logDate] = new LogBook(log);
            }
        }
        this.stream = createWriteStream(_logfile, {flags:'a', autoClose:true, });
        
    }

    async getLogs() {
        let logs = [];
        for (const key in this.LogBooks) {
            if (Object.hasOwnProperty.call(this.LogBooks, key)) {
                const logBook = this.LogBooks[key];
                let l = await logBook.getLogs();
                logs = logs.concat(l);
            }
        }
        return logs;
    }

    async writeLine({ message, severity, facility, timestamp=new Date(), data, group }) {
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
                this.LogBooks[logDate] = new LogBook({ file: _filePath + logDate, date });
                if(this.stream) this.stream.write(`f:${JSON.stringify(logDate)},d:${date.getTime()}\n`);
            }
            return this.LogBooks[logDate];
        } catch (error) {
            BL.homey.error(error);
        }
    }
}

let _date, _datestarttime;
let _file;
class LogBook {

    constructor({ file, date }) {
        _date = date;
        _datestarttime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();// , date.getUTCHours()
        _file = file;
        this.filesCreated = false;
    }

    createFile() {
        let path =  _file.substring(0,_file.lastIndexOf('/'));
        
        if (!(existsSync(path))) mkdirSync(path, {recursive:true});

        this.logStream = createWriteStream(_file + '.log', { flags: 'a', autoClose: true, encoding: "utf8" });
        this.indexStream = createWriteStream(_file + '.index', { flags: 'a', autoClose: true });    
    }
    
    writeLine({ message, severity = '', facility = '', timestamp, appName = '' } = {}) {
        if(!this.filesCreated) this.createFile();
        if (!this.logStream) return;
        let defer = new Defer();

        let timeNr = (timestamp.getTime() - _datestarttime);


        //let msg = timeNr + ';' + severity + ';' + facility + ';' + appName + ';' + message;//compress(message);
        //let msg = facility + ';' + appName + ';' + JSON.stringify(message);//compress(message);
        let msg = appName + ';' + JSON.stringify(message);//compress(message);

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
        if(!this.fdRead) this.fdRead = await openAsync(_file + '.log', 'r');
        
        var buffer = Buffer.alloc(length);
        await readAsync(this.fdRead, buffer, 0, length, start);
        return buffer.toString('utf8');
    }

    async getLogs() {
        let logs = [];
        let index = await readFileAsync(_file + '.index');
        if(index) {
            index = index.toString('utf8');
            let indexes = index.split('\n');
            let position = 0;
            for (let i = 0; i < indexes.length-1; i++) {
                const _index = indexes[i].split(';');
                let log = {                    
                    timestamp:new Date(Number.parseInt(_index[1]) + _datestarttime),
                    severity:_index[2],
                    facility:_index[3]
                };

                let length = Number.parseInt(_index[0]);
                let logString = await this.read(position, length);
                //let logStrings = log
                log.string = logString;

                logs.push(log);
                position+=length;
            }
        }
        return logs;
    }
}

module.exports = { Log };