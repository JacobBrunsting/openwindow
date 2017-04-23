/**
 * @file Provides a 'startHeartbeat' function which will make a request to the
 *  next web server in the list of all of the web serves in the network (sorted
 *  by address) to check if it is alive, and if it is not, run the provided 
 *  callback function
 */

const request = require('request');

const log = require(__dirname + '/../utils/log');

const HEARTBEAT_PATH = '/heartbeat';
const MISSED_BEATS_FOR_FAILURE = 3;
const HEARTBEAT_INTERVAL = 5;
const REQUEST_TIMEOUT = 8000;

/**
 * This is responsible for checking to ensure the web servers in the network 
 * are working. It checks the server following it in the alphabetically sorted
 * list of servers to see if it is alive. This is done so that each web server
 * only needs to check the health of a single server, but since the servers
 * all get the next one in the alphabetically sorted list, they will all be 
 * responsible for a different server in the network, covering all of the 
 * servers. If the server is not alive, another server is notified to verify
 * that the server is down.
 */
function startHeartbeat(serverInfoModel, baseAddr) {
    let serverBeingChecked;
    let numSequentialFailures = 0;
    setInterval(() => {
        if (serverBeingChecked) {
            runHeartbeat();
        } else {
            serverInfoModel
                .find()
                .then(servers => {
                    if (servers.length <= 1) {
                        return;
                    }
                    serverBeingChecked = getNextServer(servers, baseAddr);
                    if (!serverBeingChecked) {
                        throw 'Next server not found';
                    }
                    runHeartbeat();
                })
                .catch(err => {
                    log.err('web_server_manager:startHeartbeat:' + err);
                });
        }
    }, HEARTBEAT_INTERVAL * 1000);

    function runHeartbeat() {
        sendHeartbeat(serverBeingChecked.baseAddr)
            .then(res => {
                // we make the server being checked undefined so that the server
                // being checked is recalculated whenever possible, as sometimes
                // the number of web servers will change, meaning a different 
                // web server should be checked by this server
                serverBeingChecked = undefined;
                numSequentialFailures = 0;
            })
            .catch(err => {
                log.bright('Heartbeat failed for web server ' + JSON.stringify(serverBeingChecked));
                ++numSequentialFailures;
                if (numSequentialFailures >= MISSED_BEATS_FOR_FAILURE) {
                    log.bright('Full failure of web server ' + JSON.stringify(serverBeingChecked));
                    validateServerFailure(serverInfoModel, serverBeingChecked, baseAddr);
                    serverBeingChecked = undefined;
                    numSequentialFailures = 0;
                }
            });
    }
}

function sendHeartbeat(serverBaseAddr) {
    const requestParams = {
        url: serverBaseAddr + HEARTBEAT_PATH,
        method: 'GET',
        json: true
    }
    return new Promise((resolve, reject) => {
        request(requestParams, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
            .on('error', err => {
                log.err('heartbeat_manager:sendHeartbeat:' + err);
                reject(err);
            });
    });
}

// gets the server following this server, when the server order is alphabetical
function getNextServer(servers, baseAddr) {
    const sortedServers = servers.sort((a, b) => a.baseAddr < b.baseAddr);
    for (let i = 0; i < sortedServers.length; ++i) {
        if (sortedServers[i].baseAddr === baseAddr) {
            let nextServerIndex = i + 1;
            while (nextServerIndex >= sortedServers.length) {
                nextServerIndex -= sortedServers.length;
            }
            return sortedServers[nextServerIndex];
        }
    }
}


function validateServerFailure(serverInfoModel, failedServer, baseAddr) {
    serverInfoModel
        .find()
        .then(servers => validateServerFailureWithServers(serverInfoModel, failedServer, servers, baseAddr))
        .catch(err => {
            log.err("web_server_manager:validateServerFailure:" + err);
        })
}

function validateServerFailureWithServers(serverInfoModel, failedServer, servers, baseAddr) {
    log.bright("Validating server failure for server " + JSON.stringify(failedServer));
    servers.sort((a, b) => a.baseAddr < b.baseAddr ? -1 : 1);
    let thisServerIndex;
    for (let i = 0; i < servers.length; ++i) {
        if (servers[i].baseAddr === baseAddr) {
            thisServerIndex = i;
            break;
        }
    }
    if (!thisServerIndex) {
        thisServerIndex = 0;
    }
    let curServerIndex = thisServerIndex + 1;

    notifyNextServer();
    // keep notifying the servers in the network until one successfully
    // processes the request, or until all servers have been tried
    function notifyNextServer() {
        while (curServerIndex >= servers.length) {
            curServerIndex -= servers.length;
        }
        if (curServerIndex === thisServerIndex) {
            // if, after trying to verify the server failure with the other 
            // servers in the network, no server could be notified, just remove
            // the server from the local database
            log.bright('Could not connect to another server to verify the failure of server ' + JSON.stringify(failedServer) + ', removing locally');
            serverInfoModel
                .findOneAndRemove({
                    baseAddr: failedServer.baseAddr
                })
                .catch(err => {
                    log.err('heartbeat_manager:notifyNextServer:' + err);
                });
            return;
        }
        if (servers[curServerIndex].baseAddr === failedServer.baseAddr) {
            curServerIndex += 1;
            notifyNextServer();
            return;
        }
        const requestParams = {
            url: servers[curServerIndex].baseAddr + '/webserver/servermaybedown',
            method: 'POST',
            body: failedServer,
            json: true,
        }
        request(requestParams).on('error', () => {
            curServerIndex += 1;
            notifyNextServer();
        });
    }
}

module.exports = {
    startHeartbeat
}