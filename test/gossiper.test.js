var should = require('should')
var Gossiper = require('../lib/gossiper')
var PeerState = require('../lib/peer_state')
describe('gossiper', function() {
	var gossiper

	beforeEach(function(done) {
		gossiper = new Gossiper(1234)
		done()
	})

	afterEach(function(done) {
		gossiper.stop(done)
	})

	it('has local state', function() {
		gossiper.setLocalState('hi', 'hello')
		gossiper.getLocalState('hi').should.be.eql('hello')
	})

	it('contains a list of keys for each peer', function() {
		gossiper.peers.p1 = new PeerState(12345)
		gossiper.peers.p1.attrs['keyz'] = []
		gossiper.peers.p1.attrs['keyzy'] = []
		should(gossiper.peerKeys('p1')).eql(['keyz', 'keyzy'])
	})

	it('by default, it remembers values for keys in other peers', function() {
		gossiper.peers.p1 = new PeerState(12345)
		gossiper.peers.p1.attrs['keyz'] = ['hi', 1]
		gossiper.peerValue('p1', 'keyz').should.eql('hi')
	})

	it.skip('does not remember peer key values if told not to do so', function() {

	})

	it('maintains a list of peers', function() {
		gossiper.peers.p1 = new PeerState(12345)
		gossiper.peers.p2 = new PeerState(12346)
		should(gossiper.allPeers()).eql(['p1', 'p2'])
	})

	it('emits new_peer event when a new peer is discovered', function(done) {
		// mock scuttle
		gossiper.scuttle = {
			scuttle: function(v) {
				return {
					'new_peers': ['127.0.0.1:8010']
				}
			}
		}

		var emitted = false
		gossiper.on('new_peer', function(peer) {
			peer.metadata.should.be.eql('127.0.0.1:8010')
			done()
		})
		gossiper.firstResponseMessage({})
	})

	it('emits an update event when peer sends data', function(done) {
		gossiper.peers['127.0.0.1:8010'] = new PeerState(8010)
		gossiper.handleNewPeers({
			'127.0.0.1:8010': undefined
		})

		gossiper.on('update', function(peer, k, v, ttl) {
			peer.should.eql('127.0.0.1:8010')
			k.should.eql('howdy')
			v.should.eql('yall')
			should(ttl).be.undefined
			done()
		})

		gossiper.peers['127.0.0.1:8010'].updateLocal('howdy', 'yall')
	})

	it('new peers have metadata', function() {
		gossiper.peers['127.0.0.1:8010'] = new PeerState(8010)
		gossiper.handleNewPeers({
			'127.0.0.1:8010': {
				data: 1
			}
		})

		gossiper.peers['127.0.0.1:8010'].metadata.should.eql({ data: 1 })
	})
})
