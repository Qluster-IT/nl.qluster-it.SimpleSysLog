const { BL } = require("betterlogiclibrary");
const { Defer } = require("betterlogiclibrary/src/bl");
const { Severity } = require("./../lib/syslog-client");
const path = require("path");
const readline = require("readline");
const { StringDecoder } = require('string_decoder');
const { finished } = require('stream');

const fs = require("fs");
const { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync, unlinkSync, renameSync, readdirSync, statSync, readFileSync, openSync, readSync, closeSync, ftruncateSync, writeFileSync, writeFile } = fs;
//const fs = require('fs/promises');

let _logBooks;
let _logApps;
let _logHostnames;
let _logCount;
let _logAppIndexes = new Map();
let _logHostnameIndexes = new Map();

let _filePath;
let _logfile, _appsFile, _hostnamesFile, _countFile;
const APP_NAME = 'Simple Log';
const LOG_INDEX_V2_HEADER = '#SimpleSysLogIndexV2';
const MAX_BOUNDED_PAGE_SIZE = 10000;
const INDEX_READ_CHUNK_SIZE = 16384;


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
    '23': 'Variable'
};
function substring(str, start, end) {
    return !str ? str : str.substring(start, end);
    if (!str) return str;
    let s = '', d, _end = (end || str.length);
    while (start < _end) {
        s += str.substring(start, start + (d = (d = _end - start) > 12 ? 12 : d));
        start += d;
    }
    return s;
}

function createIndexes(values) {
    const indexes = new Map();
    values.forEach((value, index) => {
        if (!indexes.has(value)) indexes.set(value, index);
    });
    return indexes;
}

function readIndexInteger(text, start, end) {
    let position = start;
    let sign = 1;
    if (text.charCodeAt(position) === 45) {
        sign = -1;
        position++;
    } else if (text.charCodeAt(position) === 43) {
        position++;
    }
    let value = 0;
    let digits = 0;
    while (position < end) {
        const digit = text.charCodeAt(position) - 48;
        if (digit < 0 || digit > 9) break;
        value = value * 10 + digit;
        position++;
        digits++;
    }
    if (digits > 0 && digits <= 15) return sign * value;
    // Preserve parseInt semantics for unusual legacy fields and large integers.
    return start === end ? Number.NaN : Number.parseInt(text.slice(start, end), 10);
}

function compareLogCandidates(left, right) {
    const leftTimestamp = typeof left.timestamp === 'number' ? left.timestamp : left.timestamp.getTime();
    const rightTimestamp = typeof right.timestamp === 'number' ? right.timestamp : right.timestamp.getTime();
    const timestampDifference = leftTimestamp - rightTimestamp;
    if (timestampDifference) return timestampDifference;
    return right.order - left.order;
}

class LogCandidateHeap {
    constructor(limit) {
        this.limit = limit;
        this.items = [];
    }

    accepts(timestamp, order) {
        if (this.items.length < this.limit) return true;
        const oldest = this.items[0];
        const oldestTimestamp = typeof oldest.timestamp === 'number' ? oldest.timestamp : oldest.timestamp.getTime();
        return timestamp > oldestTimestamp || (timestamp === oldestTimestamp && order < oldest.order);
    }

    reusableCandidate() {
        const candidate = this.items.length === this.limit ? this.items[0] : null;
        return candidate && !candidate.preloaded ? candidate : null;
    }

    add(candidate) {
        if (this.items.length < this.limit) {
            this.items.push(candidate);
            this.siftUp(this.items.length - 1);
        } else if (candidate === this.items[0] || compareLogCandidates(candidate, this.items[0]) > 0) {
            this.items[0] = candidate;
            this.siftDown(0);
        }
    }

    siftUp(index) {
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (compareLogCandidates(this.items[index], this.items[parent]) >= 0) break;
            const item = this.items[index];
            this.items[index] = this.items[parent];
            this.items[parent] = item;
            index = parent;
        }
    }

    siftDown(index) {
        while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;
            if (left < this.items.length && compareLogCandidates(this.items[left], this.items[smallest]) < 0) smallest = left;
            if (right < this.items.length && compareLogCandidates(this.items[right], this.items[smallest]) < 0) smallest = right;
            if (smallest === index) break;
            const item = this.items[index];
            this.items[index] = this.items[smallest];
            this.items[smallest] = item;
            index = smallest;
        }
    }

    toSortedArray() {
        return this.items.slice().sort((left, right) => compareLogCandidates(right, left));
    }
}

function writeStreamChunk(stream, chunk) {
    return new Promise((resolve, reject) => {
        stream.write(chunk, error => error ? reject(error) : resolve());
    });
}

// Without an 'error' listener a failed write (e.g. disk full) is an uncaught exception that stops the app.
function openWriteStream(file, options) {
    const stream = createWriteStream(file, options);
    stream.on('error', error => BL.homey.error(`Log write stream error (${path.basename(file)})`, error));
    return stream;
}

function finishWriteStream(stream) {
    return new Promise((resolve, reject) => {
        const onError = error => {
            stream.removeListener('finish', onFinish);
            reject(error);
        };
        const onFinish = () => {
            stream.removeListener('error', onError);
            resolve();
        };
        stream.once('error', onError);
        stream.once('finish', onFinish);
        stream.end();
    });
}


class Log {

    /**
     * @type {LogBook[]}
     * @readonly
     * @memberof Log
     */
    get LogBooks() { if (!_logBooks) _logBooks = {}; return _logBooks; }

    get LogApps() { if (!_logApps) _logApps = []; return _logApps; }
    get LogHostnames() { if (!_logHostnames) _logHostnames = []; return _logHostnames; }

    get logCount() { if (!_logCount) _logCount = 0; return _logCount; }
    set logCount(value) {
        if (!_logCount) _logCount = 0; _logCount = value;
        // try {
        //     this.countStream.write(_logCount.toString());
        //     //writeFileSync(_countFile, _logCount.toString(), { encoding:'utf8', flag:'w'});
        // } catch (error) {

        // }

        return _logCount;
    }

