var should = require('should')
var Gossiper = require('../lib/gossiper')

var async = require('async')

describe('gossiper real tests', function() {
	var beforeEachDelay = 5000
	var seed, g1, g2

	it('discovers new peers', function() {
		should(g1.allPeers()).eql(['127.0.0.1:7000', '127.0.0.1:7002'])
		should(g2.allPeers()).eql(['127.0.0.1:7000', '127.0.0.1:7001'])
		should(seed.allPeers()).eql(['127.0.0.1:7001', '127.0.0.1:7002'])			
	})

	it('propagates keys and values between peers', function(done) {
		this.timeout(4000)

		g1.setLocalState('x', 'y')

		setTimeout(function () {
			g2.peerValue('127.0.0.1:7001', 'x').should.eql('y')
			seed.peerValue('127.0.0.1:7001', 'x').should.eql('y')			
			done()
		}, 3000)
	})

	it('expires keys with ttl throughout the network', function (done) {
		this.timeout(7000)
		g1.setLocalState('x', 'y', Date.now() + 4000)

		var expiredEvents = 0

		g1.on('expire', function(peer, k, v, expire) {
			peer.should.be.eql('127.0.0.1:7001')
			k.should.be.eql('x')
			expiredEvents++
		})

		g2.on('expire', function(peer, k, v, expire) {
			peer.should.be.eql('127.0.0.1:7001')
			k.should.be.eql('x')
			expiredEvents++
		})

		seed.on('expire', function(peer, k, v, expire) {
			peer.should.be.eql('127.0.0.1:7001')
			k.should.be.eql('x')
			expiredEvents++
		})

		setTimeout(function () {
			g2.peerValue('127.0.0.1:7001', 'x').should.eql('y')
			seed.peerValue('127.0.0.1:7001', 'x').should.eql('y')			
			setTimeout(function () {
				g2.peerKeys('127.0.0.1:7001').should.not.containEql('x')
				seed.peerKeys('127.0.0.1:7001').should.not.containEql('x')
				expiredEvents.should.be.eql(3)
				done()
			}, 2000)
		}, 2500)
	})

	it.only('knows when peers die or come back alive', function (done) {
		this.timeout(125000)

		var g2Stopped = false
		var g2Started = false

		var peerFail = { g1: false, seed: false }
		var peerAlive = { g1: false, seed: false }
		
		g1.on('peer_failed', function(peer) {
			peer.should.be.eql('127.0.0.1:7002')
			peerFail.g1 = true
		})

		seed.on('peer_failed', function(peer) {
			peer.should.be.eql('127.0.0.1:7002')
			peerFail.seed = true
		})

		g1.on('peer_alive', function(peer) {
			peer.should.be.eql('127.0.0.1:7002')
			peerAlive.g1 = true
		})

		seed.on('peer_alive', function (peer) {
			peer.should.be.eql('127.0.0.1:7002')
			peerAlive.seed = true
		})

		g2.stop(function () {
			g2Stopped = true
		})

		// check for peer failed event after 35 seconds
		setTimeout(function () {
			g2Stopped.should.be.true
			peerFail.g1.should.be.true
			peerFail.seed.should.be.true

			g2.start(function () {
				g2Started = true
			})

			// check for peer alive event after 35 seconds
			setTimeout(function () {
				g2Started.should.be.true
				peerAlive.g1.should.be.true
				peerAlive.seed.should.be.true
				done()
			}, 35000)

		}, 35000)
	})

	beforeEach(function(done) {
		this.timeout(beforeEachDelay + 1000)

		seed = new Gossiper({ port: 7000 })
		g1 = new Gossiper({ port: 7001, seeds: ['127.0.0.1:7000'] })
		g2 = new Gossiper({ port: 7002, seeds: ['127.0.0.1:7000'] })

		async.parallel([
			function(callback) {
				seed.start(callback)
			},
			function(callback) {
				g1.start(callback)
			},
			function(callback) {
				g2.start(callback)
			}
		], function(err) {
			if (err) return done(err)
			setTimeout(done, beforeEachDelay)
		})
	})

	afterEach(function(done) {
		this.timeout(beforeEachDelay + 1000)

		async.parallel([
			function(callback) {
				if (seed.started) {
					seed.stop(callback)
				} else {
					callback()
				}
			},
			function(callback) {
				if (g1.started) {
					g1.stop(callback)
				} else {
					callback()
				}
			},
			function(callback) {
				if (g2.started) {
					g2.stop(callback)
				} else {
					callback()
				}
			}
		], done)
	})
})
