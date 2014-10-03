var qs = require('querystring');
var rels = require('./api_rels');
var EventEmitter = require('events').EventEmitter;

var util = require('util');
var ReadableStream = require('streams').Readable;

var VirtualStream = module.exports = function(topic, socket, options) {
  ReadableStream.call(this, options);
  this._topic = topic;
  this._socket = socket;
  this.listener = null;
};
util.inherits(VirtualStream, ReadableStream);

VirtualStream.prototype._read = function(size) {
  var self = this;
  
  if(!this.listener) {
    this.listener = function(topic, data) {
      if(!self.push(data)) {
        self._socket.unsubscribe(self._topic, self.listener);
        self.listener = null;
      }
    };
    this._socket.subscribe(this._topic);
    this._socket.on(this._topic, this.listener);
  }
};

var VirtualDevice = module.exports = function(entity, peerSocket) {
  var self = this;
  this._socket = peerSocket;
  this._update(entity);
  var logTopic = this._getTopic(this._getLinkWithTitle('logs'));

  this.streams = {};
  this._socket.subscribe(logTopic);
  this._socket.on(logTopic, function(topic, data) {
    self._update(data);
    self._eventEmitter.emit(data.transition);
  });

  var monitors = this._getLinksWithRel(rels.objectStream);
  monitors.forEach(function(monitor) {
    var topic = this._getTopic(monitor);
    self._socket.subscribe(topic);
    self._socket.on(topic, function(topic, data) {
      self[monitor.title] = data.data;
      self.streams[monitor.title] = new VirtualStream(topic, self._socket, { objectMode: true });
    });
  });

  this._eventEmitter = new EventEmitter();
  this.on = this._eventEmitter.on.bind(this._eventEmitter);
};

VirtualDevice.prototype.call = function(/* transition, args, cb */) {
  var args = Array.prototype.slice(arguments);
  var transition = args[0];
  var cb, transitionArgs;
  if(typeof args[args.length - 1] === 'function') {
    cb = args[args.length - 1];
    transitionArgs = args.slice(1, args.length - 1);
  } else {
    transitionArgs = args.slice(1, args.length);
    cb = function(err) {
      throw err;
    };
  }

  var action = this._getAction(transition);
  var actionArguments = this._encodeData(action, transitionArguments);

  if(action) {
    cb(new Error('Transition not available'));
    return;
  }

  this._socket.transition(action, actionArguments, function(err, body) {
    if(err) {
      cb(err);
    } else {
      this._update(body);
      cb();
    }
  });

};

VirtualDevice.prototype._encodeData = function(action, transitionArgs) {
  var actionArguments = {};
  action.fields.forEach(function(arg) {
    if(arg.type === 'hidden') {
      actionArguments[arg.name] = arg.value;
    } else if(transitionArgs.length) {
      actionArguments[arg.name] = transitionArgs.unshift();
    }
  });
    
  return actionArguments;
};

VirtualDevice.prototype._update = function(entity) {
  var self = this;
  Object.keys(entity.properties).forEach(function(prop) {
    self[prop] = entity.properties[prop];
  });
  this._actions = entity.actions;

  if(entity.links) {
    this._links = entity.links;
  }
};

VirtualDevice.prototype._getAction = function(name) {
  var returnAction;
  this._actions.some(function(action) { 
    if(action.name === name) {
      returnAction = action;
      return true;
    }
  });
  return returnAction;
};

VirtualDevice.prototype._getLinkWithTitle = function(title) {
  var returnLink;
  this._links.some(function(link) {
    if(link.title === title) {
      returnLink = link;
      return true;
    }
  });
  return returnLink;
};

VirtualDevice.prototype._getTopic = function(link) {
  var querystring = qs.parse(link.href, true);
  return querystring.query.topic;
};

VirtualDevice.prototype._getLinksWithRel = function(rel) {
  var returnLinks = this._links.filter(function(link) {
    return link.rel.indexOf(rel) !== -1;
  });
  return returnLinks;
};
