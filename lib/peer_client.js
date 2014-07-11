var EventEmitter = require('events').EventEmitter;
var path = require('path');
var util = require('util');

var Logger = require('./logger');
var WebSocket = require('./web_socket');

var l = Logger();
var RETRY_INTERVAL = 3000;
var RETRY_MAX = 9;

var PeerClient = module.exports = function(url, server) {
  this.url = url.replace(/^http/, 'ws') + '/peers/' + server.id;
  this.server = server.httpServer.spdyServer;

  this.connected = false;
  this.interval = null;
  this.retryCount = 0;

  EventEmitter.call(this);
};
util.inherits(PeerClient, EventEmitter);

PeerClient.prototype.start = function() {
  this._createSocket();
};

PeerClient.prototype._createSocket = function() {
  var self = this;

  var ws = new WebSocket(this.url);
  ws.on('open', function(socket) {
    self.connected = true;
    l.emit('log', 'peer-client', 'Peer connection established (' + self.url + ')');
    self.emit('connected');
    self.server.emit('connection', socket);
    // set up exchange of reactive queries.
  });

  ws.on('error', function(err) {
    self.connected = false;
    l.emit('log', 'peer-client', 'Peer connection error (' + self.url + '): ' + err);
    reconnect(err);
  });

  ws.on('close', function() {
    self.connected = false;
    l.emit('log', 'peer-client', 'Peer connection closed (' + self.url + ')');
    self.emit('closed', reconnect);
  });

  function reconnect(err) {

    if (self.interval) {
      clearInterval(self.interval);
    }

    if (self.retryCount >= RETRY_MAX) {
      l.emit('log', 'peer-client', 'Peer connection closed, retry limit reached (' + self.url + ')');
      return self.emit('error', err || new Error('Peer connection closed.'));
    }

    self.retryCount++;

    self.interval = setInterval(function() {
      if (self.connected) {
        clearInterval(self.interval);
      } else {
        self._createSocket(self.url, self.server);
      }
    }, RETRY_INTERVAL);
  };
};
