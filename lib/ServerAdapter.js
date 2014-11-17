var debug = require('debug')('grapevine_ServerAdapter');
var nssocket = require('nssocket')
var inherits = require('util').inherits
var inspect = require('util').inspect
var EventEmitter = require('events').EventEmitter
var SocketAdapter = require('./SocketAdapter')

module.exports = ServerAdapter

inherits(ServerAdapter, EventEmitter)
function ServerAdapter(options) {
	EventEmitter.call(this)
	
	options = options || {}

	var self = this

	this._server = nssocket.createServer(options, function(socket) {
		debug('incoming connection')
		var adapter = new SocketAdapter(undefined, socket)
		self.emit('connection', adapter)
	})

	// somewhat redundant...
	this._server.on('error', function(e) {
		if (debug.enabled) {
			debug('server error %s', inspect(e))
		}

		self.emit('error', e)
	})

	this._server.on('listening', function () {
		debug('server listening %s:%s', self.address, self.port)
		self.emit('listening')
	})

	this._server.on('close', function () {
		debug('server closed %s:%s', self.address, self.port)
		self.emit('close')
	})
}

ServerAdapter.prototype.listen = function(port, address) {
	if (!port) {
		throw new Error('must provide a port')
	}

	this.port = port
	this.address = address || '127.0.0.1'

	this._server.listen(port, address)
}

ServerAdapter.prototype.close = function() {
	debug('server closing %s:%s', this.address, this.port)
	this._server.close()
}
