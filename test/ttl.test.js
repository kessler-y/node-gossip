var Gossiper = require('../lib/gossiper').Gossiper;

function listenToGossip(gossiper, listenCount, cb) {

	var listener = function(peer, k, v, ttl) {
		
		if (listenCount > -1 && --listenCount === 0) {
			console.log('removing listener');
			gossiper.removeListener('update', listener);			
		}

		gossiper.setLocalState(k, v, ttl);

		if (cb) cb(peer, k, v, ttl);
	}

	gossiper.on('update', listener);
}

module.exports = {
	'ttl should propagate to other peers and get expired throughout the net': function(beforeExit, assert) {
		var seed = new Gossiper(7000, [], '127.0.0.1');			
		var g1 = new Gossiper(7001, ['127.0.0.1:7000'], '127.0.0.1');			
		var g2 = new Gossiper(7002, ['127.0.0.1:7000'], '127.0.0.1');
		var testTTL = Date.now() + 8000;

		seed.start(function() {				
			console.log('seed started');
			g1.start(function() {
				console.log('g1 started');
				g2.start(function() {
					console.log('g2 started');
					g2.setLocalState('x', 2512, testTTL);					
					
					listenToGossip(g1, 1);
					listenToGossip(g2, 1);
					listenToGossip(seed, 1);

					console.log('waiting 3 seconds for data to propagated');
					setTimeout(goPhase1, 5000);
				});					
			});
		});

		function goPhase1() {

			console.log('phase 1 ready, checking state');

			var now = Date.now();

			assert.ok(testTTL > now, 'ttl should be greater than current now');
			
			assert.ok('x' in g2.my_state.attrs, 'g2 didnt include x');
			assert.strictEqual(testTTL, g2.my_state.attrs['x'][2]);

			assert.ok('x' in g1.my_state.attrs, 'g1 didnt include x');
			assert.strictEqual(testTTL, g1.my_state.attrs['x'][2]);

			assert.ok('x' in seed.my_state.attrs, 'seed didnt include x');
			assert.strictEqual(testTTL, seed.my_state.attrs['x'][2]);

			console.log('state and ttl was ok');
			goPhase2();			
		}

		function goPhase2() {			
			console.log('waiting for keys to expire');
			setTimeout(function() {
					
				assert.ok(!('x' in g2.my_state.attrs), 'g2 include x when it shouldnt');
				
				assert.ok(!('x' in g1.my_state.attrs), 'g1 include x when it shouldnt');
				
				assert.ok(!('x' in seed.my_state.attrs), 'seed include x when it shouldnt');				

				console.log('waiting 10 more seconds to check if "x" was removed from peer mirrored state in other peers');
				setTimeout(function() {

					function checkPeerMirroredState(peer) {
						for (var p in peer.peers)
							assert.ok(!('x' in g1.peers[p].attrs), 'peer ' + p + ' mirrored state in ' + peer.peer_name + ' should not have included key X by now');

						console.log(peer.peer_name + ' was checked and found clean');
					}

					checkPeerMirroredState(g1);
					checkPeerMirroredState(g2);
					checkPeerMirroredState(seed);

					g1.stop();
					g2.stop();
					seed.stop();

				}, 10000);
			}, 10000);
		}
	}
}