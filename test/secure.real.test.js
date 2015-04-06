var grapevine = require('../index')

describe('secure communication', function () {

	var g1, g2

	it('updates', function (done) {
		this.timeout(5000)
	
		g2.on('update', function(peer, k, v, ttl) {
			console.log(k, v)
			done()
		})

		g1.on('new_peer', function (peer) {
			console.log('new peer: %s', peer)
		})

		g2.on('new_peer', function (peer) {
			console.log('new peer: %s', peer)
		})


		g1.setLocalState('a', 'b')
	})

	beforeEach(function (done) {
		this.timeout(6000)

		// EEK!
		grapevine.simpleSecureGossiper({ port: 5001, presharedKey: '123' }, function (err, _g1) {
			if (err) return done(err)			
			g1 = _g1
						
			g1.start(function (err) {
				if (err) return done(err)

				g1.server.on('connection', function (socket) {
					console.log(socket)
				})

				grapevine.simpleSecureGossiper({ port: 5002, presharedKey: '123', seeds: ['127.0.0.1:5001'] }, function (err, _g2) {
					if (err) return done(err)
					g2 = _g2

					g2.start(function(err) {
						if (err) return done(err)

						setTimeout(done, 5000)
					})
				})
			})			
		})
	})
})