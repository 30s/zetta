var EventEmitter = require('events').EventEmitter;
var ObjectStream = require('./data_stream');
var pubsub = require('./pubsub_service.js');
var Logger = require('./logger');
var uuid = require('node-uuid');
var l = Logger();


var Device = module.exports = function() {
  this.id = uuid.v4();
  this.transitions = {};
  this.allowed = {};
  this._devices = [];
  this.emitter = new EventEmitter();
  this.monitors = [];

  var self = this;

  this.on = function(type, handler) {
    self.emitter.on(type, handler);
  }.bind(this);

  this.properties = {};
  var reserved = ['properties', 'allowed', 'transitions', '_devices', 'streams'];

  this.update = function() {
    var properties = {};
    var self = this;
    Object.keys(self).forEach(function(key) {
      if (reserved.indexOf(key) === -1 && typeof self[key] !== 'function' && key[0] !== '_') {
        properties[key] = self[key];
      }
    });

    this.properties = properties;
  }.bind(this);

  this.update();

  // TODO: Namespace this as something weird so there's no accidental override.


  this.call = this.call.bind(this);
  this.emit = this.emitter.emit.bind(this.emitter);
  this.streams = {};
};

Device.prototype.stream = function(queueName, handler) {

  var queue = this.type + '/' + this.id + '/' + queueName;

  var dataStream = new ObjectStream(queue);
  this.streams[queueName] = dataStream;

  handler.call(this, dataStream);

  return this;
};

Device.prototype.map = function(type, handler, fields) {
  this.transitions[type] = { handler: handler, fields: fields };
  return this;
};

Device.prototype.devices = function(subdevices) {
  this._devices = this._devices.concat(subdevices);
  this._devices = this._devices;
  return this;
};

Device.prototype.when = function(state, options) {
  var allow = options.allow;
  if (!allow) {
    return this;
  }

  this.allowed[state] = allow;

  return this;
};

Device.prototype.call = function(/* type, ...args */) {
  var args = Array.prototype.slice.call(arguments);
  var type = args[0];
  var next = args[args.length-1];

  var rest = null;
  if(typeof next !== 'function') {
    next = function(err){};
    rest = args.slice(1, args.length);
  } else {
    rest = args.slice(1, args.length - 1);
  }

  var self = this;
  var cb = function callback() {

    self.update();

    var cbArgs = Array.prototype.slice.call(arguments);
    if (cbArgs.length && cbArgs[0] instanceof Error) {
      self.emitter.emit('error', cbArgs[0]);
    } else {
      cbArgs.unshift(type);
      self.emitter.emit.apply(self.emitter, cbArgs);
      var d = { name: self.name, transition: type, properties: self.properties };
      pubsub.publish(self.type + '/_transitions', d);
      l.emit('log', 'fog-runtime', 'MachineConfig ' + self.type + ' transititon ' + type, d);
    }

    next.apply(arguments);
  };
  var handlerArgs = rest.concat([cb]);

  if (this.transitions[type]) {
    if(this.transitions[type].handler === undefined){
      throw new Error('Machine does not implement transition '+type);
      return;
    }
    var state = self.properties.state;
    var allowed = this.allowed[state];
    if (allowed.indexOf(type) > -1) {
      this.transitions[type].handler.apply(this, handlerArgs);
    } else {
      throw new Error('Machine cannot use transition ' + type + ' while in ' + state);
    }
  }
};

Device.prototype.monitor = function(queueName) {
  var queue = this.type + '/' + this.id + '/' + queueName;

  var stream = new ObjectStream(queue);
  this.streams[queueName] = stream;
  this.monitors.push(stream);

  var self = this;

  Object.defineProperty(this, queueName, {
    get: function(){
      if(self.properties.hasOwnProperty(queueName)) {
        return self.properties[queueName];
      } else {
        return self[queueName];
      }
    },
    set: function(newValue){
      stream.write(newValue);
      self.properties[queueName] = newValue;
    }
  });

  return this;
};

Device.prototype.name = function(name) {
  this.name = name;
  this.update();
  return this;
};

Device.prototype.type = function(type) {
  this.type = type;
  this.update();
  return this;
};

Device.prototype.state = function(name) {
  this.state = name;
  this.update();
  return this;
};

Device.prototype.update = function() {
  var properties = {};
  var self = this;
  Object.keys(self).forEach(function(key) {
    if (reserved.indexOf(key) === -1 && typeof self[key] !== 'function' && key[0] !== '_') {
      properties[key] = self[key];
    }
  });

  this.properties = properties;
};