    constructor({ filePath }) {
        _filePath = filePath;
        _logfile = filePath + 'log.index';
        _appsFile = filePath + 'log.apps';
        _hostnamesFile = filePath + 'log.hostnames';
        _countFile = filePath + 'log.count';

    }
    async init() {
        this.activeWriteBook = null;
        _logBooks = {};
        _logApps = [];
        _logHostnames = [];
        _logCount = 0;
        _logAppIndexes = new Map();
        _logHostnameIndexes = new Map();

        let logs;
        //if (existsSync(_logfile)) logs = readFileSync(_logfile);
        try {
            //await fs.access(_logfile, R_OK);
            //logs = await fs.readFile(_logfile);
            logs = readFileSync(_logfile, { encoding: 'utf8' });
        } catch (error) {
            //BL.homey.error(error);
        }
        if (logs) {
            let logRows = logs.split('\n');
            for (let i = 0; i < logRows.length - 1; i++) {
                const logRow = logRows[i];
                try {

                    let log = JSON.parse(`{${logRow.replace('f:', '"file":').replace('d:', '"date":')}}`);
                    log.date = new Date(log.date);
                    log.file = _filePath + log.file;
                    log.path = _filePath;
                    let logDate = this.getLogBookDate(log.date);
                    log.id = logDate;
                    this.LogBooks[logDate] = new LogBook(log);
                } catch (error) {
                    BL.homey.error('Log.init error logRow: ', logRow, error);
                }
            }
        }
        let apps;
        try {
            apps = readFileSync(_appsFile);
        }
        catch (ex) { }
        if (apps) {
            let appRows = apps.toString('utf8').split('\n');
            _logApps = appRows;
        }
        let hostnames;
        try {
            hostnames = readFileSync(_hostnamesFile);
        }
        catch (ex) { }
        if (hostnames) {
            let hostnameRows = hostnames.toString('utf8').split('\n');
            _logHostnames = hostnameRows;
        }
        _logAppIndexes = createIndexes(_logApps);
        _logHostnameIndexes = createIndexes(_logHostnames);

        try {
            _logCount = statSync(_countFile).size;
        } catch (error) { }
        await this.migrateLegacyIndexes();
        this.stream = openWriteStream(_logfile, { flags: 'a', autoClose: true, });
        this.appsStream = openWriteStream(_appsFile, { flags: 'a', autoClose: true, });
        this.hostnameStream = openWriteStream(_hostnamesFile, { flags: 'a', autoClose: true, });
        this.countStream = openWriteStream(_countFile, { flags: 'a', autoClose: true, });
        //this.countStream.write(counts.toString());

    }
    async migrateLegacyIndexes() {
        for (const logBook of Object.values(this.LogBooks)) {
            if (!existsSync(logBook.legacyIndexFile)) continue;
            try {
                await logBook.ensureIndexFormat();
            } catch (error) {
                BL.homey.error(`Unable to migrate log index for ${logBook.id}`, error);
            }
        }
    }

    async destroy() {
        this.activeWriteBook = null;
        for (const logBook of Object.values(this.LogBooks)) {
            await logBook.destroy();
        }
        _logBooks = [];

        if (this.stream) try {
            this.stream.destroy();
            this.stream = null;
        } catch (error) { }

        if (this.appsStream) try {
            this.appsStream.destroy();
            this.appsStream = null;
        } catch (error) { }

        if (this.hostnameStream) try {
            this.hostnameStream.destroy();
            this.hostnameStream = null;
        } catch (error) { }
        if (this.countStream) try {
            this.countStream.destroy();
            this.countStream = null;
        } catch (error) { }
    }

