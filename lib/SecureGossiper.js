var inherits = require('util').inherits
var Gossiper = require('../gossiper');

inherits(SecureGossiper, Gossiper)
function SecureGossiper(port, seeds, address, emitUpdateOnHeartBeat) {
	Gossiper.call(this, port, seeds, address, emitUpdateOnHeartBeat)
}
