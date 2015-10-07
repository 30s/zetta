var EventEmitter = require('events').EventEmitter;
var StreamTopic = require('./stream_topic');
var deviceFormatter = require('./api_formats/siren/device.siren');

var PubSub = module.exports = function() {
  this.emitter = new EventEmitter();
  this._listeners = {};
};

PubSub.prototype.publish = function(topic, data) {
  var x = decodeURIComponent(topic);
  this.emitter.emit(x, data);
  this.emitter.emit('_data', x, data);
};

PubSub.prototype.subscribe = function(topic, callback) {
  var self = this;
  if (typeof topic === 'string') {
    topic = StreamTopic.parse(topic);
  }
  
  var f = function(t, data) {
    if (topic.match(t)) {
      if (typeof callback === 'function') {
        self._onCallback(topic, data, callback);
      } else if (typeof callback === 'object') {
        self._onResponse(topic, data, callback);
      }
    }
  };

  this.emitter.on('_data', f);

  if (!this._listeners[topic.hash()]) {
    this._listeners[topic.hash()] = [];
  }

  this._listeners[topic.hash()].push({ listener: callback, actual: f });
};

PubSub.prototype.unsubscribe = function(topic, listener) {
  if (typeof topic === 'string') {
    topic = StreamTopic.parse(topic);
  }

  if (!this._listeners[topic.hash()]) {
    return;
  }

  var found = -1;
  this._listeners[topic.hash()].some(function(l, idx) {
    if (l.listener === listener) {
      found = idx;
      return true;
    }
  });

  if (found === -1) {
    return;
  }

  if (typeof listener === 'object') {
    listener.response.end(); // end response for push request
  }

  this.emitter.removeListener('_data', this._listeners[topic.hash()][found].actual);
  this._listeners[topic.hash()].splice(found, 1);

  if (this._listeners[topic.hash()].length === 0) {
    delete this._listeners[topic.hash()];
  }
};

PubSub.prototype._onCallback = function(topic, data, cb) {
  var self = this;
  cb(topic, data);
};

PubSub.prototype._onResponse = function(topic, data, env) {
  var self = this;
  var encoding = '';
  if(Buffer.isBuffer(data)) {
    encoding = 'application/octet-stream';
  } else if (data.query && data.device) {
    var serverId = env.route.params.serverId;
    var loader = { path: '/servers/' + encodeURIComponent(serverId) };
    data = deviceFormatter({ loader: loader, env: env, model: data.device });      
    data = new Buffer(JSON.stringify(data));
  } else if (typeof data == 'object') {
    encoding = 'application/json';
    try {
      data = new Buffer(JSON.stringify(data));
    } catch (err) {
      console.error(err, err.stack);
      return;
    }
  } else {
    console.error('PubSub._onResponse encoding not set.');
  }
  var stream = env.response.push('/' + topic.hash(), { 'Host': encodeURIComponent(serverId) + '.unreachable.zettajs.io',
                                                'Content-Length': data.length,
                                                'Content-Type': encoding
                                              });

  stream.on('error', function(err) {
    if (err.code === 'RST_STREAM' && err.status === 3) {
      stream.end();
    } else {
      console.error('PubSub._onCallback', err);
    }
  });

  stream.end(data);
};

