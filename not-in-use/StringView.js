//https://eytanmanor.medium.com/how-to-hold-strings-by-reference-in-javascript-9ef0de2ff08f
class StringView {
    constructor(buffer, start = 0, length = undefined) {
        //this.view = new Uint16Array(buffer, start * 2, length);
        this.view = new Uint8Array(buffer, start, length);
        this.buffer = buffer;
        this.start = start || 0;
        this.length = length || 0;
    }

    set(string) {
        for (let i = 0; i < this.view.length; i++) {
            this.view[i] = string.charCodeAt(i) || 0x0000;
        }

        return this;
    }

    toString() {
        //Buffer.from(this.buffer, this.start, length);
        return String.fromCharCode(...this.view);
    }
    getColumns() {
        return this.split(';');
    }
    split(char) {
        let columns = [];
        let index, current = this.start;
        while ((index = this.view.indexOf(char.charCodeAt(0), current)) > -1 && index < this.start + this.length) {
            columns.push(new StringView(this.buffer, this.start + current, index - current));
            //columns.push(new StringView(this.buffer, this.start + current, this.start + index));
            current = index + 1;
        }
        columns.push(new StringView(this.buffer, this.start + current, this.length));
        return columns;
    }
}

class StringBuffer {
    constructor(string) {
        if (string instanceof Buffer) this.buffer = string;
        else if (string instanceof ArrayBuffer) this.buffer = string;
        else {
            this.buffer = new ArrayBuffer(string.length * 2);
            this.getView().set(string);
        }
    }

    getView(start, length) {
        return new StringView(this.buffer, start, length);
    }

    toString() {
        return this.getView().toString();
    }
    getlines() {
        return this.split('\n');
    }
    split(char) {
        let lines = [];
        let t = new Uint8Array(this.buffer, this.buffer.length * 2, undefined);
        let index, current = 0;
        while ((index = t.indexOf(char.charCodeAt(0), current)) > -1) {
            lines.push(new StringView(this.buffer, current, index - current));
            current = index + 1;
        }
        //lines.push(new StringView(this.buffer, current));
        return lines;
    }
}

module.exports = { StringBuffer };