    async clearLog(days) {
        if (days) {
            let date = new Date(); date = date.setDate(date.getDate() - (days + 1));
            let logbookDelete = false;
            let linesDeleted = 0;
            let keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'desc');
            for (let i = 0; i < keys.length; i++) {
                const logBookKey = keys[i];
                const logBook = this.LogBooks[logBookKey];
                if (logBook.date <= date) {
                    logbookDelete = true;
                    if (existsSync(logBook.v2IndexFile)) {
                        linesDeleted += logBook.readLastV2EntryNumber(logBook.v2IndexFile);
                    } else if (existsSync(logBook.legacyIndexFile)) {
                        const reader = readline.createInterface({
                            input: createReadStream(logBook.legacyIndexFile, { encoding: 'utf8' }),
                            crlfDelay: Infinity
                        });
                        for await (const row of reader) if (row) linesDeleted++;
                    }
                    await logBook.destroy();
                    for (const file of [logBook.legacyIndexFile, logBook.v2IndexFile, logBook.tempIndexFile, logBook.file + '.log']) {
                        if (existsSync(file)) unlinkSync(file);
                    }
                    delete this.LogBooks[logBookKey];
                    if (this.activeWriteBook === logBook) this.activeWriteBook = null;
                    continue;
                }
            }
            if (logbookDelete === true) {
                if (this.stream) this.stream.destroy();
                //unlinkSync(_logfile);
                this.stream = openWriteStream(_logfile, { flags: 'w', autoClose: true, });
                keys = BL._.orderBy(Object.keys(this.LogBooks), null, 'asc');
                for (let i = 0; i < keys.length; i++) {
                    const logBookKey = keys[i];
                    const logBook = this.LogBooks[logBookKey];
                    if (this.stream) this.stream.write(`f:${JSON.stringify(logBook.id)},d:${logBook.date.getTime()}\n`);
                }
                if (this.countStream) this.countStream.destroy();
                this.logCount = Math.max(0, this.logCount - linesDeleted);
                const countFile = openSync(_countFile, 'w');
                try {
                   ftruncateSync(countFile, this.logCount);
                } finally {
                   closeSync(countFile);
                }
                this.countStream = openWriteStream(_countFile, { flags: 'a', autoClose: true });
                
                await this.writeLine({ message: "Removed log data older then " + days + " Day(s)", app: "Simple Log" });
            }
        } else {
            let items;
            try {
                items = readdirSync(_filePath);
            } catch (error) {

            }
            await this.destroy();
            if (items) for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const f = path.join(_filePath, item);
                let stat = statSync(f);
                if (stat.isDirectory()) {
                    try { rmSync(f, { recursive: true, force: true }); } catch (ex) {

                        BL.homey.error(ex);
                    }
                } else if (stat.isFile()) {
                    try { unlinkSync(f); } catch (ex) {
                        BL.homey.error(ex);
                    }
                }
            }
            await this.init();
            await this.writeLine({ message: "Cleared all logging data", app: "Simple Log" });
        }
    }

    async getBoundedPage({ opts, keys, logId, lastLog, skip, take, maxSizeKb, indexBuffer }) {
      if (!Number.isSafeInteger(take) || take <= 0) return null;
      const pageSkip = logId ? 0 : (skip === undefined ? 0 : skip);
      const pageSize = pageSkip + take;
      if (!Number.isSafeInteger(pageSkip) || pageSkip < 0 || pageSize > MAX_BOUNDED_PAGE_SIZE) return null;

      const collector = { heap: new LogCandidateHeap(pageSize), order: 0 };
      let justRun = !logId;
      for (const logBookKey of keys) {
        if (logId && logId === logBookKey) justRun = true;
        if (!justRun) continue;

        const logBook = this.LogBooks[logBookKey];
        if (opts.timestamp_fromUTC && logBook.date && logBook.date < opts.timestamp_fromUTC) break;
        if (opts.timestamp_toUTC && logBook.date && logBook.date >= opts.timestamp_toUTC) continue;
        if (logBook.indexVersion === 2 && logBook.maxIndexedTimestamp !== undefined
          && !collector.heap.accepts(logBook.maxIndexedTimestamp, collector.order)) continue;

        try {
          const logs = await logBook.getLogs(opts, collector, indexBuffer);
          if (logBook.indexVersion !== 2) {
            let candidates = logs;
            if (logId && logId === logBookKey) {
              const cursorIndex = candidates.findIndex(log => log.id === lastLog);
              if (cursorIndex >= 0) candidates = candidates.slice(cursorIndex);
            }
            for (const log of candidates) {
              log.order = collector.order++;
              log.book = logBook;
              log.preloaded = true;
              collector.heap.add(log);
            }
          }
        } catch (error) {
          BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
        }
      }

      let page = collector.heap.toSortedArray().slice(pageSkip, pageSize);
      const recordsByBook = new Map();
      for (let index = 0; index < page.length; index++) {
        const candidate = page[index];
        if (candidate.preloaded) continue;
        const log = {
          id: `${candidate.book.id}$${candidate.rowIndex}`,
          timestamp: new Date(candidate.timestamp),
          length: candidate.length,
          position: candidate.position
        };
        if (!Number.isNaN(candidate.severity)) log.severity = candidate.severity;
        if (!Number.isNaN(candidate.facility)) log.facility = candidate.facility;
        if (!Number.isNaN(candidate.appIndex)) log.app = this.LogApps[candidate.appIndex];
        if (!Number.isNaN(candidate.hostnameIndex)) log.hostname = this.LogHostnames[candidate.hostnameIndex];
        page[index] = log;
        if (!recordsByBook.has(candidate.book)) recordsByBook.set(candidate.book, []);
        recordsByBook.get(candidate.book).push(log);
      }
      for (const [logBook, records] of recordsByBook) {
        try {
          await logBook.readMessages(records);
        } finally {
          try {
            logBook.closeReadFile();
          } catch (error) {
            BL.homey.error(error);
          }
        }
      }

      for (const log of page) {
        delete log.order;
        delete log.book;
        delete log.preloaded;
        delete log.length;
        delete log.position;
      }
      if (maxSizeKb) {
        const size = page.reduce((total, log) => total + this.roughSizeOfObject(log) * 2, 0);
        const maxSize = maxSizeKb * 1000;
        if (size > maxSize) {
          page = page.slice(0, maxSize > 0 ? Math.floor(page.length * maxSize / size) : 0);
        }
      }
      return page;
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
                    const appSearch = app.toLowerCase();
                    for (let i = 0; i < this.LogApps.length; i++)
                        if (this.LogApps[i].toLowerCase().includes(appSearch)) opts.apps.push(i);
                }
                if (hostname) {
                    opts.hostnames = [];
                    const hostnameSearch = hostname.toLowerCase();
                    for (let i = 0; i < this.LogHostnames.length; i++)
                        if (this.LogHostnames[i].toLowerCase().includes(hostnameSearch)) opts.hostnames.push(i);
                }
                const hasNoMatches = (opts.apps !== undefined && opts.apps.length === 0)
                    || (opts.hostnames !== undefined && opts.hostnames.length === 0);
                let keys = hasNoMatches ? [] : BL._.orderBy(Object.keys(this.LogBooks), null, 'desc');
                let [logId] = lastLog ? lastLog.split('$') : [];
                let size = 0, dropped = 0;
                let justRun = logId ? false : true;
                if (logId) skip = 0;
                const indexBuffer = keys.length ? Buffer.allocUnsafe(INDEX_READ_CHUNK_SIZE) : undefined;
                let boundedPage = await this.getBoundedPage({ opts, keys, logId, lastLog, skip, take, maxSizeKb, indexBuffer });
                if (boundedPage) {
                    logs = boundedPage;
                } else for (let i = 0; i < keys.length; i++) {
                    const logBookKey = keys[i];
                    if (logId && logId == logBookKey) justRun = true;
                    if (!justRun) continue;
                    const logBook = this.LogBooks[logBookKey];
                    if (opts.timestamp_fromUTC && logBook.date && logBook.date < opts.timestamp_fromUTC) break;
                    if (opts.timestamp_toUTC && logBook.date && logBook.date >= opts.timestamp_toUTC) continue;

                    let l;
                    //if (true) {
                    try {
                        l = await logBook.getLogs(opts, undefined, indexBuffer);
                        //logBook.destroy();
                    } catch (error) {
                        BL.homey.app.addLogToDB(error.toString(), APP_NAME, { severity: Severity.Debug });
                        continue;
                    }
                    if (maxSizeKb) {
                        for (let j = 0; j < l.length; j++)
                            (l[j].size = (this.roughSizeOfObject(l[j]) * 2));
                    }


                    //}
                    for (const log of l) logs.push(log);

                    if (logId && logId == logBookKey) {
                        let cursorIndex = logs.findIndex(log => log.id === lastLog);
                        if (cursorIndex >= 0) logs = logs.slice(cursorIndex);
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
                if (!boundedPage) {
                    logs = BL._.orderBy(logs, 'timestamp', 'desc');
                    if (skip && (skip - dropped)) logs = BL._.drop(logs, skip - dropped);
                    if (take) logs = BL._.take(logs, take);

                    size = BL._.sumBy(logs, 'size');

                    if (maxSizeKb && size > maxSizeKb * 1000) {
                        let reduce = 1.0 / (maxSizeKb * 1000) * size;
                        logs = BL._.take(logs, logs.length / reduce);
                    }
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
            if(!severity && !facility && !hostname && !app && !message && !timestamp_fromUTC && !timestamp_toUTC) result.count = this.logCount;
            //BL.homey.settings.set()
            return result;

        } catch (error) {
            BL.homey.error(error);
            throw new Error(error);
        }
    }

    roughSizeOfObject(object) {

        let objectList = new Set();
        let stack = [object];
        let bytes = 0;

        while (stack.length) {
            let value = stack.pop();

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
                typeof value === 'object' && !objectList.has(value)
            ) {
                objectList.add(value);

                for (let i in value) {
                    stack.push(value[i]);
                }
            }
        }
        return bytes;
    }

    async writeLine({ message, severity, facility, hostname, timestamp = new Date(), app } = {}) {
        //return Promise.resolve();
        let opts = { message, severity, facility, hostname, timestamp: timestamp || new Date(), app }; //BL._.cloneDeep(...arguments);
        if (opts.app && opts.app.length > 100) throw new Error('App name must not be longer than 100 Characters.');
        if (!opts.timestamp) opts.timestamp = new Date();
        if (opts.message !== undefined && opts.message !== null && typeof (opts.message) != 'string') opts.message = opts.message.toString();

        const log = BL._.cloneDeep(opts);
        log.timestamp_formatted = BL.datetime.toString('datetime', log.timestamp);

        if (opts.app) {
            let i = _logAppIndexes.get(opts.app);
            if (i !== undefined) opts.app = i;
            else {
                this.appsStream.write(opts.app + '\n');
                this.LogApps.push(opts.app);
                i = this.LogApps.length - 1;
                _logAppIndexes.set(opts.app, i);
                opts.app = i;
            }
        }
        if (opts.hostname) {
            let i = _logHostnameIndexes.get(opts.hostname);
            if (i !== undefined) opts.hostname = i;
            else {
                this.hostnameStream.write(opts.hostname + '\n');
                this.LogHostnames.push(opts.hostname);
                i = this.LogHostnames.length - 1;
                _logHostnameIndexes.set(opts.hostname, i);
                opts.hostname = i;
            }
        }

        let book;
        try {
            book = this.getLogBook(opts.timestamp);
            const previousBook = this.activeWriteBook;
            this.activeWriteBook = book;
            const r = book.writeLine(opts);
            const completion = previousBook && previousBook !== book
                ? Promise.all([r, previousBook.closeIdleWriteStreams()])
                : r;
            this.logCount++;
            this.countStream.write(" ");
            BL.homey.api.realtime('log_updated', log);
            await completion;
        } catch (error) {
            BL.homey.error(error, 'opts', opts);
            throw new Error(error);
        } finally {
            if (book && book !== this.activeWriteBook) await book.closeIdleWriteStreams();
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
    submitLogBookForDiagnostic(logBookKey) {

        const logBook = this.LogBooks[logBookKey];
        if (logBook) logBook.submitForDiagnostic();
    }

    retrieveLogBookDiagnostic(logBookKey) {

        const logBook = this.LogBooks[logBookKey];
        if (logBook) return logBook.retrieveForDiagnostic();
    }
}



class LogBook {

    constructor({ id, file, date }) {
        this.id = id;
        this.date = date;
        this.datestarttime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        this.file = file;
        this.path = path.dirname(this.file);
        this.legacyIndexFile = this.file + '.index';
        this.v2IndexFile = this.file + '.index.v2';
        this.tempIndexFile = this.v2IndexFile + '.tmp';
        this.indexFile = this.legacyIndexFile;
        this.indexVersion = 0;
        this.indexMigrationPromise = null;
        this.entryCount = 0;
        this.bytePosition = 0;
        this.legacyCharPosition = 0;
        this.filesCreated = false;
        this.pendingWrites = 0;
        this.closingWriteStreams = null;
        this.maxIndexedTimestamp = undefined;
    }

    async ensureIndexFormat() {
        if (this.indexVersion && !this.indexMigrationPromise) return this.indexVersion;
        if (!this.indexMigrationPromise) {
            this.indexMigrationPromise = this.loadOrMigrateIndex();
        }
        try {
            await this.indexMigrationPromise;
        } finally {
            this.indexMigrationPromise = null;
        }
        return this.indexVersion;
    }

    readIndexHeader(file) {
        const fd = openSync(file, 'r');
        try {
            const buffer = Buffer.alloc(LOG_INDEX_V2_HEADER.length + 1);
            const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
            return buffer.toString('utf8', 0, bytesRead).split('\n')[0];
        } finally {
            closeSync(fd);
        }
    }

    readLastV2EntryNumber(file) {
        const size = statSync(file).size;
        if (size <= LOG_INDEX_V2_HEADER.length + 1) return 0;
        const fd = openSync(file, 'r');
        try {
            const length = Math.min(size, 4096);
            const buffer = Buffer.alloc(length);
            const bytesRead = readSync(fd, buffer, 0, length, size - length);
            const rows = buffer.toString('utf8', 0, bytesRead).split('\n').filter(Boolean);
            const lastRow = rows[rows.length - 1];
            const entryNumber = Number.parseInt(lastRow.split(';')[0], 10);
            if (!Number.isInteger(entryNumber)) throw new Error(`Invalid log index entry in ${file}`);
            return entryNumber + 1;
        } finally {
            closeSync(fd);
        }
    }

    hasTrailingNewline(file) {
        const size = statSync(file).size;
        if (!size) return true;
        const fd = openSync(file, 'r');
        try {
            const buffer = Buffer.alloc(1);
            readSync(fd, buffer, 0, 1, size - 1);
            return buffer[0] === 10;
        } finally {
            closeSync(fd);
        }
    }

    normalizeLegacyIndexRow(row) {
        if (Number.isInteger(Number.parseInt(row[0], 10))) return row;
        const firstDigit = row.search(/\d/);
        return firstDigit < 0 ? row : row.substring(firstDigit);
    }

    async readLegacyIndexState() {
        if (!existsSync(this.legacyIndexFile)) return { entryCount: 0, charPosition: 0 };
        const reader = readline.createInterface({
            input: createReadStream(this.legacyIndexFile, { encoding: 'utf8' }),
            crlfDelay: Infinity
        });
        const hasTrailingNewline = this.hasTrailingNewline(this.legacyIndexFile);
        let entryCount = 0;
        let charPosition = 0;
        let pendingRow;
        for await (const row of reader) {
            if (pendingRow !== undefined) {
                const length = Number.parseInt(this.normalizeLegacyIndexRow(pendingRow).split(';')[0], 10);
                if (Number.isInteger(length)) charPosition += length;
                entryCount++;
            }
            pendingRow = row;
        }
        if (hasTrailingNewline && pendingRow !== undefined) {
            const length = Number.parseInt(this.normalizeLegacyIndexRow(pendingRow).split(';')[0], 10);
            if (Number.isInteger(length)) charPosition += length;
            entryCount++;
        }
        return { entryCount, charPosition };
    }

    async *readLogRecordLengths(file) {
        const decoder = new StringDecoder('utf8');
        let characterLength = 0;
        let byteLength = 0;
        const stream = existsSync(file)
            ? createReadStream(file)
            : require('stream').Readable.from([]);

        for await (const buffer of stream) {
            const decoded = decoder.write(buffer);
            let segmentStart = 0;
            for (let index = 0; index < decoded.length; index++) {
                if (decoded.charCodeAt(index) !== 10) continue;
                const segment = decoded.slice(segmentStart, index);
                characterLength += segment.length;
                byteLength += Buffer.byteLength(segment, 'utf8') + 1;
                yield { characterLength, byteLength };
                characterLength = 0;
                byteLength = 0;
                segmentStart = index + 1;
            }
            const remainder = decoded.slice(segmentStart);
            characterLength += remainder.length;
            byteLength += Buffer.byteLength(remainder, 'utf8');
        }

        const remainder = decoder.end();
        let segmentStart = 0;
        for (let index = 0; index < remainder.length; index++) {
            if (remainder.charCodeAt(index) !== 10) continue;
            const segment = remainder.slice(segmentStart, index);
            characterLength += segment.length;
            byteLength += Buffer.byteLength(segment, 'utf8') + 1;
            yield { characterLength, byteLength };
            characterLength = 0;
            byteLength = 0;
            segmentStart = index + 1;
        }
        const finalSegment = remainder.slice(segmentStart);
        characterLength += finalSegment.length;
        byteLength += Buffer.byteLength(finalSegment, 'utf8');
        if (characterLength || byteLength) {
            throw new Error(`Legacy log record is incomplete in ${file}`);
        }
    }

    async loadOrMigrateIndex() {
        if (existsSync(this.v2IndexFile)) {
            if (this.readIndexHeader(this.v2IndexFile) !== LOG_INDEX_V2_HEADER) {
                if (!existsSync(this.legacyIndexFile)) {
                    throw new Error(`Invalid log index header in ${this.v2IndexFile}`);
                }
                unlinkSync(this.v2IndexFile);
            } else {
                this.indexFile = this.v2IndexFile;
                this.indexVersion = 2;
                this.entryCount = this.readLastV2EntryNumber(this.v2IndexFile);
                this.bytePosition = existsSync(this.file + '.log') ? statSync(this.file + '.log').size : 0;
                if (existsSync(this.legacyIndexFile)) {
                    try {
                        unlinkSync(this.legacyIndexFile);
                    } catch (error) {
                        BL.homey.error(`Unable to remove migrated log index ${this.legacyIndexFile}`, error);
                    }
                }
                return;
            }
        }

        if (existsSync(this.tempIndexFile)) unlinkSync(this.tempIndexFile);
        if (!existsSync(this.legacyIndexFile)) {
            if (existsSync(this.file + '.log') && statSync(this.file + '.log').size > 0) {
                throw new Error(`Cannot create a v2 index for unindexed log data in ${this.file}.log`);
            }
            mkdirSync(this.path, { recursive: true });
            writeFileSync(this.tempIndexFile, LOG_INDEX_V2_HEADER + '\n', { encoding: 'utf8', flag: 'wx' });
            renameSync(this.tempIndexFile, this.v2IndexFile);
            this.indexFile = this.v2IndexFile;
            this.indexVersion = 2;
            this.entryCount = 0;
            this.bytePosition = 0;
            return;
        }

        await this.migrateLegacyIndex();
    }

    async migrateLegacyIndex() {
        mkdirSync(this.path, { recursive: true });
        const indexReader = readline.createInterface({
            input: createReadStream(this.legacyIndexFile, { encoding: 'utf8' }),
            crlfDelay: Infinity
        });
        const logFile = this.file + '.log';
        let logIterator;
        let output;
        let outputBuffer = LOG_INDEX_V2_HEADER + '\n';
        let entryCount = 0;
        let bytePosition = 0;
        let migrationError;

        try {
            if (!this.hasTrailingNewline(this.legacyIndexFile)) {
                throw new Error(`Legacy log index is incomplete: ${this.legacyIndexFile}`);
            }
            if (!existsSync(logFile) && statSync(this.legacyIndexFile).size > 0) {
                throw new Error(`Log data is missing for ${this.legacyIndexFile}`);
            }
            output = openWriteStream(this.tempIndexFile, { flags: 'wx', encoding: 'utf8' });

            const indexIterator = indexReader[Symbol.asyncIterator]();
            logIterator = this.readLogRecordLengths(logFile)[Symbol.asyncIterator]();
            while (true) {
                const [indexRow, logRecord] = await Promise.all([indexIterator.next(), logIterator.next()]);
                if (indexRow.done && logRecord.done) break;
                if (indexRow.done || logRecord.done) {
                    throw new Error(`Legacy index and log record counts differ for ${this.id}`);
                }

                const fields = this.normalizeLegacyIndexRow(indexRow.value).split(';');
                const characterLength = Number.parseInt(fields[0], 10);
                if (fields.length < 6 || !Number.isInteger(characterLength)) {
                    throw new Error(`Invalid legacy index row in ${this.legacyIndexFile}`);
                }
                if (logRecord.value.characterLength + 1 !== characterLength) {
                    throw new Error(`Legacy character offset mismatch in ${this.legacyIndexFile}`);
                }

                const byteLength = logRecord.value.byteLength;
                outputBuffer += `${entryCount};${bytePosition};${byteLength};${fields.slice(1).join(';')}\n`;
                entryCount++;
                bytePosition += byteLength;
                if (outputBuffer.length >= 65536) {
                    await writeStreamChunk(output, outputBuffer);
                    outputBuffer = '';
                }
                if (entryCount % 1024 === 0) {
                    await new Promise(resolve => setImmediate(resolve));
                }
            }

            if (existsSync(logFile) && bytePosition !== statSync(logFile).size) {
                throw new Error(`Legacy byte length mismatch in ${logFile}`);
            }
            if (outputBuffer) await writeStreamChunk(output, outputBuffer);
            await finishWriteStream(output);
            output = null;

            renameSync(this.tempIndexFile, this.v2IndexFile);
            this.indexFile = this.v2IndexFile;
            this.indexVersion = 2;
            this.entryCount = entryCount;
            this.bytePosition = bytePosition;
            try {
                unlinkSync(this.legacyIndexFile);
            } catch (error) {
                BL.homey.error(`Unable to remove migrated log index ${this.legacyIndexFile}`, error);
            }
        } catch (error) {
            migrationError = error;
            if (output) {
                await new Promise(resolve => {
                    output.once('close', resolve);
                    output.destroy();
                });
            }
            try {
                if (existsSync(this.tempIndexFile)) unlinkSync(this.tempIndexFile);
            } catch (cleanupError) {
                BL.homey.error(`Unable to remove incomplete log index ${this.tempIndexFile}`, cleanupError);
            }
            this.indexFile = this.legacyIndexFile;
            this.indexVersion = 1;
            const state = await this.readLegacyIndexState();
            this.entryCount = state.entryCount;
            this.legacyCharPosition = state.charPosition;
            BL.homey.error(`Keeping legacy log index ${this.legacyIndexFile}`, migrationError);
        } finally {
            indexReader.close();
            if (logIterator) {
                try {
                    await logIterator.return();
                } catch (error) {
                    BL.homey.error(`Unable to close migration stream for ${logFile}`, error);
                }
            }
        }
    }

    async destroy() {
        if (this.closingWriteStreams) await this.closingWriteStreams;
        if (this.fdRead && Number.isInteger(this.fdRead)) try {
            closeSync(this.fdRead);
            this.fdRead = null;
        } catch (error) {
            BL.homey.error(error);
        } else if (this.fdRead) try {
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
        this.filesCreated = false;
    }

    createFile() {
        let path = this.path;

        if (!(existsSync(path))) mkdirSync(path, { recursive: true });

        this.logStream = openWriteStream(this.file + '.log', { flags: 'a', autoClose: true, encoding: "utf8" });
        this.indexStream = openWriteStream(this.indexFile, { flags: 'a', autoClose: true });
        this.filesCreated = true;
    }

    async closeIdleWriteStreams() {
        if (this.closingWriteStreams) return this.closingWriteStreams;
        if (this.pendingWrites || !this.filesCreated) return;
        const streams = [this.logStream, this.indexStream].filter(Boolean);
        this.logStream = null;
        this.indexStream = null;
        this.filesCreated = false;
        this.closingWriteStreams = Promise.allSettled(streams.map(stream => new Promise((resolve, reject) => {
            const cleanup = finished(stream, error => {
                cleanup();
                if (error) reject(error);
                else resolve();
            });
            if (!stream.writableEnded) stream.end();
        }))).then(results => {
            const failure = results.find(result => result.status === 'rejected');
            if (failure) throw failure.reason;
        });
        try {
            await this.closingWriteStreams;
        } finally {
            this.closingWriteStreams = null;
        }
    }

    async writeLine({ message, severity = '', facility = '', timestamp, app = '', hostname = '' } = {}) {
        this.pendingWrites++;
        this.maxIndexedTimestamp = undefined;
        try {
            if (this.closingWriteStreams) await this.closingWriteStreams;
            await this.ensureIndexFormat();
            if (!this.filesCreated) this.createFile();
            if (!this.logStream) return;

            const timeNr = timestamp.getTime() - this.datestarttime;
            const bytes = JSON.stringify(message) + '\n';
            const byteLength = Buffer.byteLength(bytes, 'utf8');
            const row = this.indexVersion === 2
                ? `${this.entryCount};${this.bytePosition};${byteLength};${timeNr};${severity};${facility};${app};${hostname}\n`
                : `${bytes.length};${timeNr};${severity};${facility};${app};${hostname}\n`;
            if (this.indexVersion === 2) this.bytePosition += byteLength;
            else this.legacyCharPosition += bytes.length;
            this.entryCount++;

            await Promise.all([
                new Promise((resolve, reject) => this.logStream.write(bytes, error => error ? reject(error) : resolve())),
                new Promise((resolve, reject) => this.indexStream.write(row, error => error ? reject(error) : resolve()))
            ]);
        } finally {
            this.pendingWrites--;
        }
    }

    readBuffer(start, length, buffer = Buffer.alloc(length)) {
        if (!this.fdRead) this.fdRead = openSync(this.file + '.log', 'r');
        const bytesRead = readSync(this.fdRead, buffer, 0, length, start);
        if (bytesRead !== length) throw new Error(`Incomplete log record at byte ${start} in ${this.file}.log`);
        return buffer.subarray(0, length);
    }

    read(start, length) {
        return this.readBuffer(start, length).toString('utf8');
    }


    getLogFile() {
        // BL.homey.log('LogBook.getLogFile');
        // try {
        //     //if (!this._logFile) this._logFile = (await fs.readFile(this.file + '.log')).toString('utf8');
        //     if (!this._logFile) this._logFile = readFileSync(this.file + '.log', {encoding:'utf8'});
        // } catch (error) {
        // }
        // return this._logFile;
        try {
            //if (!this._logFile) this._logFile = (await fs.readFile(this.file + '.log')).toString('utf8');
            return readFileSync(this.file + '.log', { encoding: 'utf8' });
        } catch (error) {
        }
    }

    getIndexForDiagnostic() {
        const indexFile = existsSync(this.v2IndexFile) ? this.v2IndexFile : this.legacyIndexFile;
        return readFileSync(indexFile, { encoding: 'utf8' });
    }

    reportMessageError(log, logString, error) {
        try {
            BL.homey.error('logString', logString, '\nLogIndex:', log, '\n', error);
        } catch (loggingError) {
        }
    }

    parseMessage(log, logString) {
        try {
            log.message = JSON.parse(logString);
        } catch (error) {
            this.reportMessageError(log, logString, error);
        }
    }

    async readMessages(logs) {
        if (this.indexVersion === 2) {
            if (!logs.length) return;
            const entries = logs.slice().sort((left, right) => left.position - right.position);
            const buffer = Buffer.alloc(Math.min(65536, entries.reduce((sum, log) => sum + log.length, 0)));
            for (let index = 0; index < entries.length;) {
                const startIndex = index;
                const start = entries[index].position;
                let length = entries[index++].length;
                while (index < entries.length
                    && entries[index].position === start + length
                    && length + entries[index].length <= buffer.length) {
                    length += entries[index++].length;
                }
                try {
                    const data = this.readBuffer(start, length, length <= buffer.length ? buffer : undefined);
                    for (let item = startIndex; item < index; item++) {
                        const log = entries[item];
                        const offset = log.position - start;
                        this.parseMessage(log, data.toString('utf8', offset, offset + log.length));
                    }
                } catch (error) {
                    if (index - startIndex > 1) {
                        BL.homey.error('Batched log read failed; retrying individual records', error);
                    }
                    for (let item = startIndex; item < index; item++) {
                        const log = entries[item];
                        if (index - startIndex === 1) {
                            this.reportMessageError(log, '', error);
                            continue;
                        }
                        try {
                            this.parseMessage(log, this.read(log.position, log.length));
                        } catch (readError) {
                            this.reportMessageError(log, '', readError);
                        }
                    }
                }
            }
            return;
        }

        const entries = logs
            .map(log => ({ log, start: log.position, end: log.position + log.length, parts: [] }))
            .sort((left, right) => left.start - right.start);
        if (!entries.length) return;

        let position = 0;
        let nextEntry = 0;
        try {
            const stream = createReadStream(this.file + '.log', { encoding: 'utf8' });
            for await (const chunk of stream) {
                const chunkEnd = position + chunk.length;
                while (nextEntry < entries.length) {
                    const entry = entries[nextEntry];
                    const overlapStart = Math.max(entry.start, position);
                    const overlapEnd = Math.min(entry.end, chunkEnd);
                    if (overlapStart < overlapEnd) {
                        entry.parts.push(chunk.slice(overlapStart - position, overlapEnd - position));
                    }
                    if (entry.end <= chunkEnd) {
                        nextEntry++;
                    } else {
                        break;
                    }
                }
                position = chunkEnd;
                if (nextEntry === entries.length) break;
            }
        } catch (error) {
            try {
                BL.homey.error('LogBook streaming read failed; using full-file fallback', error);
            } catch (loggingError) {
            }
            const logFile = this.getLogFile();
            if (typeof logFile !== 'string') {
                for (const entry of entries) this.reportMessageError(entry.log, '', error);
                return;
            }
            for (const entry of entries) {
                const logString = logFile.slice(entry.start, entry.end);
                this.parseMessage(entry.log, logString);
            }
            return;
        }

        for (const entry of entries) {
            this.parseMessage(entry.log, entry.parts.join(''));
        }
    }

    closeReadFile() {
        if (this.fdRead && Number.isInteger(this.fdRead)) {
            closeSync(this.fdRead);
            this.fdRead = null;
        } else if (this.fdRead) {
            this.fdRead.close();
            this.fdRead = null;
        }
    }

    async getLogs(options = {}, candidateCollector, indexBuffer) {
        if (!this.indexVersion || this.indexMigrationPromise) await this.ensureIndexFormat();
        if (this.indexVersion !== 2) return this.getLegacyLogs(options);
        return this.getV2Logs(options, candidateCollector, indexBuffer);
    }

    async *readIndexChunks(buffer = Buffer.allocUnsafe(INDEX_READ_CHUNK_SIZE)) {
        const fd = await new Promise((resolve, reject) =>
            fs.open(this.indexFile, 'r', (error, fd) => error ? reject(error) : resolve(fd)));
        const decoder = new StringDecoder('utf8');
        let pending = '';
        try {
            while (true) {
                const bytesRead = await new Promise((resolve, reject) =>
                    fs.read(fd, buffer, 0, buffer.length, null, (error, count) => error ? reject(error) : resolve(count)));
                if (!bytesRead) break;
                const text = pending + decoder.write(buffer.subarray(0, bytesRead));
                const end = text.lastIndexOf('\n');
                if (end < 0) {
                    pending = text;
                    continue;
                }
                pending = text.slice(end + 1);
                yield text.slice(0, end + 1);
            }
            pending += decoder.end();
            if (pending) yield pending;
        } finally {
            await new Promise((resolve, reject) => fs.close(fd, error => error ? reject(error) : resolve()));
        }
    }

    async cursorRowMatches(options, cursorRow, indexBuffer) {
        let isHeader = true;
        for await (const text of this.readIndexChunks(indexBuffer)) {
            for (const row of text.split(/\r?\n/)) {
                if (isHeader) {
                    isHeader = false;
                    if (row !== LOG_INDEX_V2_HEADER) throw new Error(`Invalid log index header in ${this.indexFile}`);
                    continue;
                }
                if (!row) continue;
                const fields = row.split(';');
                if (Number.parseInt(fields[0], 10) !== cursorRow) continue;
                const matchesMetadata = (options.severity === undefined || Number.parseInt(fields[4], 10) === options.severity)
                    && (options.facility === undefined || Number.parseInt(fields[5], 10) === options.facility)
                    && (options.apps === undefined || options.apps.includes(Number.parseInt(fields[6], 10)))
                    && (options.hostnames === undefined || options.hostnames.includes(Number.parseInt(fields[7], 10)));
                if (!matchesMetadata || !options.message) return matchesMetadata;
                const log = { position: Number.parseInt(fields[1], 10), length: Number.parseInt(fields[2], 10) };
                if (!Number.isSafeInteger(log.position) || !Number.isSafeInteger(log.length)
                    || log.position < 0 || log.length < 0) {
                    throw new Error(`Invalid log index values in ${this.indexFile}`);
                }
                try {
                    await this.readMessages([log]);
                    return Boolean(log.message && log.message.toLowerCase().includes(options.message.toLowerCase()));
                } finally {
                    this.closeReadFile();
                }
            }
        }
        return false;
    }

    async getV2Logs(options = {}, candidateCollector, indexBuffer = Buffer.allocUnsafe(INDEX_READ_CHUNK_SIZE)) {
        const entryCountAtStart = this.entryCount;
        const trackTimestampBound = this.maxIndexedTimestamp === undefined && this.pendingWrites === 0;
        let maxIndexedTimestamp = -Infinity;
        const { severity, facility, hostnames, apps, message } = options;
        const lastLog = candidateCollector ? options.lastLog : undefined;
        const [cursorBook, cursorRowValue] = lastLog ? lastLog.split('$') : [];
        const cursorRow = cursorBook === this.id ? Number.parseInt(cursorRowValue, 10) : Number.NaN;
        const shouldApplyCursor = Number.isInteger(cursorRow)
            && await this.cursorRowMatches(options, cursorRow, indexBuffer);
        const logs = [];
        const searchTerm = message ? message.toLowerCase() : undefined;
        const pending = [];
        let pendingBytes = 0;
        const filterPendingMessages = async () => {
            if (!pending.length) return;
            await this.readMessages(pending);
            for (const log of pending) {
                if (!log.message || !log.message.toLowerCase().includes(searchTerm)) continue;
                if (candidateCollector) {
                    delete log.message;
                    candidateCollector.heap.add(log);
                } else {
                    logs.push(log);
                }
            }
            pending.length = 0;
            pendingBytes = 0;
            await new Promise(resolve => setImmediate(resolve));
        };
        let isHeader = true;
        try {
            for await (const text of this.readIndexChunks(indexBuffer)) {
                let rowStart = 0;
                while (rowStart < text.length) {
                    const start = rowStart;
                    const newline = text.indexOf('\n', start);
                    const rowEnd = newline < 0 ? text.length : newline;
                    rowStart = rowEnd + 1;
                    if (isHeader) {
                        isHeader = false;
                        const row = text.slice(start, rowEnd).replace(/\r$/, '');
                        if (row !== LOG_INDEX_V2_HEADER) throw new Error(`Invalid log index header in ${this.indexFile}`);
                        continue;
                    }
                    if (start === rowEnd || (rowEnd === start + 1 && text.charCodeAt(start) === 13)) continue;

                    // Locals avoid boxing each field read from a typed-array scratch buffer.
                    let rowIndex, position, length, time, rowSeverity, rowFacility, appIndex, hostnameIndex;
                    let fieldStart = start;
                    for (let field = 0; field < 8; field++) {
                        let end = text.indexOf(';', fieldStart);
                        if (end < 0 || end > rowEnd) {
                            if (field < 7) throw new Error(`Invalid log index row in ${this.indexFile}`);
                            end = rowEnd;
                        }
                        const value = readIndexInteger(text, fieldStart, end);
                        switch (field) {
                            case 0: rowIndex = value; break;
                            case 1: position = value; break;
                            case 2: length = value; break;
                            case 3: time = value; break;
                            case 4: rowSeverity = value; break;
                            case 5: rowFacility = value; break;
                            case 6: appIndex = value; break;
                            case 7: hostnameIndex = value; break;
                        }
                        fieldStart = end + 1;
                    }
                    if (!Number.isSafeInteger(rowIndex) || !Number.isSafeInteger(position)
                        || !Number.isSafeInteger(length) || !Number.isSafeInteger(time)
                        || rowIndex < 0 || position < 0 || length < 0) {
                        throw new Error(`Invalid log index values in ${this.indexFile}`);
                    }
                    const timestamp = time + this.datestarttime;
                    if (trackTimestampBound && (timestamp > maxIndexedTimestamp || Number.isNaN(timestamp))) {
                        maxIndexedTimestamp = timestamp;
                    }

                    if (candidateCollector) candidateCollector.order++;
                    if (severity !== undefined && rowSeverity !== severity) continue;
                    if (facility !== undefined && rowFacility !== facility) continue;
                    if (apps !== undefined && !apps.includes(appIndex)) continue;
                    if (hostnames !== undefined && !hostnames.includes(hostnameIndex)) continue;

                    if (shouldApplyCursor && rowIndex < cursorRow) continue;

                    if (candidateCollector && !candidateCollector.heap.accepts(timestamp, candidateCollector.order - 1)) continue;

                    const log = candidateCollector && searchTerm === undefined
                        ? candidateCollector.heap.reusableCandidate() || {}
                        : {};
                    if (candidateCollector) {
                        log.rowIndex = rowIndex;
                        log.timestamp = timestamp;
                        log.severity = rowSeverity;
                        log.facility = rowFacility;
                        log.appIndex = appIndex;
                        log.hostnameIndex = hostnameIndex;
                        log.order = candidateCollector.order - 1;
                        log.book = this;
                    } else {
                        log.id = `${this.id}$${rowIndex}`;
                        log.timestamp = new Date(timestamp);
                        if (!Number.isNaN(rowSeverity)) log.severity = rowSeverity;
                        if (!Number.isNaN(rowFacility)) log.facility = rowFacility;
                        if (!Number.isNaN(appIndex)) log.app = BL.homey.app.Log.LogApps[appIndex];
                        if (!Number.isNaN(hostnameIndex)) log.hostname = BL.homey.app.Log.LogHostnames[hostnameIndex];
                    }
                    log.length = length;
                    log.position = position;

                    if (searchTerm !== undefined) {
                        if (pendingBytes + length > 65536) await filterPendingMessages();
                        pending.push(log);
                        pendingBytes += length;
                        if (pending.length >= 64 || pendingBytes >= 65536) await filterPendingMessages();
                    } else if (candidateCollector) {
                        candidateCollector.heap.add(log);
                    } else {
                        logs.push(log);
                    }
                }
            }

            if (searchTerm !== undefined) await filterPendingMessages();
            // Queued or concurrent appends may not have reached the index yet.
            if (trackTimestampBound && !this.pendingWrites && this.entryCount === entryCountAtStart
                && !Number.isNaN(maxIndexedTimestamp)) this.maxIndexedTimestamp = maxIndexedTimestamp;
            if (candidateCollector) return [];
            if (searchTerm === undefined) await this.readMessages(logs);
        } finally {
            this.closeReadFile();
        }
        for (const log of logs) {
            delete log.length;
            delete log.position;
        }
        return logs;
    }

    async getLegacyLogs({ severity, facility, hostnames, apps, message, take, skip } = {}) {
        if (this.logs && this.logs.length) return this.logs;
        let logs = [];
        //let ind = readFileSync(this.file + '.index', { encoding: 'utf8' });
        //this.getLogFile();
        //return logs;
        try {
            //return logs;
            //let index = (await fs.readFile(this.file + '.index'));
            let index = readFileSync(this.file + '.index', { encoding: 'utf8' });
            //return [];
            //BL.homey.log('readFileSync index');
            //return logs;
            //this._index = index; // saves it for debugging?
            if (index) {
                //index = index;//.toString('utf8');
                let indexes = index.split('\n');

                let position = 0;
                for (let i = 0; i < indexes.length - 1; i++) {
                    let fixFile = false;
                    if (!Number.isInteger(Number.parseInt(indexes[i][0]))) {
                        for (let j = 0; j < indexes[i].length; j++) {
                            if (Number.isInteger(Number.parseInt(indexes[i][j]))) {
                                indexes[i] = indexes[i].substring(j);
                                fixFile = true;

                                this.indexStream.close();
                                unlinkSync(this.file + '.index');
                                this.indexStream = openWriteStream(this.file + '.index', { flags: 'a', autoClose: true, encoding: "utf8" });
                                let defer = new Defer();
                                this.indexStream.write(indexes.join('\n'), (error) => {
                                    defer.resolve();
                                });
                                await defer.promise;
                                break;
                            }
                        }

                    }
                    const _index = indexes[i].split(';');
                    //continue;
                    let length = Number.parseInt(_index[0]);
                    let oldPos = position;
                    position += length;
                    if (fixFile) {
                        let logFile = this.getLogFile();
                        for (let j = oldPos; j < logFile.length; j++) {
                            if (logFile[j] == "\"") {
                                logFile = logFile.substring(0, oldPos) + logFile.substring(j);

                                this.logStream.close();
                                unlinkSync(this.file + '.log');
                                this.logStream = openWriteStream(this.file + '.log', { flags: 'a', autoClose: true, encoding: "utf8" });
                                let defer = new Defer();
                                this.logStream.write(logFile, (error) => {
                                    defer.resolve();
                                });
                                await defer.promise;
                                break;
                            }
                        }
                    }
                    let _severity = Number.parseInt(_index[2]);
                    if (severity !== undefined && _severity !== severity) continue;
                    let _facility = Number.parseInt(_index[3]);
                    if (facility !== undefined && _facility !== facility) continue;
                    let _app = Number.parseInt(_index[4]);
                    if (apps !== undefined && apps.indexOf(_app) === -1)
                        continue;

                    let _hostname = _index.length > 5 ? Number.parseInt(_index[5]) : undefined;
                    if (_index.length === '0') {
                        let a = 0;
                    }
                    if (hostnames !== undefined && hostnames.indexOf(_hostname) === -1)
                        continue;
                    let log = {
                        id: this.id + '$' + i,
                        timestamp: new Date(Number.parseInt(_index[1]) + this.datestarttime),
                        length,
                        position: oldPos
                    };
                    if (!Number.isNaN(_severity)) log.severity = _severity;
                    if (!Number.isNaN(_facility)) log.facility = _facility;

                    if (!Number.isNaN(_app) && _app !== undefined && _app !== null) log.app = BL.homey.app.Log.LogApps[_app];
                    if (!Number.isNaN(_hostname) && _hostname !== undefined && _hostname !== null) log.hostname = BL.homey.app.Log.LogHostnames[_hostname];

                    // log.length = length;
                    // log.position = oldPos;
                    //log = BL._.clone(log);
                    logs.push(log);

                    //if (logs.length >= take && !skip) break;
                }
            }
        } catch (error) {
            BL.homey.error(error);
        }
        //return logs;

        await this.readMessages(logs);
        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            delete log.length;
            delete log.position;
        }

        if (message) logs = BL._.filter(logs, x => x.message && x.message.toLowerCase().indexOf(message.toLowerCase()) > -1);

        delete this._logFile; // for debugging disable this line.
        if (this.fdRead && Number.isInteger(this.fdRead)) try {
            closeSync(this.fdRead);
            this.fdRead = null;
        } catch (error) {
            BL.homey.error(error);
        } else if (this.fdRead) try {
            this.fdRead.close();
            this.fdRead = null;
        } catch (error) {
            BL.homey.error(error);
        }
        //this.logs = logs; // for debugging, enable this line.
        return logs;
    }

    retrieveForDiagnostic() {
        return `'logbook: ' ${this.id}\nIndex:\n${this.getIndexForDiagnostic()}\nlogFile:\n${this.getLogFile()}`;
    }
    submitForDiagnostic() {
        BL.homey.log('logbook:', this.id, '\nIndex:\n', this.getIndexForDiagnostic(), '\nlogFile:\n', this.getLogFile())
    }
}

module.exports = { Log, SEVERITIES, FACILITIES };