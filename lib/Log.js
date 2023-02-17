const { BL } = require("betterlogiclibrary");
const { Defer } = require("betterlogiclibrary/src/bl");
const { createWriteStream, openSync, writeSync, open, read } = require("fs");
const { compressToUint8Array, decompress, compress, compressToUTF16, decompressFromUTF16 } = require("lz-string");

let _logBooks;
let _filePath;

class Log {

    /**
     * @type {LogBook[]}
     * @readonly
     * @memberof Log
     */
    get LogBooks() { if (!_logBooks) _logBooks = {}; return _logBooks; }

    constructor({ filePath }) {
        _filePath = filePath;
        //this.stream = createWriteStream(filePath + 'log.jsons', {flags:'a', autoClose:true, });

        // console.log(new Date().toISOString());
        // [...Array(1000)].forEach( (item,index) => {
        //     this.writeLine({message:'Test message', timestamp:new Date(), a:'\r\nasdsad\asd'});

        // });
        // console.log(new Date().toISOString());
        // this.stream.end();
    }

    async writeLine({ message, severity, facility, timestamp, data, group }) {
        return this.getLogBook(timestamp).writeLine(...arguments);

        //if(this.stream) this.stream.write(JSON.stringify(arguments[0]) + '\r\n');
    }

    getLogBook(date) {
        let logDate = BL.datetime.toString('yyyy-MM-dd', date);
        if (!this.LogBooks[logDate]) this.LogBooks[logDate] = new LogBook({ file: _filePath + logDate, date });
        return this.LogBooks[logDate];
    }
}

let _date, _datestarttime;
let _file;
class LogBook {
    constructor({ file, date }) {
        _date = date;
        _datestarttime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        _file = file;

        this.logStream = createWriteStream(file + '.log', { flags: 'a', autoClose: true, encoding: "utf8" });//, encoding: "binary"});// });
        this.indexStream = createWriteStream(file + '.index', { flags: 'a', autoClose: true });
        this.index = [];
        this.position = 0;
        //this.stream = openSync(file, 'a');        
    }

    writeLine({ message, severity = '', facility = '', timestamp, appName = '' } = {}) {
        if (!this.logStream) return;
        let defer = new Defer();
        //if(message) message = await BL.proto.zipstr(message, {level:1});
        
        //DEBUGGING!!!!!!
        //timestamp = new Date(_datestarttime);
        let timeNr = (timestamp.getTime() - _datestarttime);


        //let msg = timeNr + ';' + severity + ';' + facility + ';' + appName + ';' + message;//compress(message);
        let msg = facility + ';' + appName + ';' + message;//compress(message);

        //msg = compress(msg);
        //let bytes = compress(msg);
        //let bytes = compress (msg) + '\n';
        //let bytes = compressToUint8Array(msg);
        //let bytes2 = Buffer.from(bytes);

        // let bytes = compressToUint8Array(msg);
        // this.stream.write(bytes);
        let bytes = msg + '\n';

        let pos = this.logStream.bytesWritten;
        if(!pos) {
            this.test = bytes;
            BL.homey.log('bytes', bytes.length, bytes, decompress(bytes));
        }
        this.logStream.write(bytes, (error) => {
            if (error) defer.reject(new Error(error));
            defer.resolve();
        });
        let index = [bytes.length,timeNr,severity];
        this.indexStream.write(JSON.stringify(index).replaceAll('""', ''));
        if(this.index.length) index.unshift(this.index[this.index.length-1][0]+this.index[this.index.length-1][1]);
        else index.unshift(0);
        this.index.push(index);

        return defer.promise;

        // //this.stream.write(message);
        //this.stream.write('\n');

        //let bytes = compress(msg);
        //writeSync(this.stream, bytes);//, 0, bytes.length);

    }

    read(start, length) {
        let defer = new Defer();
        open(_file + '.log', 'r', (status, fd)=> {
            if (status) {
                console.log(status.message);
                return;
            }
            //size*=2;
            var buffer = Buffer.alloc(length);
            read(fd, buffer, 0, length, start, (err, num) => {
                //console.log(buffer.toString('utf8', 0, num));
                let s = buffer.toString('utf8');
                //let s1 = buffer.toString('utf16le');
                //let s2 = decompress(s1);

                //let ss = this.test==s;
                //console.log(decompress(s1));
                defer.resolve(s);
            });
        });
        return defer.promise;
    }
}

module.exports = { Log };