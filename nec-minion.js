var _ = require('lodash');
var nec = require('./nec-lib');
var faye = require('faye');
client = new faye.Client('http://127.0.0.1:9292/faye');

var secret = 'lol';

client.addExtension({
  outgoing: function(message, callback) {
    message.ext = message.ext || {};
    message.ext.password = secret;
    callback(message);
  }
});

var inventory = [
 /* {name: 'test', addr: '127.0.0.2'} */
 ];

faye.logger = function (thing) {
  //console.log(thing);
};

var cmd_channel = client.subscribe('/tv/cnc', function(message) {
  console.log('--------------------------------------------------------------');
  console.dir(message);

  if(typeof message.cmd === 'undefined') return;

  switch(message.cmd) {
    case 'inventory': client.publish('/tv/reply', {cmd: message.cmd, payload: inventory}); break;
    case 'get': getsetparam(message.who, message.param); break;
    case 'set': getsetparam(message.who, message.param, message.value); break;
    default: return; break;
  }
});

var getsetparam = function(name, op, val) {
  var display = _.where(inventory, {name: name});
  
  if(display.length != 1) { console.error('display',name,'not found. ignoring.'); return; }
  display = display[0];

  op = nec.opcodes[op];
  if(typeof op === "undefined") { consoe.error('opcode',op,'not found. ignoring.'); return; }

  var getset = (typeof val === 'undefined') ? 'get' : 'set';
  var type = getset + 'param';
  nec.command(display.addr, type, op, val, function (data) {
    //res.json(data);
    client.publish('/tv/reply', {cmd: getset, who: name, payload: {param: op, value: data} } ); 
  });
  
};


console.log('== Started NEC Minion');
