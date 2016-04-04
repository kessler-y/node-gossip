var Gossiper = require('../lib/gossiper');

var seed = new Gossiper({ port: 9000, seeds: [] });
seed.start();

var n = 0;
var gs = [];
var start_time = undefined;
var count = 100;
var setup_peer = function(this_peer) {
  this_peer.start();
  this_peer.on('peer_failed', function(peer) {
    console.log(this_peer.peer_name + " thinks " + peer + " is dead");
  });
  this_peer.on('peer_alive', function(peer) {
    console.log(this_peer.peer_name + " thinks " + peer + " is alive");
  });
}
for(var i = 9001; i < 9001+count;i++) {
  var g = gs[i] = new Gossiper({ port: i, seeds: ['127.0.0.1:9000'] });
  setup_peer(g);
}
// kill one of the nodes
setTimeout(function() {
  gs[9020].stop();
  setTimeout(function() { gs[9020].start() }, 30000);
}, 5000);
