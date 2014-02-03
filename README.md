node-neclib
===========

Control NEC commercial displays over Ethernet.

Based on the protocol described in *ExternalControlManual-RS232LANX461SX551S_en.pdf* and *ExternalControlManual-VSeries321-421-461_en.pdf*, available via the Internet in select areas.

# Disclaimer: #

This was written for an internal project at my workplace. The full protocol is not -- and probably will never be --  implemented, simply because we don't need it. The basic framework (i.e., "the hard part") is done, though, and extending it should be trivial if you need additional functionality. You are encouraged to fork this project and add to it. This repository may not be actively maintained, but it is provided as a convenience to whoever may need a starting point for such a thing. I admit that a majority of the code handling and message structure is 'dirty' and inconsistent, but it currently serves its purpose.


## Running ##

`node nec-minion.js`


## Configuration ##

Set up your Faye secret and inventory list in nec-minion.js.


## Architecture ##

* nec-minion.js (runs as daemon, uses nec-lib.js; intended to be controlled from a Faye network, eg. from a front-end webpage also connected to Faye)
* nec-lib.js (built from protocol document, maintains TCP connection(s) to NEC displays, handles command throttling)

```
NEC displays <- nec-lib.js <- nec-minion.js <- faye commands <- front-end
NEC displays -> nec-lib.js -> nec-minion.js -> faye replies  -> front-end
```

## Example on how to use from front-end ##

#### Set volume

`faye.publish('/tv/cnc', {cmd: 'set', who: name, param: 'volume', value: ev.value});`

#### Get volume

`faye.publish('/tv/cnc', {cmd: 'get', who: tv.name, param: 'volume'});`

#### Send inventory to front-end

`faye.publish('/tv/cnc', {cmd: 'inventory'});`

#### Make sure we receive replies from node-neclib over Faye...
```js
var setSliderValue = function (message) {
  if(typeof message.payload === 'undefined' || typeof message.payload.value['ok'] === 'undefined' || message.payload.value['ok'] !== true) {
    console.log('-- Error querying display', message.who);
    console.dir(message);
    return;
  }

  $('#slider-'+message.who)
    .slider('setValue', message.payload.value.value);
}

var tvs = faye.subscribe('/tv/reply', function(message) {
  //console.dir(message);
  if(typeof message.cmd === 'undefined') return;

  switch(message.cmd) {
    case 'inventory': /* initInventory(scope, message); */ break;
    case 'get': setSliderValue(message) /* be lazy, assume we're getting back a volume, so we set the sliders. If we ever add more controls,
                                           we need to build in more smarts right here: inspect message.param, message.value, etc -hj 2014-02-02*/
    default: return; break;
  }
});
```

## Faye messaging system ##

http://faye.jcoglan.com/
