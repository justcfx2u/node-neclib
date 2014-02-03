var net = require('net');
var events = require('events');
var ConnectionPool = require('jackpot');

var pool = {};
var cts = {};

var command = function(host, type, operation, value, callback) {
  console.log('== nec-lib command(' + host + ',',type,',',operation,',',value,',',callback);
  if(typeof value === 'function' && typeof callback === 'undefined') { callback = value; value = null; }
  if(typeof callback !== 'function') { return; }
  if(typeof pool[host] === 'undefined') {
    pool[host] = new ConnectionPool(1, function () { /* console.log('factory:', host); */ return net.connect(7142, host); });
    pool[host].on('error', function (thing) {
      callback({error: thing});
    });

    cts[host] = true;
  }

  console.log('client data listeners (' + host + ') was at:',client.listeners('data').length);
  pool[host].pull(function (err, client) {
    if(err) { console.log('== Connection pool error for host', host, ':', err); callback({error: err}); return; }
    var host = client.remoteAddress;
    console.log('# Connected to', host);

    if(client.listeners('data').length === 0) {
      client.on('data', function(data) {
        // console.log('');
        // console.log('');

        console.log('============================= Reply from Monitor ======(', host, ')======');
        // console.log('');

        //console.dir(data);
        info = parseHeader(data);
        if(info.valid === false) {
          console.log("<< Received INVALID header:");
          console.dir(info);
          if(typeof callback === 'function') { console.log('-> callback'); callback({error: true, data: {host: host, message: 'received INVALID header from host'}}); }
          return;
        }

        // console.log("- Validated Header");
        // console.log('  Message from device',info.source_ascii,'(0x' + info.source_hex + ')');
        // console.log('  of type:', info.msgType);
        // console.log('  payload:', info.length, 'bytes');

        //client.end();
        var result = decode[info.msgType](info, data);
        if(typeof result === 'undefined') { console.log('wtf'); result = {}; }
        result.remoteAddress = client.remoteAddress;
        console.dir(result);
        if(typeof callback === 'function') callback(result);
      });

    }
    console.log('client data listeners (' + host + ') is at:',client.listeners('data').length);


    sendCommand(client, type, operation, value, callback);
  });
};

var doError = function (info, thing) {
  info.ok = false;
  info.error = thing;
  console.error(thing);
};

var decode = {
  getparamreply: function (info, data) {
    console.log('== getparamreply/setparamreply');
    info.ok = true;
    if(data[7] != 0x02) { doError(info, '==Bad message start in getparamreply. ' + data); } // 1: STX
    info.result = asciiHiLo2byte([data[8],data[9]]);                              // 2&3: Result (Hi/Lo)
    if(info.result === 1) { doError(info, '== ERROR: Display indicated error reading parameter. (Is it turned on?)'); } 
    //if(info.result === 0) { info.ok = true; }
    info.opCodePage = asciiHiLo2byte([data[10],data[11]]);                        // 4&5: opCodePage
    info.opCode = asciiHiLo2byte([data[12],data[13]]);                            // 6&7: opCode
    info.type = asciiHiLo2byte([data[14],data[15]]);                              // 8&9: Message Type
    info.max_value = asciiHiLo2byte([data[16],data[17],data[18],data[19]]);       // 10,11,12,13: max_value (16 bits) MSB -> LSB
    info.value = asciiHiLo2byte([data[20],data[21],data[22],data[23]]);           // 14,15,16,17: value (16 bits) MSB -> LSB (current value if getparamreply, requested value if setparamreply)
    if(data[24] != 0x03) { doError(info, 'Bad message end in getparamreply.', data); } // 18: ETX
    var chk = createCheckCode(data.slice(0, data.length-2));                      // 19: checksum
    if(new Buffer([data[25]]).toString() !== chk.toString()) { doError(info, 'Bad message checksum. (expecting: ' + parseInt(chk.toString('hex'),16) + ', got: ' + data[25].toString(16) + ').', data); }
    if(data[26] != 0x0d) { doError(info, 'Bad message footer. (' + data[26].toString(16) + ').'); }

    // console.log('');
    // console.log("Interpreted reply:");
    // console.dir(info);

    // console.log('')
    // console.log('Summary:');
    console.log(" -- ", optable[info.opCodePage][info.opCode], 'is', info.value);
    // console.log('');
    return info;
  }
};

// alias function
decode.setparamreply = decode.getparamreply;

var parseHeader = function (hdr) {
  var reply = {valid: false};
  if(hdr[0] != 0x01) return reply; // SOH
  if(hdr[1] != 0x30) return reply; // ASCII '0', Reserved
  if(hdr[2] != 0x30) return reply; // Destination. Isn't ASCII 0 (to 'Controller')
  reply.source_hex = hdr[3].toString(16); // Source: Monitor ID.
  reply.source_ascii = new Buffer([hdr[3]]).toString('ascii'); // Source: Monitor ID.

  // just checking for validity of Message Type...
  switch(hdr[4]) {
    case 0x41: reply.msgType = 'command'; break;
    case 0x42: reply.msgType = 'commandreply'; break;
    case 0x43: reply.msgType = 'getparam'; break;
    case 0x44: reply.msgType = 'getparamreply'; break;
    case 0x45: reply.msgType = 'setparam'; break;
    case 0x46: reply.msgType = 'setparamreply'; break;
    default: return reply;
  }

  reply.length = asciiHiLo2byte([hdr[5],hdr[6]]);
  reply.valid = true;

  return reply;
};

var asciiHiLo2byte = function (val) {
  return parseInt(new Buffer((val)).toString('ascii'), 16);
};

