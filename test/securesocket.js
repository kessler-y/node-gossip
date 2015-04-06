var nssocket = require('nssocket')
var pem = require('pem')
var emitterSniffer = require('emitter-sniffer')

pem.createCertificate({
	days: 100,
	selfSigned: true
}, function(err, keys) {
	
	var options = {}
	//options.secure = true
	options.type = 'tls'
	options.key = keys.serviceKey
	options.cert = keys.certificate
	options.ca = keys.certificate
	options.requestCert = true
	//options.rejectUnauthorized = false
      //options.secureProtocol = 'TLSv1_method'

	var server = nssocket.createServer(options, function(socket) {
		console.log('incoming connection')
		// socket.data(['msg'], function (msg) {
		// 	console.log(msg)
		// })

		// socket.on('error', function (e) {
		// 	console.log(e)
		// })

		socket.send(['server'], { x: 2 })
		socket.on('data', function (d) {
			console.log(d)
		})
		setTimeout(function () {
			console.log('closing')
			socket.end()
		}, 5000)
	})

	server.on('secureConnection', function (secureSocket) {
		console.log('secure connection: ' + secureSocket.authorized)
		
		secureSocket.on('data', function (msg) {
			console.log(msg)
		})
	})

	server.on('clientError', function (e) {
		console.log(e)
	})

	server.on('listening', function () {
		console.log('listening')	
		var socket = new nssocket.NsSocket({ type: 'tls', ca: keys.certificate, key: keys.clientKey, cert:keys.certificate })
		
		socket.on('error', function (e) {
			console.log(e)
		})

		socket.on('start', function () {
			console.log('socket connected')			
		})

		socket.on('close', function () {
			console.log('socket close')
			server.close()
		})

		socket.data(['server'], function(msg) {
			console.log('message from server: ', msg)
				
		})

		socket.connect(2000)
	})

	server.listen(2000)
})
