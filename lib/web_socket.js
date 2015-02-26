var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var http = require('http');
var https = require('https');
var url = require('url');
var util = require('util');
var revolt = require('revolt');

var WebSocket = module.exports = function(address, httpOptions) {
  EventEmitter.call(this);

  if (address.substr(0, 2) === 'ws') {
    address = 'http' + address.substr(2);
  }

  var parsed = url.parse(address);
  var isSecure = parsed.protocol === 'https:' ? true : false;
  var httpObj = (isSecure) ? https : http;

  this.options = {
    uri: address,
    method: 'GET',
    headers: {
      'Connection': 'Upgrade',
      'Upgrade': 'websocket',
      'Host': parsed.host,
      'Sec-WebSocket-Version': '13',
    }
  };

  var self = this;
  if (httpOptions) {
    for (k in httpOptions) {
      self.options[k] = httpOptions[k];
    }
  }

  this.request = revolt();
    this.close = function() {
      this.emit('abort');
    };
};

util.inherits(WebSocket, EventEmitter);

WebSocket.prototype.close = function() {
  this.socket.removeListener('close', this.onClose);
  if(this.socket) {
    this.socket.end();   
    this.emit('close', null, null, true);
  } 
};

WebSocket.prototype.start = function() {
  var key = new Buffer('13' + '-' + Date.now()).toString('base64');
  var shasum = crypto.createHash('sha1');
  shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
  var expectedServerKey = shasum.digest('base64');

  this.options.headers['Sec-WebSocket-Key'] = key;

  var self = this;
  this.request
    .request(self.options)
    .subscribe(function(env) {
       self.on('abort', function() {
         env.request.abort();
       });

       var serverKey = env.response.headers['sec-websocket-accept'];
       if (typeof serverKey == 'undefined' || serverKey !== expectedServerKey) {
         self.emit('error', 'invalid server key');
         return;
       }

       self.onClose = function() {
         self.emit('close');
       };
       env.request.connection.on('close', self.onClose);

       self.emit('open', env.request.connection);
       self.socket = env.request.connection;
    }, function(err) {
      self.emit('error', err);
    });
};

WebSocket.prototype.close = function() {
  this.emit('abort');
};
