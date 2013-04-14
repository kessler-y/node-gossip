var PeerState     = require('./peer_state').PeerState,
    Scuttle       = require('./scuttle').Scuttle,
    EventEmitter  = require('events').EventEmitter,
    net           = require('net'), 
    util          = require('util'),
    child_process = require('child_process'),
    dns           = require('dns'),
    jot           = require('json-over-tcp'); 

var Gossiper = exports.Gossiper = function(port, seeds, address, opts) {

  opts = opts || {};
  opts.emitUpdateOnHeartBeat = opts.emitUpdateOnHeartBeat || false;
  opts.bind_address = opts.emitUpdateOnHeartBeat || address;

  EventEmitter.call(this);
  this.peers    = {};
  this.address  = address;
  this.bind_address = opts.bind_address;
  this.port     = port;
  this.seeds    = seeds;
  this.my_state = new PeerState();

  var self = this;
  this.my_state.on('expired', function(expired) {
    self.emit('expired', expired);
  });

  this.emitUpdateOnHeartBeat = emitUpdateOnHeartBeat || false;
  this.scuttle  = new Scuttle(this.peers);  
}

util.inherits(Gossiper, EventEmitter);

Object.defineProperty(Gossiper.prototype, "peer_name", {
  get: function() {
    if(net.isIPv6(this.address)) {
      return ['[' + this.address + ']', this.port.toString()].join(':');
    }
    return [this.address, this.port.toString()].join(':');
  }
  ,enumerable: true
});

Gossiper.prototype.start = function(callback) {
  var self = this;

  this.server = jot.createServer();
  this.server.on('connection', function (socket) {
    socket.on('data', function(msg) {   
      self.handleMessage(socket, msg);
    });
  });

  // Bind to ip/port
  if(this.address) {
    this.my_state.address = this.address;
    this.my_state.port = this.port;
    this.peers[this.peer_name] = this.my_state;
    this.server.listen(this.port, this.bind_address, callback);
  } else {
    // this is an ugly hack to get the hostname of the local machine
    // we don't listen on any ip because it's important that we listen 
    // on the same ip that the server identifies itself as
    child_process.exec('hostname', function(error, stdout, stderr) {
      var l = stdout.length;
      var hostname = stdout.slice(0, l - 1);
      dns.lookup(hostname, 4, function(err,address, family) {
        self.address = address;
        self.my_state.address = self.address;
        self.my_state.port = self.port;
        self.peers[self.peer_name] = self.my_state;
        self.server.listen(self.port, address, callback);
      });
    });
  }

  this.handleNewPeers(this.seeds);
  this.heartBeatTimer = setInterval(function() { self.my_state.beatHeart() }, 1000 );
  this.gossipTimer = setInterval(function() { self.gossip() }, 1000);
}

Gossiper.prototype.stop = function() {
  this.server.close();
  clearInterval(this.heartBeatTimer);
  clearInterval(this.gossipTimer);
}


// The method of choosing which peer(s) to gossip to is borrowed from Cassandra.
// They seemed to have worked out all of the edge cases
// http://wiki.apache.org/cassandra/ArchitectureGossip
Gossiper.prototype.gossip = function() {
  
  // Find a live peer to gossip to
  if(this.livePeers().length > 0) {
    var live_peer = this.chooseRandom(this.livePeers());
    this.gossipToPeer(live_peer);
  }

  // Possilby gossip to a dead peer
  var prob = this.deadPeers().length / (this.livePeers().length + 1)
  if(Math.random() < prob) {
    var dead_peer = this.chooseRandom(this.deadPeers());
    this.gossipToPeer(dead_peer);
  }

  // Gossip to seed under certain conditions
  if(live_peer && !this.seeds[live_peer] && this.livePeers().length < this.seeds.length) {
    if(Math.random() < (this.seeds / this.peers.length)) {
      this.gossipToPeer(this.chooseRandom(this.allPeers()));
    }
  }

  // Check health of peers
  for(var i in this.peers) {
    var peer = this.peers[i];
    if(peer != this.my_state) {
      peer.isSuspect();
    }
  }
}

Gossiper.prototype.chooseRandom = function(peers) {
  // Choose random peer to gossip to
  var i = Math.floor(Math.random()*1000000) % peers.length;
  return peers[i];
}

