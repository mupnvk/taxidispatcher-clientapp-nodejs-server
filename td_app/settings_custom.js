var config = {
		user: 'app_server',
		password: 'app_server',
		server: '192.168.1.90', // You can use 'localhost\\instance' to connect to named instance
		database: 'TD5R1',

		options: {
			encrypt: false // Use this if you're on Windows Azure
		}
	},
	port = 8081;

module.exports.config = config;
module.exports.port = port;
