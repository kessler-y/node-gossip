var Gossiper = require('../lib/gossiper');

var seed = new Gossiper({ port: 9000,  seeds: [] });
seed.start();

var n = 0;
var gs = [];
var start_time = undefined;
var count = 100;
for(var i = 9001; i < 9001+count;i++) {
  var g = gs[i] = new Gossiper({ port: i,  seeds: ['127.0.0.1:9000'] });
  g.start();
  g.on('update', function(peer,k,v) {
    if(k == "hi") {
      console.log("hi received by " + this.peer_name + " at " + (new Date().getTime()));
      n++;
      if(n == count) {
        console.log("fully propogated");
        console.log("took " + (new Date().getTime() - start_time));
        process.exit();
      }
    }
  });
}

var g = new Gossiper({ port: 9999, seeds: ['127.0.0.1:9000'] });
g.start();

setTimeout(function() {
  console.log(seed.allPeers());
  // Set value for 'hi'
  g.setLocalState('hi', 'hello');
  start_time = new Date().getTime();
  console.log('hi sent ' + (new Date().getTime()));
}, 10000);
