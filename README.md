# Max Hauri Max Smart 2.0

Support package to send packets to [Max Smart 2.0](https://maxsmart.ch) smart plugs using the local UDP protocol.
The protocol is probably compatible with any other [Revogi](https://revogi.com) devices that also support v3 of their protocol.

Currently doesn't support pairing or other devices.

## Features

Supports changing the power state of a plug and getting the current usage as well as basic pairing.

## Example

```js
const mh = require("mh-maxsmart2");

(async () => {
    // Tell plug how to connect to wifi. Sets spoofed max smart cloud credentials, if these are used.
    // Warning: this sends the wifi credentials in a way that is discoverable for devices that aren't in the wifi.
    const deviceInfo = mh.pair({
        wifiSSID: "WiFi SSID",
        wifiPassword: "WiFi password",
        uid: "MHM000000000", // this is the ID of the registered user in the maxsmart cloud service.
        server: "localhost", // defaults to "www.maxsmart.ch"
        port: 5000 // defaults to 5000
    });
    // Get power usage on plug
    console.log(await mh.send(deviceInfo.sn, deviceInfo.ip, mh.CMD.GET_WATT));
})();
```

## License

[MIT](LICENSE)