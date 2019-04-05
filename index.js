// Copyright (c) 2019 Martin Giger
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

const dgram = require('dgram');
const easyLink = require("./easylink");

const socket = dgram.createSocket({
    type: 'udp4'
});

const PORT = 8888,
    PROTOCOL_VERSION = 3,
    TIMEOUT = 30000,
    CMD = {
        GET_WATT: 90,
        CONTROL: 20,
        BIND: 73
    },
    queue = [];

    const makePacket = (sn, ip, cmd, data = {}) => {
        return `V${PROTOCOL_VERSION}${JSON.stringify(Object.assign({
            sn,
            cmd
        }, data))}  ip=${ip}`;
    };

exports.CMD = CMD;

exports.makeControlPacket = (state, port = 1) => {
    return {
        port,
        state: state ? 1: 0
    };
};

exports.makeBindServerPacket = (regId, url = 'www.maxsmart.ch', port = 5000) => {
    const date = new Date();
    return {
        regid: regId,
        zone: Math.round(date.getTimezoneOffset() / 1000) + 12,
        url: url,
        port: port,
        time: Math.floor(Date.now() / 1000)
    };
};

const formatDigit = (d) => d.toString().padStart(2, '0');

const makeDiscoveryPacket = () => {
    const now = new Date();
    return `00dv=all,${now.getFullYear()}-${formatDigit(now.getMonth() + 1)}-${formatDigit(now.getDate())},${formatDigit(now.getHours())}:${formatDigit(now.getMinutes())}:${formatDigit(now.getSeconds())},${Math.round(now.getTimezoneOffset() / 1000) + 12};`
};

exports.discoverDevices = () => {
    const discoSocket = dgram.createSocket({
        type: 'udp4'
    });
    const packet = makeDiscoveryPacket();
    return new Promise(async (resolve, reject) => {
        let timeout;
        discoSocket.on('message', (msg, rinfo) => {
            const data = JSON.parse(msg.toString('utf8'));
            resolve({
                sn: data.sn,
                ip: rinfo.address,
                sak: data.sak,
                mac: data.mac,
                version: data.ver,
                name: data.name
            });
            discoSocket.close();
            clearTimeout(timeout);
        });

        await new Promise((resolve) => discoSocket.bind(8890, resolve));
        discoSocket.setBroadcast(true);
        discoSocket.send(Buffer.from(packet), 8888, "255.255.255.255", (err) => {
            if(err) {
                reject(err);
                discoSocket.close();
                clearTimeout(timeout);
            }
            discoSocket.setBroadcast(false);
        });
        timeout = setTimeout(() => {
            reject(new Error("Timeout"));
            discoSocket.close();
        }, 10000)
    });
};

exports.send = (sn, ip, command, data = {}, timeout = TIMEOUT) => new Promise((resolve, reject) => {
    const existing = queue.findIndex((q) => q.ip === ip && command === command);
    if(existing > 0) {
        queue[existing].reject(new Error("Time out"));
        queue.splice(existing, 1);
    }
    const packet = makePacket(sn, ip, command, data);
    const buffer = Buffer.from(packet, 'utf8');
    const item = {
        resolve(arg) {
            resolve(arg);
            clearTimeout(this.timeout);
        },
        reject(err) {
            reject(err);
            const index = queue.findIndex((q) => q.resolve === resolve && q.reject === reject && q.command === command && q.ip === ip);
            queue.splice(index, 1);
            clearTimeout(this.timeout);
        },
        command,
        ip,
        timeout: setTimeout((t) => {
            item.reject({
                code: 0,
                data: "Timeout"
            });
        }, timeout)
    };
    queue.push(item);
    socket.send(buffer, PORT, ip, (err) => {
        if(err) {
            item.reject(err);
        }
    });
});

exports.pair = async (opts) => {
    await easyLink.sendWifiInfo(opts.wifiSSID, opts.wifiPassword);
    const deviceInfo = await exports.discoverDevices();
    await exports.send(deviceInfo.sn, deviceInfo.ip, CMD.BIND, exports.makeBindServerPacket(opts.uid, opts.server, opts.port));
    return deviceInfo;
};

socket.on('message', (msg, rinfo) => {
    const rawMsg = msg.toString('utf8');
    if(!rawMsg.startsWith(`V${PROTOCOL_VERSION}`)) {
        console.error("Unrecognized response", rawMsg);
        return;
    }
    const resp = JSON.parse(rawMsg.substr(2));
    const waitingIndex = queue.findIndex((q) => q.command === resp.response && q.ip === rinfo.address);
    if(waitingIndex < 0) {
        console.error("Unexpected response", resp);
        return;
    }
    const waiting = queue[waitingIndex];
    queue.splice(waitingIndex, 1);
    if(resp.code !== 200) {
        waiting.reject(resp);
    }
    else if(resp.response === CMD.GET_WATT) {
        const watt = resp.data.watt[0] / 1000;
        const amp = resp.data.amp[0] / 1000;
        waiting.resolve({
            sn: resp.sn,
            watt,
            amp
        });
    }
    else if(resp.response === CMD.CONTROL) {
        waiting.resolve({
            sn: resp.sn
        });
    }
    else {
        waiting.resolve(resp);
    }
});

socket.on('error', console.error);

socket.bind();