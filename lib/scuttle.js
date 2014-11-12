var debug = require('debug')('grapevine_scuttle');

var PeerState = require('./peer_state');

module.exports = Scuttle;

function Scuttle (peers) {
  this.peers      = peers;
};

Scuttle.prototype.digest = function() {
  var digest = {};

  for(i in this.peers) {
    var p = this.peers[i];
    digest[i] = {
      maxVersionSeen: p.max_version_seen,
      metadata: p.metadata
    }
  }
  return digest;
}

// HEART OF THE BEAST

Scuttle.prototype.scuttle = function(digest) {
  var deltas_with_peer  = [];
  var requests          = {};
  var new_peers         = {};

  for(var peer in digest) {
    var localVersion   = this.maxVersionSeenForPeer(peer);
    var localPeer      = this.peers[peer];
    var digestVersion  = digest[peer].maxVersionSeen;

    if(!this.peers[peer]) {
      // We don't know about this peer. Request all information.
      requests[peer] = 0;
      new_peers[peer] = digest.metadata;
    } else if(localVersion > digestVersion) {
      // We have more recent information for this peer. Build up deltas.
      deltas_with_peer.push( { peer : peer, deltas :  localPeer.deltasAfterVersion(digestVersion) });
    } else if(localVersion < digestVersion) {
      // They have more recent information, request it.
      requests[peer] = localVersion;
    } else {
      // Everything is the same.
    }
  }

  // Sort by peers with most deltas
  deltas_with_peer.sort( function(a,b) { return b.deltas.length - a.deltas.length } );

  var deltas = [];
  for(var i = 0; i < deltas_with_peer.length; i++) {
    var peer = deltas_with_peer[i];
    var peer_deltas = peer.deltas;

    // Sort deltas by version number
    peer_deltas.sort(function(a,b) { return a[2] - b[2]; });

    if(peer_deltas.length > 1) {
      debug(peer_deltas);
    }

    //TODO: possible optimization: dont use unshift
    for(var j = 0; j < peer_deltas.length; j++) {
      var delta = peer_deltas[j];
      delta.unshift(peer.peer);
      deltas.push(delta);
    }
  }

  return {  'deltas' : deltas,
            'requests' : requests,
            'new_peers' : new_peers };
}

Scuttle.prototype.maxVersionSeenForPeer = function(peer) {
  if(this.peers[peer]) {
    return this.peers[peer].max_version_seen;
  } else {
    return 0;
  }
}

Scuttle.prototype.updateKnownState = function(deltas) {
  var now = Date.now();
  for(i in deltas) {
    var d = deltas[i];
    var peer_name  = d.shift();
    var peer_state = this.peers[peer_name];
    peer_state.updateWithDelta(d[0],d[1],d[2],d[3],now);
  }
};

Scuttle.prototype.fetchDeltas = function(requests) {
  var deltas = []
  for(i in requests) {
    var peer_deltas = this.peers[i].deltasAfterVersion(requests[i]);
    peer_deltas.sort(function(a,b) { return a[2] - b[2]; });
    for(var j = 0; j < peer_deltas.length; j++) {
      peer_deltas[j].unshift(i);
      deltas.push(peer_deltas[j]);
    }
  }
  return deltas;
}
