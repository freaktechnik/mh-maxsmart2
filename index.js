// Copyright (c) 2019 Martin Giger
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

const dgram = require('dgram');

const socket = dgram.createSocket({
    type: 'udp4'
});

const PORT = 8888,
    PROTOCOL_VERSION = 3,
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

// exports.makeBindServerPacket = (regId) => {
//     const date = new Date();
//     return {
//         regid: regId,
//         zone: Math.round(date.getTimezoneOffset() / 1000) + 12,
//         url: 'www.maxsmart.ch',
//         port: 5000,
//         time: Math.floor(Date.now() / 1000)
//     };
// };

exports.send = (sn, ip, command, data = {}) => new Promise((resolve, reject) => {
    const existing = queue.findIndex((q) => q.ip === ip && command === command);
    if(existing > 0) {
        queue[existing].reject(new Error("Time out"));
        queue.splice(existing, 1);
    }
    const packet = makePacket(sn, ip, command, data);
    const buffer = Buffer.from(packet, 'utf8');
    queue.push({
        resolve,
        reject,
        command,
        ip
    });
    socket.send(buffer, PORT, ip, (err) => {
        if(err) {
            reject(err);
            const index = queue.findIndex((q) => q.resolve === resolve && q.reject === reject && q.command === command && q.ip === ip);
            queue.splice(index, 1);
        }
    });
});

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