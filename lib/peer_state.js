var AccrualFailureDetector  = require('./accrual_failure_detector');
var EventEmitter            = require('events').EventEmitter;
var util                    = require('util');
var net                     = require('net');
var debug                   = require('debug')('grapevine_PeerState')

module.exports = PeerState;

function PeerState(port, address) {
  EventEmitter.call(this);

  if (typeof port !== 'number' || port === 0)
    throw new Error('must specify a port');

  this.max_version_seen = 0;
  this.attrs            = {};
  this.detector         = new AccrualFailureDetector();
  this.alive            = true;
  this.heart_beat_version = 0;
  this.PHI              = 8;
  this.address          = address || '127.0.0.1';
  this.port             = port;
  this.minExpiresSeen       = Infinity;
};

util.inherits(PeerState, EventEmitter);

//TODO: why is this dynamic ?
Object.defineProperty(PeerState.prototype, 'name', {
  get: function() {
    if(net.isIPv6(this.address)) {
      return ['[' + this.address + ']', this.port.toString()].join(':');
    }
    return [this.address, this.port.toString()].join(':');
  }
  ,enumerable: true
});

PeerState.prototype.updateWithDelta = function(k, v, n, expires, now) {
  // It's possibly to get the same updates more than once if we're gossiping with multiple peers at once
  // ignore them, also ignore updates that have expired
  if(n > this.max_version_seen) {
    if (typeof(expires) === 'number' && expires < now) {
      return;
    }

    this.max_version_seen = n;
    this.setKey(k, v, n, expires);

    if(k == '__heartbeat__') {
      var d = new Date();
      this.detector.add(d.getTime());
    }
  }
}

/* This is used when the peerState is owned by this peer */
PeerState.prototype.updateLocal = function(k, v, expires) {
  this.max_version_seen += 1;
  this.setKey(k, v, this.max_version_seen, expires);
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

PeerState.prototype.setKey = function(k, v, n, expires) {
  // update min expires if needed
  if (typeof(expires) === 'number' && expires < this.minExpiresSeen) {
    debug('updating minExpiresSeen %s => %s', this.minExpiresSeen, expires)
    this.minExpiresSeen = expires
  }

  this.attrs[k] = [v, n, expires];
  this.emitUpdate(k, v, expires)
}

PeerState.prototype.emitUpdate = function(k, v, expires) {

  var self = this
  setImmediate(function () {
    self.emit('update', k, v, expires);
  })
}

PeerState.prototype.expireLocalKeys = function(now) {
  // nothing to do, next expire is still in the future
  if (now < this.minExpiresSeen)
    return;

  if (debug.enabled) {
    debug('%s expireLocalKeys()', this.name);
  }

  // else: now >= this.minExpiresSeen

  var minExpires = Infinity

  for (var k in this.attrs) {

    var entry = this.attrs[k];
    var expires = entry[2];

    if (typeof(expires) !== 'number') continue;

    if (expires <= now) {
      this.expireKey(k);

    // from all the non expiring keys, find the next min expires
    } else if (expires < minExpires) {
      minExpires = expires
    }
  }

  this.minExpiresSeen = minExpires
}

PeerState.prototype.expireKey = function(k) {

  var value = this.attrs[k][0]
  var expires = this.attrs[k][2]

  delete this.attrs[k]
  var self = this
  setImmediate(function () {
    if (debug.enabled)
      debug('%s: expiring %s', self.name, k)

    self.emit('expire', k, value, expires);
  })
}

PeerState.prototype.beatHeart = function() {
  this.heart_beat_version += 1;
  this.updateLocal('__heartbeat__', this.heart_beat_version);
}

PeerState.prototype.deltasAfterVersion = function(lowest_version) {
  var deltas = []

  for(k in this.attrs) {
    var value   = this.attrs[k][0];
    var version = this.attrs[k][1];
    var expires     = this.attrs[k][2];

    if(version > lowest_version) {
      deltas.push([k,value,version,expires]);
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
