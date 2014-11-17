var debug = require('debug')('grapevine_SocketAdapter');
var nssocket = require('nssocket')
var inherits = require('util').inherits
var inspect = require('util').inspect
var EventEmitter = require('events').EventEmitter

module.exports = SocketAdapter

/*
  *	TODO: complete documentation
  *
  *	@class 
  */
inherits(SocketAdapter, EventEmitter)
function SocketAdapter(options, nsSocket) {
	EventEmitter.call(this)

	this.options = options
	this._nsSocket = nsSocket

	if (this._nsSocket) {
		this._hookEvents()
	}
}

SocketAdapter.prototype.connect = function(port, address) {
	if (this._nsSocket) {
		throw new Error('already connected')
	}

	if (!port) {
		throw new Error('must provide a port')
	}

	address = address || '127.0.0.1'

	this._nsSocket = new nssocket.NsSocket(this.options)
	this._hookEvents()
	debug('socket connecting to %s:%s', address, port)
	this._nsSocket.connect(port, address)
}

SocketAdapter.prototype._hookEvents = function () {
	var self = this
	
	this._nsSocket.data(['msg'], function (message) {
		self.emit('data', message, self)
	})

	this._nsSocket.on('start', function () {
		self.emit('connect')
	})

	this._nsSocket.on('close', function () {
		self.emit('close')
	})

	this._nsSocket.on('destroy', function () {
		self.emit('destroy')
	})

	this._nsSocket.on('error', function (e) {
		self.emit('error', e)
	})
}

SocketAdapter.prototype.send = function (message) {
	if (debug.enabled) {
		debug('sending message %s', inspect(message))
	}

	this._nsSocket.send(['msg'], message)
}

SocketAdapter.prototype.end = function () {
	if (this._nsSocket) {
		debug('socket closing')	
		this._nsSocket.end()
	}
}

SocketAdapter.prototype.destroy = function () {
	if (this._nsSocket) {
		debug('socket destroy')
		this._nsSocket.destroy()
	}
}
