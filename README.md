node-neclib
===========

Control NEC commercial displays over Ethernet.

Based on the protocol described in *ExternalControlManual-RS232LANX461SX551S_en.pdf* and *ExternalControlManual-VSeries321-421-461_en.pdf*, available via the Internet in select areas.


## Running ##

`node nec-minion.js`


## Configuration ##

Set up your Faye secret and inventory list in nec-minion.js.


## Architecture ##

* nec-minion.js (runs as daemon, uses nec-lib.js; intended to be controlled from a Faye network, eg. from a front-end webpage also connected to Faye)
* nec-lib.js (built from protocol document, maintains TCP connection(s) to NEC displays, handles command throttling)

```
NEC displays <- nec-lib.js <- nec-minion.js <- faye commands <- front-end
NEC displays -> nec-lib.js <- nec-minion.js -> faye replies  -> front-end
```

## Faye messaging system ##

http://faye.jcoglan.com/
