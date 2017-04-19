const log = require(__dirname + '/../utils/log');
const heartbeatPath = '/api/heartbeat';

const MISSED_BEATS_FOR_FAILURE = 4;
const HEARTBEAT_INTERVAL = 5;

function startHeartbeat(serverInfoWrapper, onHeartbeatFailure) {
    let missedBeatsByServer = {};
    setInterval(() => {
        runHeartbeat(serverInfoWrapper, missedBeatsByServer, onHeartbeatFailure);
    }, HEARTBEAT_INTERVAL * 1000);
}

function runHeartbeat(serverInfoWrapper, missedBeatsByServer, onHeartbeatFailure) {
    serverInfoWrapper.getAllServers().then(servers => servers.map(server => {
        serverInfoWrapper.sendRequestToServer(server, serverInfoWrapper.GET, heartbeatPath)
            .then(() => {
                missedBeatsByServer[server.baseAddr] = 0;
            })
            .catch((err) => {
                if (missedBeatsByServer[server.baseAddr]) {
                    missedBeatsByServer[server.baseAddr] += 1;
                } else {
                    missedBeatsByServer[server.baseAddr] = 1;
                }
                if (missedBeatsByServer[server.baseAddr] >= MISSED_BEATS_FOR_FAILURE) {
                    delete missedBeatsByServer[server.baseAddr];
                    onHeartbeatFailure(server);
                }
            });
    }))
}

module.exports = {
    startHeartbeat
}
