var PeerState = require('./peer_state');
var Scuttle = require('./scuttle');
var EventEmitter = require('events').EventEmitter;
var net = require('net');
var util = require('util');
var child_process = require('child_process');
var dns = require('dns');
var debug = require('debug')('grapevine_gossiper');
var nssocket = require('nssocket');

module.exports = Gossiper

function Gossiper(options) {
	EventEmitter.call(this);

	if (typeof options === 'number') {
		options = {
			port: options
		}
	}

	options = options || {}

	if (typeof options.port !== 'number')
		throw new Error('must specify a port');

	this.peers = {};
	this.address = options.address || '127.0.0.1';
	this.port = options.port;
	this.seeds = options.seeds || [];
	this.my_state = new PeerState(this.port, this.address);

	this.listenToExpiredKeys(this.my_state);

	this.beatHeart = true;
	this.emitUpdateOnHeartBeat = options.emitUpdateOnHeartBeat || false;
	this.scuttle = new Scuttle(this.peers);	
}

util.inherits(Gossiper, EventEmitter);

//TODO: why is this dynamic ?
Object.defineProperty(Gossiper.prototype, 'peer_name', {
	get: function() {
		if (net.isIPv6(this.address)) {
			return ['[' + this.address + ']', this.port.toString()].join(':');
		}
		return [this.address, this.port.toString()].join(':');
	},
	enumerable: true
});

Gossiper.prototype.start = function(callback) {

	var self = this;

	this.server = this._createServer();

	function start(err) {
		debug('%s started', self.peer_name);

		if (callback)
			callback(err, self)

		self.emit('started', self)
	}

	// Bind to ip/port
	if (this.address) {
		this.my_state.address = this.address;
		this.my_state.port = this.port;
		this.peers[this.peer_name] = this.my_state;
		this._listen(this.server, this.port, this.address, start);
	} else {
		// this is an ugly hack to get the hostname of the local machine
		// we don't listen on any ip because it's important that we listen
		// on the same ip that the server identifies itself as
		child_process.exec('hostname', function(error, stdout, stderr) {
			var l = stdout.length;
			var hostname = stdout.slice(0, l - 1);
			dns.lookup(hostname, 4, function(err, address, family) {
				self.address = address;
				self.my_state.address = self.address;
				self.my_state.port = self.port;
				self.peers[self.peer_name] = self.my_state;
				self._listen(this.server, self.port, address, start);
			});
		});
	}

	for (var i = 0; i < this.seeds.length; i++) {
		if (this.seeds[i] === this.peer_name)
			throw new Error('cannot specify self as seed')
	}

	// another ugly hack :(
	var seeds = {};

	for (var i = 0; i < this.seeds.length; i++)
		seeds[this.seeds[i]] = undefined;

	this.handleNewPeers(seeds);

	if (this.beatHeart) {
		this.heartBeatTimer = setInterval(function() {
			self.my_state.beatHeart()
		}, 1000);
	}

	this.gossipTimer = setInterval(function() {
		self.gossip()
	}, 1000);
}

Gossiper.prototype._createServer = function() {

	var self = this;
	var server = nssocket.createServer({}, function(socket) {

		socket.data(['msg'], function(msg) {
			self.handleMessage(socket, msg);
		});

		socket.on('error', function(e) {
			debug('%s => %s, error: %s', self.my_state.peer_name, util.inspect( socket.socket.address() ), e);
		})
	})

	return server;
}

Gossiper.prototype._listen = function(server, port, address, callback) {
	server.listen(port, address, callback)
}

Gossiper.prototype._closeServer = function(server, callback) {
	debug('shutting down server')
	server.close(function() {
		debug('close server')
		callback()
	})
}

Gossiper.prototype.stop = function(callback) {
	clearInterval(this.heartBeatTimer);
	clearInterval(this.gossipTimer);

	if (this.server) {
		this._closeServer(this.server, callback);
	} else {
		setImmediate(callback)
	}
}

// The method of choosing which peer(s) to gossip to is borrowed from Cassandra.
// They seemed to have worked out all of the edge cases
// http://wiki.apache.org/cassandra/ArchitectureGossip
Gossiper.prototype.gossip = function() {
	this.emit('gossip start');

	var now = Date.now();

	for (var p in this.peers)
		this.peers[p].expireLocalKeys(now);

	var livePeers = this.livePeers();

	// Find a live peer to gossip to
	var livePeer;

	if (livePeers.length > 0) {
		livePeer = this.chooseRandom(livePeers);
		this.gossipToPeer(livePeer);
	}

	var deadPeers = this.deadPeers();

	// Possilby gossip to a dead peer
	var prob = deadPeers.length / (livePeers.length + 1)
	if (Math.random() < prob) {
		var deadPeer = this.chooseRandom(deadPeers);
		this.gossipToPeer(deadPeer);
	}

	//TODO this following comment is from the original fork, i dont understand
	//why it says "gossip to seed" but chooses a peer from all the peers
	// Gossip to seed under certain conditions
	if (livePeer && !this.seeds[livePeer] && livePeers.length < this.seeds.length) {
		if (Math.random() < (this.seeds / this.peers.length)) {
			var p = this.chooseRandom(this.allPeers())
			this.gossipToPeer(p);
		}
	}

	// Check health of peers
	for (var i in this.peers) {
		var peer = this.peers[i];
		if (peer !== this.my_state) {
			peer.isSuspect();
		}
	}
}

