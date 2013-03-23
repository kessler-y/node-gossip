var AccrualFailureDetector  = require('./accrual_failure_detector').AccrualFailureDetector,
    EventEmitter            = require('events').EventEmitter,
    util                    = require('util'); 

var PeerState = exports.PeerState = function(name) {
  EventEmitter.call(this);
  this.max_version_seen = 0;
  this.attrs            = {};
  this.detector         = new AccrualFailureDetector();
  this.alive            = true;
  this.heart_beat_version = 0;
  this.PHI              = 8;
  this.name             = name;
};

util.inherits(PeerState, EventEmitter);

PeerState.prototype.updateWithDelta = function(k,v,n,ttl,now) {
  // It's possibly to get the same updates more than once if we're gossiping with multiple peers at once
  // ignore them, also ignore updates that have expired
  if(n > this.max_version_seen) {
    if (ttl !== null && ttl < now) {
      return;
    }

    this.max_version_seen = n;
    //console.log(this.name, k, ttl, '1');
    this.setKey(k,v,n,ttl);
    if(k == '__heartbeat__') {
      var d = new Date();
      this.detector.add(d.getTime());
    }
  }
}

/* This is used when the peerState is owned by this peer */

PeerState.prototype.updateLocal = function(k,v,ttl) {
  this.max_version_seen += 1;  
  this.setKey(k,v,this.max_version_seen,ttl);
}

PeerState.prototype.getValue = function(k) {
  if(this.attrs[k] == undefined) {
    return undefined;
  } else {
    return this.attrs[k][0];
  }
}

PeerState.prototype.getKeys = function() {
  var keys = [];
  for(k in this.attrs) { keys.push(k) };
  return keys;
}

PeerState.prototype.setKey = function(k,v,n,ttl) {

  if (typeof(ttl) === 'undefined') ttl = null;
  
  this.attrs[k] = [v,n,ttl];
  this.emit('update', k, v, ttl);
}

PeerState.prototype.beatHeart = function() {
  this.heart_beat_version += 1;
  this.updateLocal('__heartbeat__', this.heart_beat_version);
}

PeerState.prototype.deltasAfterVersion = function(lowest_version) {
  deltas = []
  var now = Date.now();
  for(k in this.attrs) {
    var value   = this.attrs[k][0];
    var version = this.attrs[k][1];
    var ttl     = this.attrs[k][2];

    //console.log(this.name, k, this.attrs[k]);
    // expired keys are deleted locally, but we still want to send them
    if (ttl !== null && ttl < now) {
      //console.log(this.name, k + ' is expired', value, ttl, now, ttl < now);
      delete this.attrs[k];      
    }

    if(version > lowest_version) {
      deltas.push([k,value,version,ttl]);
    }
  }
  return deltas;
}

PeerState.prototype.isSuspect = function() {
  var d = new Date();
  var phi = this.detector.phi(d.getTime());
  if(phi > this.PHI) {
    this.markDead();
    return true;
  } else {
    this.markAlive();
    return false;
  }
}

PeerState.prototype.markAlive = function() {
  if(!this.alive) {
    this.alive = true;
    this.emit('peer_alive');
  }
}

PeerState.prototype.markDead = function() {
  if(this.alive) {
    this.alive = false;
    this.emit('peer_failed');
  }
}