var byte2asciiHiLo = function (val) {
  var tmp = new Buffer((val).toString(16),'ascii');
  if(tmp.length == 1) return new Buffer.concat([new Buffer([0x30]), tmp]);

  return tmp;
}

var val2fourByteBuffer = function (val) {
  buf = new Buffer(2);
  buf.writeUInt16BE(val,0);
  return new Buffer.concat(buf.toString('hex').split('').map(function (byte) { return new Buffer(byte,'ascii') }));
};

var createHeader = function (msgType, len) {
  var buf = new Buffer(7);
  buf.writeUInt8(0x01,0); // 1: SOH
  buf.writeUInt8(0x30,1); // 2: Reserved
  buf.writeUInt8(0x41,2); // 3: Destination: 1st monitor (none of ours are daisy-chained)
  buf.writeUInt8(0x30,3); // 4: Source: 0x30 for controller, else Monitor's ID byte (when recv. from monitor)
  
  switch(msgType) {       // 5: Message Type
    case 'command': buf.writeUInt8(0x41,4); break;
    case 'commandreply': buf.writeUInt8(0x42,4); break;
    case 'getparam': buf.writeUInt8(0x43,4); break;
    case 'getparamreply': buf.writeUInt8(0x44,4); break;
    case 'setparam': buf.writeUInt8(0x45,4); break;
    case 'setparamreply': buf.writeUInt8(0x46,4); break;
    default: throw Error("Invalid msgType in createHeader:",msgType); break;
  }

  byte2asciiHiLo(len).copy(buf, 5, 0, 2);
  return buf;
};

var opcodes = {
  volume: [0x00, 0x62]
};

// lookup table (opCodePage, opCode); optable[0x00][0x62] === 'volume'
var optable = {
  0x00: {
    0x62: 'volume'
  }
};

var createGetParamMessage = function (opCode) {
  console.log('== createGetParamMessage',opCode);
  var page = opCode[0];
  var code = opCode[1];

  var buf = new Buffer(6);
  buf.writeUInt8(0x02,0);                  // 1: STX (ASCII Start Message)
  byte2asciiHiLo(page).copy(buf, 1, 0, 2); // 2 & 3: Hi nibble as ascii, Lo nibble as ascii (opCodePage)
  byte2asciiHiLo(code).copy(buf, 3, 0, 2); // 4 & 5: Hi nibble as ascii, Lo nibble as ascii (opCode)
  buf.writeUInt8(0x03,5);                  // 6: ETX (ASCII End Message)

  //console.dir(buf);
  return buf;
};

var createSetParamMessage = function (opCode,val) {
  console.log('== createSetParamMessage',opCode,val);
  var page = opCode[0];
  var code = opCode[1];

  var buf = new Buffer(10);
  buf.writeUInt8(0x02,0);                      // 1: STX (ASCII Start Message)
  byte2asciiHiLo(page).copy(buf, 1, 0, 2);     // 2 & 3: Hi nibble as ascii, Lo nibble as ascii (opCodePage)
  byte2asciiHiLo(code).copy(buf, 3, 0, 2);     // 4 & 5: Hi nibble as ascii, Lo nibble as ascii (opCode)
  val2fourByteBuffer(val).copy(buf, 5, 0, 4);  // 6,7,8,9: 16-bit UInt, MSB .. LSB 4-byte nybbles as ascii (value to set)
  buf.writeUInt8(0x03,9);                      // 6: ETX (ASCII End Message)

  //console.dir(buf);
  return buf;
};

var sendCommand = function (client, msgType, opcode, value, callback) {
  var host = client.remoteAddress;
  if(typeof value === 'undefined') { value = ''; }
  console.log("+++ Dispatch command:", msgType, optable[opcode[0]][opcode[1]], value);
  if(typeof client.remoteAddress !== 'undefined' && cts[host] === false) { 
  //  console.log("!! Not CTS, delaying...", client.remoteAddress, msgType, opcode, value); setTimeout(function () { sendCommand(client, msgType, opcode, value); }, 1000); return; };
      console.log("!! Not CTS, dropping request...", host, msgType, opcode, value); callback({error: true, data: 'Not cleared to send another command yet.'}); return; };
  cts[host] = false;
  console.log('!!! CTS(' + host + ') !!!');

  switch(msgType) {     // 5: Message Type
    case 'command': console.log('Command msgType not yet implemented.'); break;
    case 'getparam': msg = createGetParamMessage(opcode); break;
    case 'setparam': msg = createSetParamMessage(opcode, value); break;
    default: throw Error("Invalid msgType in createHeader:",msgType); break;
  }

  setImmediate(function () {
    hdr = createHeader(msgType, msg.length); 
    chk = createCheckCode(Buffer.concat([hdr, msg]));

    client.write(createMessage(hdr, msg, chk));
    setTimeout(function () { cts[host] = true; console.log('+++ CTS(' + host + ') +++'); }, 700);
  });
}

var createCheckCode = function(buf) {
  //console.log('== createCheckCode');
  //var buf = Buffer.concat([hdr, msg]);
  //console.dir(buf);
  var l = buf.length;
  var tally = 0;
  //console.log(l);

  for(var i = 1; i < buf.length; i++) {
    tally = tally ^ buf[i];  
  }

    var result = new Buffer([tally]);
    //console.dir(result);
    return result;
};

var createMessage = function(hdr, msg, chk) {
  return Buffer.concat([hdr, msg, chk, new Buffer([0x0d])]);
}

exports.command = command;
exports.opcodes = opcodes;