Gossiper.prototype.chooseRandom = function(peers) {
	// Choose random peer to gossip to
	var i = Math.floor(Math.random() * 1000000) % peers.length;
	return this.peers[peers[i]];
}

Gossiper.prototype.gossipToPeer = function(peer) {

	if (debug.enabled) {
		debug('%s => %s', this.peer_name, peer.name)
	}

	var socket = new nssocket.NsSocket()

	//debug('%s ===> %s', this.my_state.port, peer.port)

	var self = this

	socket.data(['msg'], function(data) {
		self.handleMessage(socket, data)
	})

	socket.on('start', function() {
		self._send(socket, self.requestMessage())
	})

	socket.on('error', onError)

	socket.connect(peer.port, peer.address)

	function onError(error) {
		debug('%s => %s error: %s', socket.remoteAddress + socket.remotePort, error);
	}
}

Gossiper.REQUEST = 0;
Gossiper.FIRST_RESPONSE = 1;
Gossiper.SECOND_RESPONSE = 2;

Gossiper.prototype.handleMessage = function(socket, msg, fromPeer) {

	switch (msg.type) {
		case Gossiper.REQUEST:
			this._send(socket, this.firstResponseMessage(msg.digest));
			break;
		case Gossiper.FIRST_RESPONSE:
			this.scuttle.updateKnownState(msg.updates);
			this._send(socket, this.secondResponseMessage(msg.request_digest));
			this._disconnect(socket)
			break;
		case Gossiper.SECOND_RESPONSE:
			this.scuttle.updateKnownState(msg.updates);
			this._disconnect(socket)
			break;
		default:
			// something went bad
			break;
	}
}

// MESSSAGES
Gossiper.prototype.handleNewPeers = function(newPeers) {
	var self = this;
	for (var p in newPeers) {
		var peer_info;
		// TODO can this be done without regex?
		var m = p.match(/\[(.+)\]:([0-9]+)/);
		var address;
		var port;

		if (m) {
			address = m[1];
			port = m[2];
		} else {
			m = p.split(':');
			address = m[0];
			port = m[1];
		}

		var tp = new PeerState(parseInt(port), address);

		tp.metadata = newPeers[p]

		this.peers[tp.name] = tp;

		this.emit('new_peer', tp);

		this.listenToPeer(tp);
	}
}

Gossiper.prototype.listenToPeer = function(peer) {
	var self = this;

	if (peer.name === this.peer_name)
		throw new Error('cannot listen to itself')

	var peerName = peer.name;

	this.listenToExpiredKeys(peer)

	peer.on('update', function(k, v, expires) {

		if (k !== '__heartbeat__')
			self.emit('update', peerName, k, v, expires);
		else if (self.emitUpdateOnHeartBeat)
			self.emit('update', peerName, k, v, expires); // heartbeats are disabled by default but it can be changed so this takes care of that
	});

	peer.on('peer_alive', function() {
		self.emit('peer_alive', peerName);
	});

	peer.on('peer_failed', function() {
		self.emit('peer_failed', peerName);
	});
}

Gossiper.prototype.listenToExpiredKeys = function(peer) {

	var self = this;
	peer.on('expire', function(k, v, expires) {
		self.emit('expire', peer.name, k, v, expires);
	});
}

Gossiper.prototype.requestMessage = function() {
	var m = {
		type: Gossiper.REQUEST,
		digest: this.scuttle.digest()
	};
	return m;
};

Gossiper.prototype.firstResponseMessage = function(peer_digest) {
	var sc = this.scuttle.scuttle(peer_digest)

	this.handleNewPeers(sc.new_peers)

	var m = {
		type: Gossiper.FIRST_RESPONSE,
		request_digest: sc.requests,
		updates: sc.deltas
	};

	return m;
};

Gossiper.prototype.secondResponseMessage = function(requests) {
	var m = {
		type: Gossiper.SECOND_RESPONSE,
		updates: this.scuttle.fetchDeltas(requests)
	};
	return m;
};

Gossiper.prototype.setLocalState = function(k, v, expires) {
	this.my_state.updateLocal(k, v, expires);
}

Gossiper.prototype.getLocalState = function(k) {
	return this.my_state.getValue(k);
}

Gossiper.prototype.peerKeys = function(peer) {
	if (!peer) throw new Error('must specify a peer')
	return this.peers[peer].getKeys();
}

Gossiper.prototype.peerValue = function(peer, k) {
	if (!peer) throw new Error('must specify a peer')
	if (!k) throw new Error('must specify a key')

	return this.peers[peer].getValue(k);
}

Gossiper.prototype.allPeers = function() {
	var keys = [];
	for (var k in this.peers) {
		var peer = this.peers[k];
		if (peer !== this.my_state)
			keys.push(k)
	}
	return keys;
}

Gossiper.prototype.livePeers = function() {
	var keys = [];

	for (var k in this.peers) {
		var peer = this.peers[k];
		if (peer !== this.my_state && peer.alive) {
			keys.push(k)
		}
	}

	return keys;
}

Gossiper.prototype.deadPeers = function() {
	var keys = [];

	for (var k in this.peers) {
		var peer = this.peers[k];
		if (peer !== this.my_state && !peer.alive) {
			keys.push(k)
		}
	}

	return keys;
}
