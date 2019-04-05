const dgram = require("dgram");

const EASYLINK_PORT = 50000;
const makeInfo = (ssid, password) => {
    const data = new Uint8Array(128);
    // Packet size info
    data.set([
        3 + ssid.length + password.length + 5 + 2,
        ssid.length,
        password.length
    ]);
    let offset = 3;
    // SSID
    data.set(Array.from(ssid, (c) => c.charCodeAt(0)), offset);
    offset += ssid.length;
    // PW
    data.set(Array.from(password, (c) => c.charCodeAt(0)), offset);
    offset += password.length;
    // Is sendip - some magic happened that turned 1000 into this.
    data.set([35, 0, 0, 3, 232], offset);
    offset += 5;
    // Calculate checksums
    let copy = 0;
    for(let i = 0; i < offset; ++i) {
        copy = copy + (data[i] & 255);
    }
    data.set([(65535 & copy) >> 8, copy & 255], offset);
    return data;
};

const sendEasyLinkPacket = (socket, size, smallMTU = false) => {
    if(smallMTU) {
        if(size > 1280) {
            size -= 1280;
        }
        if(size < 64) {
            size += 176;
        }
    }
    const data = new Array(size);
    data.fill(0);
    return new Promise((resolve, reject) => {
        socket.send(new Uint8Array(data), EASYLINK_PORT, "255.255.255.255", (err) => {
            if(err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}

const wait = (time) => new Promise((resolve) => {
    setTimeout(resolve, time);
});

const sendInfo = async (socket, info, sleep = 10) => {
    for(let i = 1450; i <= 1452; ++i) {
        await wait(sleep);
        await sendEasyLinkPacket(socket, i);
    }
    let j = 1;
    let k = 0;
    for(let b = 0; b < info[0]; ++b) {
        const len = (j * 256) + (info[b] & 255);
        await wait(sleep);
        await sendEasyLinkPacket(socket, len);
        if(b % 4 == 3) {
            ++k;
            const kinfo = k + 1280;
            await wait(sleep);
            await sendEasyLinkPacket(socket, kinfo);
        }
        ++j;
        if(j == 5) {
            j = 1;
        }
    }
}

exports.sendWifiInfo = async (ssid, password, timeout = 10000) => {
    const socket = dgram.createSocket({
        type: 'udp4'
    });

    socket.on('error', console.error);
    await new Promise((resolve) => socket.bind(resolve));
    socket.setBroadcast(true);

    const start = Date.now();
    while(Date.now() - start < timeout) {
        await sendInfo(socket, makeInfo(ssid, password));
    }
    socket.close();
};