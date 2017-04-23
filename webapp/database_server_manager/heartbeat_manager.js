/**
 * @file Provides a 'startHeartbeat' function which will make a request to all
 * of the database servers in the network periodically to check if they are
 * running, and if they are not run the provided callback function
 */

const log = require(__dirname + '/../utils/log');

const heartbeatPath = '/api/heartbeat';

const MISSED_BEATS_FOR_FAILURE = 3;
const HEARTBEAT_INTERVAL = 5;
const REQUEST_TIMEOUT = 8000;

function startHeartbeat(serverInfoModelWrapper, onHeartbeatFailure) {
    let missedBeatsByServer = {};
    setInterval(() => {
        runHeartbeat(serverInfoModelWrapper, missedBeatsByServer, onHeartbeatFailure);
    }, HEARTBEAT_INTERVAL * 1000);
}

function runHeartbeat(serverInfoModelWrapper, missedBeatsByServer, onHeartbeatFailure) {
    serverInfoModelWrapper.getAllServers().then(servers => servers.map(server => {
        serverInfoModelWrapper
            .sendRequestToServer(server, serverInfoModelWrapper.GET, heartbeatPath, undefined, undefined, REQUEST_TIMEOUT)
            .then(res => {
                missedBeatsByServer[server.baseAddr] = 0;
            })
            .catch(err => {
                log.bright('Heartbeat failed for database server ' + JSON.stringify(server));
                if (missedBeatsByServer[server.baseAddr]) {
                    missedBeatsByServer[server.baseAddr] += 1;
                } else {
                    missedBeatsByServer[server.baseAddr] = 1;
                }
                if (missedBeatsByServer[server.baseAddr] >= MISSED_BEATS_FOR_FAILURE) {
                    log.bright('Full failure of database server ' + JSON.stringify(server));
                    delete missedBeatsByServer[server.baseAddr];
                    onHeartbeatFailure(server);
                }
            });
    }))
}

module.exports = {
    startHeartbeat
}
