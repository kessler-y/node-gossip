module.exports.Gossiper = require('./lib/gossiper')
module.exports.ServerAdapter = require('./lib/ServerAdapter')
module.exports.SocketAdapter = require('./lib/SocketAdapter')

module.exports.simpleSecureGossiper = function (options, callback) {
	var pem = require('pem')
	
	pem.createCertificate({
	    days: 1,
	    selfSigned: true
	}, function(err, keys) {
		if (err) return callback(err)

		options.secure = true
		options.type = 'tls'
		options.key = keys.serviceKey
		options.cert = keys.certificate
		options.rejectUnauthorized = false
            options.secureProtocol = 'TLSv1_method'

		var gossiper = new module.exports.Gossiper(options)

		callback(null, gossiper)
	})
}