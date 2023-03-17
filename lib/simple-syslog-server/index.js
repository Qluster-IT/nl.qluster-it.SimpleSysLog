

/*
 * MIT License
 *
 * Copyright (c) 2019 Damien Clark (damo.clarky@gmail.com)
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
 * OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
 * OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF
 * OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

const dgram = require('dgram') ;
const debug = require('debug')('simple-syslog-server') ;
const util = require('util') ;
const ConnectionState = require('./ConnectionState') ;
const parser = require('./parser') ;
const validate = require('./validate') ;

const SERVICE = {
	'UDP': UDP,
	'TCP': TCP,
	'TLS': TLS
} ;

/**
 * Factory function to create instances of syslog servers
 * @param {(net|tls|dgram)} transport Server constructor
 * @param {object} [options={}] Options to pass to the syslog instance
 * @return {(UDP|TCP|TLS)}
 */
function factory(transport, options) {
	transport = transport.toUpperCase() ;
	if (transport in SERVICE)
		return SERVICE[transport].call(null, options) ;

	throw new Error('Transport not supported: ' + transport) ;
}

module.exports = factory ;

function noop() {
}


/**
 * @class
 * @classdesc Abstract class for all syslog servers
 * @constructor Abstract constructor for all syslog servers
 * @return {Transport}
 */
function Transport() {
}

/**
 * Register an event handler on the underlying server instance
 * @param {string} event event name
 * @param {function} cb callback function to call on event
 * @return {Transport}
 */
Transport.prototype.on = function(event, cb) {
	this.server.on(event, cb) ;
	return this ;
} ;

/**
 * Close the socket for this server
 * @return {Transport}
 */
Transport.prototype.close = function() {
	return new Promise((resolve, reject) => {
		this.server.close(err => {
			if(err) reject(err) ; else resolve() ;
		}) ;
	}) ;
} ;

/**
 * Start listening for messages
 * @param {Object} [options={}] Options to pass to the syslog instance
 * @abstract
 * @return {(UDP|TCP|TLS)}
 */
// eslint-disable-next-line no-unused-vars
Transport.prototype.listen = function(options) {
	throw new Error('must be implemented by subclass!') ;
} ;

/**
 * @class
 * @classdesc An instance of a UDP Syslog Server
 * @param {object} options Options to pass to the UDP Syslog Server
 * @param {string} options.type The UDP transport type ('udp4' or 'udp6')
 * @return {UDP}
 * @constructor
 */
function UDP(options) {
	if (!(this instanceof UDP))
		return new UDP(options) ;

	this.opt = options || { type: 'udp4' } ;

	this.server = dgram.createSocket(this.opt) ;
}

util.inherits(UDP, Transport) ;

/**
 * Listen to IP/port for messages
 * @override
 * @param {object} options Options for UDP.bind call
 * @param {port} options.port UDP port number
 * @param {string} options.address IP address or hostname to bind to
 * @param {boolean} options.exclusive Whether to share the socket with others
 * @return {Promise<dgram.Socket>}
 */
UDP.prototype.listen = function(options) {
	return new Promise((resolve, reject) => {
		let server = this.server ;
		options = options || { port: 514 } ; // default is 514
		if (options.host) {
			options.address = options.host ;
			delete options.host ;
		}
		this.transport = options ;

		if (this.port) {
			debug('server has binded to %s', this.port) ;
			return ;
		}
		debug('try bind to %s', options.port) ;
		resolve = resolve || noop ;
		this.port = options.port ;

		server
		.on('error', err => {
			debug('binding error: %o', err) ;
			reject(err) ;
		})
		.on('listening', () => {
			debug('binding ok') ;
			resolve(server) ;
		})
		.on('message', (msg, rinfo) => {
			try {
				let info = parser(msg, rinfo) ;
				if(validate(info))
					server.emit('msg', info) ;
				else
					server.emit('invalid', info) ;
			}
			catch (err) {
				server.emit('invalid', err) ;
			}
		})
		.bind(options) ;
	}) ;
} ;

/*
 * SOCK_STREAM service
 */
const net = require('net') ;
const tls = require('tls') ;

/**
 * @class
 * @classdesc An instance of a TCP Syslog Server
 * @param {object} options Options to pass to the TCP Syslog Server @see net.createServer
 * @return {TCP}
 * @constructor
 */
function TCP(options) {
	if(this instanceof TCP)
		StreamService.call(this, net, options) ;
	else
		return new TCP(options) ;
}

util.inherits(TCP, StreamService) ;

/**
 * @class
 * @classdesc An instance of a TLS Syslog Server
 * @param {object} options Options to pass to the TLS Syslog Server
 * @param {(string|string[]|Buffer|Buffer[])=} [options.ca] Optionally override the trusted CA certificates.
 * @param {(string|string[]|Buffer|Buffer[])} [options.cert] Cert chains in PEM format.
 * @param {(string|string[]|Buffer|Buffer[]|Object[])} [options.key] Private keys in PEM format.
 * @return {TLS}
 * @constructor
 */
function TLS(options) {
	if(this instanceof TLS)
		StreamService.call(this, tls, options) ;
	else
		return new TLS(options) ;
}

util.inherits(TLS, StreamService) ;

/**
 * @class
 * @classdesc An abstract class for streaming transports
 * @param {object} options Options to pass to the streaming transport
 * @return {(TCP|TLS)}
 * @constructor
 */
function StreamService(serviceModule, options) {
	this.opt = options || {} ;
	this.connections = {} ;

	this.server = serviceModule.createServer(this.opt, (connection) => {
		let client = connection.remoteAddress + ':' + connection.remotePort ;
		this.connections[client] = connection ;
		debug('New connection from ' + client) ;
		let state = new ConnectionState(this, connection) ;
		
		connection.on('data', (buffer) => {
			state.more_data(buffer) ;
		}) ;
		connection.on('end', () => {
			state.closed() ;
			delete this.connections[client] ;
		}) ;
	}) ;
	return this ;
}

util.inherits(StreamService, Transport) ;

/**
 * Listen to IP/port for connections
 * @override
 * @param {object} options Options for TCP/TLS.listen call
 * @return {(TCP|TLS)}
 * @return {Promise}
 */
StreamService.prototype.listen = function(options) {
	return new Promise((resolve, reject) => {
		let server = this.server ;
		resolve = resolve || noop ;
		options = options || { port: 514 } ; // default is 514
		if (options.address) {
			options.host = options.address ;
			delete options.address ;
		}
		this.transport = options ;
		this.port = options.port ;
		debug('Binding to ' + this.port) ;

		server
		.on('error', err => {
			debug('binding error: %o', err) ;
			reject(err) ;
		})
		.on('listening', () => {
			debug('tcp binding ok') ;
			this.transport.port = server.address().port ;
			this.port = server.address().port ;
			resolve(this) ;
		})
		.listen(options) ;
	}) ;
} ;

/**
 * Close the listening socket and all connected clients for this server
 * @override
 * @param {function} cb callback function when socket closed
 * @return {Transport}
 */
StreamService.prototype.close = function() {
	return new Promise((resolve, reject) => {
		Transport.prototype.close.call(this)
		.then(() => {
			this.connections = {} ;
			resolve() ;
		})
		.catch(err => {
			reject(err) ;
		}) ;
		for (let c in this.connections) {
			this.connections[c].destroy() ;
			delete this.connections[c] ;
		}
	}) ;
} ;



module.exports.UDP = UDP ;
module.exports.TCP = TCP ;
module.exports.TLS = TLS ;
