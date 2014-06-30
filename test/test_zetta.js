var assert = require('assert');

var zetta = require('../zetta');
var Registry = require('./fixture/scout_test_mocks').MockRegistry;

describe('Zetta', function() {
  
  var reg = null;
  beforeEach(function() {
    reg = new Registry();
  });
  
  it('should be attached to the zetta as a function', function() {
    assert.equal(typeof zetta, 'function');
  });


  it('basic zetta server functionality should not break', function() {
    zetta({registry: reg})
      .name('local')
      .expose('*')
      .load(function(server) {})
      .listen(3000, function(err){
      });
  });

  it('has the name set using the name() function.', function() {
    var z = zetta({registry: reg}).name('local');

    assert.equal(z._name, 'local');
  });

  it('will load an app with the load() function', function() {
    zetta({registry: reg})
      .load(function(server) {
        assert.ok(server);
        done();
      });
  });

  it('will load a scout with the use() function', function() {
    var z = zetta({registry: reg});
    function TestScout(){}
    TestScout.prototype.init = function(){ 
      assert.equal(z._scouts.length, 1);
      assert.equal(this.server, z.runtime);
      done(); 
    };
  });

  it('will set the what query is used for expose()', function() {
    var z = zetta({registry: reg});
    z.expose('*');

    assert.ok(z._exposeQuery);
  });

  it('will call init on the server prototype to ensure everything is wired up correctly.', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function() {
      done();
    };
    MockHttp.prototype.listen = function(port) {};

    var z = zetta({registry: reg});
    z.httpServer = new MockHttp();
    z.listen(3000);

  });

  it('will apply arguments to httpServer when listen() is called', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function(){};
    MockHttp.prototype.listen = function(port) {
      assert.equal(port, 3000);
      done();
    };

    var z = zetta({registry: reg});
    z.httpServer = new MockHttp();
    z.listen(3000);

  });

  it('will correctly apply the callback to httpServer when listen() is called', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function(){};
    MockHttp.prototype.listen = function(port, cb) {
      assert.equal(port, 3000);
      cb(null);
    };

    var z = zetta({registry: reg});
    z.httpServer = new MockHttp();
    z.listen(3000, function(err) {
      assert.ok(!err);
      done();
    });
  });

});
