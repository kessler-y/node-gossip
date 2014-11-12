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

	beforeEach(function(done) {
		this.timeout(beforeEachDelay + 1000)

		seed = new Gossiper(7000)
		g1 = new Gossiper(7001, ['127.0.0.1:7000'])
		g2 = new Gossiper(7002, ['127.0.0.1:7000'])

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
				seed.stop(callback)
			},
			function(callback) {
				g1.stop(callback)
			},
			function(callback) {
				g2.stop(callback)
			}
		], done)
	})
})
