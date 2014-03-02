var Scuttle = require('../lib/scuttle').Scuttle;
var PeerState = require('../lib/peer_state').PeerState;


module.exports = {
  // digest
  'digest should have max versions we have seen' : function(beforeExit, assert) {
    var p1 = new PeerState(1234);
    p1.max_version_seen = 10;
    var p2 = new PeerState(1235);
    p2.max_version_seen = 12;
    var p3 = new PeerState(1236);
    p3.max_version_seen = 22;

    var peers = {
      a : p1,
      b : p2,
      c : p3
    }

    var scuttle = new Scuttle(peers);

    var expected = {
      a: {
        maxVersionSeen: 10,
        metadata: undefined
      },
      b: {
        maxVersionSeen: 12,
        metadata: undefined
      },
      c: {
        maxVersionSeen: 22,
        metadata: undefined
      }
    };

    assert.deepEqual( expected,
                      scuttle.digest());
  },

  // scuttle
  // scuttle new peer
  'new peers should be in result' : function(beforeExit, assert) {
    var scuttle = new Scuttle({});
    var res = scuttle.scuttle( { 'new_peer' : { maxVersionSeen: 12 } } )
    assert.deepEqual( { 'new_peer': undefined }, res.new_peers);
  },
  'request all information about a new peer' : function(beforeExit, assert) {
    var scuttle = new Scuttle({});
    var res = scuttle.scuttle( { 'new_peer' : { maxVersionSeen: 12 } } )
    assert.deepEqual({ 'new_peer' : 0}, res.requests);
  },
  // scuttle deltas
  'send peer all deltas for peers we know more about' : function(beforeExit, assert) {
    var p1 = new PeerState(1234);
    p1.updateLocal('hi', 'hello');
    p1.updateLocal('meh', 'goodbye');
    var scuttle = new Scuttle({'me' : p1});
    var res = scuttle.scuttle( {'me' : { maxVersionSeen: 0 }, 'new_peer' : { maxVersionSeen: 12 } } )

    assert.deepEqual([['me', 'hi', 'hello', 1, undefined],
                      ['me', 'meh', 'goodbye', 2, undefined]],
                     res.deltas);
  }

  // deltas should be sorted by version number
  // deltas should be ordered by the peer with the most
}
