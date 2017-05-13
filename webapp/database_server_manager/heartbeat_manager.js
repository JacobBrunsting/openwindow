/**
 * @file Provides a 'startHeartbeat' function which will make a request to all
 * of the database servers in the network periodically to check if they are
 * running, and if they are not run the provided callback function
 */

const log = require(__dirname + '/../utils/log');

const HEARTBEAT_PATH = '/api/heartbeat';
const MISSED_BEATS_FOR_FAILURE = 2;
const HEARTBEAT_INTERVAL = 5;
const REQUEST_TIMEOUT = 8000;

function startHeartbeat(serverInfoModelWrapper, getWebServersInfo, thisServerAddr, onHeartbeatFailure) {
    let missedBeatsByServer = {};
    setInterval(() => {
        runHeartbeat(serverInfoModelWrapper, getWebServersInfo, missedBeatsByServer, thisServerAddr, onHeartbeatFailure);
    }, HEARTBEAT_INTERVAL * 1000);
}

function getDatabaseServersForHeartbeat(allWebServers, thisServerAddr, allDatabaseServers) {
    let indexOfThisServer = 0;
    for (let i = 0; i < allWebServers.length; ++i) {
        if (allWebServers[i].baseAddr === thisServerAddr) {
            indexOfThisServer = i;
            break;
        }
    }
    // each web server is assigned this percentage of the database server list,
    // where it runs the heartbeat on every server in that section of the list
    const sectionWidthPercent = 1 / allWebServers.length;
    const sectionStartPercent = sectionWidthPercent * indexOfThisServer;
    const sectionEndPercent = sectionStartPercent + sectionWidthPercent;
    const sectionStartIndex = Math.ceil(sectionStartPercent * (allDatabaseServers.length - 1));
    const sectionEndIndex = Math.ceil(sectionEndPercent * (allDatabaseServers.length - 1));
    return allDatabaseServers.slice(sectionStartIndex, sectionEndIndex + 1);
}

function runServerHeartbeat(server, serverInfoModelWrapper, missedBeatsByServer, onHeartbeatFailure) {
    return serverInfoModelWrapper
        .sendRequestToServer(
            server,
            serverInfoModelWrapper.GET,
            HEARTBEAT_PATH,
            undefined,
            undefined,
            REQUEST_TIMEOUT
        )
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
}

function runHeartbeat(serverInfoModelWrapper, getWebServersInfo, missedBeatsByServer, thisServerAddr, onHeartbeatFailure) {
    serverInfoModelWrapper
        .getAllServers()
        .then(databaseServers => {
            return getWebServersInfo()
                .then(webServers => getDatabaseServersForHeartbeat(webServers, thisServerAddr, databaseServers));
        })
        .then(servers => servers.map(server => {
            runServerHeartbeat(server, serverInfoModelWrapper, missedBeatsByServer, onHeartbeatFailure)
        }))
}

module.exports = {
    startHeartbeat
}