Gossiper.prototype.gossipToPeer = function(peer) {
  var a = this.peers[peer];
  var gosipeeSocket = new jot.createConnection(a.port, a.address);
  var self = this;
  gosipeeSocket.on('data', function(msg) { self.handleMessage(gosipeeSocket, msg) });
  gosipeeSocket.on('connect', function() { 
    gosipeeSocket.write(self.requestMessage());
  });
  
  gosipeeSocket.on('error', function(exception) {
    //console.log(self.peer_name + " received " + util.inspect(exception));
  });
}

Gossiper.REQUEST          = 0;
Gossiper.FIRST_RESPONSE   = 1;
Gossiper.SECOND_RESPONSE  = 2;

Gossiper.prototype.handleMessage = function(socket, msg) {
  
  switch(msg.type) {
    case Gossiper.REQUEST:
      socket.write(this.firstResponseMessage(msg.digest));
      break;
    case Gossiper.FIRST_RESPONSE:
      this.scuttle.updateKnownState(msg.updates);
      socket.write(this.secondResponseMessage(msg.request_digest));
      socket.end();
      break;
    case Gossiper.SECOND_RESPONSE:
      this.scuttle.updateKnownState(msg.updates);
      socket.end();
      break;
    default:    
      // shit went bad
      break;
  }
}

// MESSSAGES


Gossiper.prototype.handleNewPeers = function(new_peers) {
  var self = this;
  for(var i in new_peers) {
    var peer_info;
    var m = new_peers[i].match(/\[(.+)\]:([0-9]+)/);
    if(m) {            
      peer_info = {ip: m[1], port: m[2]};
    } else {
      m = new_peers[i].split(':');
      peer_info = {ip: m[0], port: m[1]};
    }
    var tp = new PeerState(peer_info.ip, peer_info.port);
    this.peers[tp.name] = tp;
    this.emit('new_peer', tp);
    
    this.listenToPeer(tp);
  }
}

Gossiper.prototype.listenToPeer = function(peer) {
  var self = this;

  peer.on('update', function(k,v,ttl) {
    
    if (k !== '__heartbeat__')
      self.emit('update', peer.name, k, v,ttl);
    else if (self.emitUpdateOnHeartBeat)    
      self.emit('update', peer.name, k, v,ttl); // heartbeats are disabled by default but it can be changed so this takes care of that
  });
  peer.on('peer_alive', function() {
    self.emit('peer_alive', peer);
  });
  peer.on('peer_failed', function() {
    self.emit('peer_failed', peer);
  });
}

Gossiper.prototype.requestMessage = function() {
  var m = {
    'type'    : Gossiper.REQUEST,
    'digest'  : this.scuttle.digest(),
  };
  return m;
};

Gossiper.prototype.firstResponseMessage = function(peer_digest) {
  var sc = this.scuttle.scuttle(peer_digest)  
  this.handleNewPeers(sc.new_peers);
  var m = {
    'type'            : Gossiper.FIRST_RESPONSE,
    'request_digest'  : sc.requests,
    'updates'         : sc.deltas
  };
  return m;
};

Gossiper.prototype.secondResponseMessage = function(requests) {
  var m = {
    'type'    : Gossiper.SECOND_RESPONSE,
    'updates' : this.scuttle.fetchDeltas(requests)
  };
  return m;
};

Gossiper.prototype.setLocalState = function(k, v, ttl) {
  this.my_state.updateLocal(k,v,ttl);
}

Gossiper.prototype.getLocalState = function(k) {
  return this.my_state.getValue(k);
}

Gossiper.prototype.peerKeys = function(peer) {
  return this.peers[peer].getKeys();
}

Gossiper.prototype.peerValue = function(peer, k) {
  return this.peers[peer].getValue(k);
}

Gossiper.prototype.allPeers = function() {
  var keys = [];
  for(var k in this.peers) { keys.push(k) };
  return keys;
}

Gossiper.prototype.livePeers = function() {
  var keys = [];
  for(var k in this.peers) { if(this.peers[k].alive) { keys.push(k)} };
  return keys;
}

Gossiper.prototype.deadPeers = function() {
  var keys = [];
  for(var k in this.peers) { if(!this.peers[k].alive) { keys.push(k) } };
  return keys;
}
