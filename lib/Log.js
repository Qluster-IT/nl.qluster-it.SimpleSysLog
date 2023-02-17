const { createWriteStream } = require("fs");


class Log {
    
    constructor({filePath}) {
        this.stream = createWriteStream(filePath + 'log.jsons', {flags:'a+', autoClose:true, });
        
        console.log(new Date().toISOString());
        [...Array(10000)].forEach( (item,index) => {
            this.writeLine({index, a:'\r\nasdsad\asd'});
            //this.stream.
        });
        console.log(new Date().toISOString());
        this.stream.end();
    }

    writeLine(obj) {
        if(this.stream) this.stream.write(JSON.stringify(obj) + '\n');
    }
}


module.exports = { Log };