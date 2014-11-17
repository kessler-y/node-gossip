var assert = require('assert')
var SocketAdapter = require('../lib/SocketAdapter.js')
var ServerAdapter = require('../lib/ServerAdapter.js')
var should = require('should')

describe('Network adapters', function () {

	var SERVER_PORT = 4321

	var socket, server
	
	describe('ServerAdapter', function () {
		it('emits a connection event', function (done) {
			server.on('connection', function (s) {
				s.should.be.an.instanceof(SocketAdapter)
				done()
			})

			socket.connect(SERVER_PORT)
		})
	})

	describe('SocketAdapter', function () {
		it('connects to a server', function (done) {
			socket.once('connect', done)
			socket.connect(SERVER_PORT)
		})

		it('emits a data event', function (done) {
			server.on('connection', function (s) {
				s.send({ test: 123 })
			})

			socket.on('data', function (message) {
				message.should.eql({ test: 123 })
				done()
			})

			socket.connect(SERVER_PORT)
		})
	})

	beforeEach(function (done) {
		socket = new SocketAdapter()
		server = new ServerAdapter()
		server.once('listening', done)
		server.listen(SERVER_PORT)			
	})

	afterEach(function (done) {		
		server.once('close', done)
		socket.end()
		server.close()	
	})
})
