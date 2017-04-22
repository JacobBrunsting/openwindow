/**
 * @file Provides functions to maintain a collection storing the addresses of
 *  all of the web servers in the network, and sync up with the network to 
 *  ensure that the data stored at this server is accurate
 */

const constants = require(__dirname + '/constants');
const log = require(__dirname + '/utils/log');
const mongoose = require('mongoose');
const NetworkSyncronizationUtils = require(__dirname + '/utils/network_syncronization_utils');
const request = require('request');
const WebServerInfo = require(__dirname + '/classes/web_server_info');

const SERVER_INFO_MODEL_NAME = 'WebServerInfo';
const HEARTBEAT_INTERVAL = 5;

var serverInfoModel;
let baseAddr;

function addServerInfo(serverInfo) {
    return serverInfoModel.create(serverInfo);
}

function getAllServerInfo(excludeid) {
    return serverInfoModel
        .find({}, excludeid === "true" ? {
            _id: 0,
            __v: 0
        } : {
            __v: 0
        })
        .lean()
        .sort({
            baseAddr: 1
        });
}

function removeServerInfo(baseAddr) {
    return serverInfoModel
        .findOneAndRemove({
            baseAddr: baseAddr
        })
        .catch(err => {
            log.err('web_server_manager:removeServerInfo:' + err);
        });
}

function notifyOtherServers(method, path, body, qs) {
    let requestParams = {
        body: body,
        qs: qs,
        method: method,
        json: true
    }
    log.msg("web_server_manager:notifyOtherServers:making a request to URL " + path + " to all servers, params are:");
    console.log(JSON.stringify(requestParams));
    return new Promise((resolve, reject) => {
        serverInfoModel
            .find({
                baseAddr: {
                    $ne: baseAddr
                }
            })
            .lean()
            .then(notifyServerFromList)
            .catch((err) => {
                log.err("web_server_manager:notifyOtherServers:" + err);
                reject(err);
            });

        function notifyServerFromList(servers) {
            if (!servers || servers.length === 0) {
                log.msg("web_server_manager:notifyOtherServers:No servers to notify");
                resolve();
                return;
            }
            let requestsWaitingForResponse = 0;
            servers.forEach((server) => {
                ++requestsWaitingForResponse;
                requestParams.url = server.baseAddr + "/" + path;
                request(requestParams, (err) => {
                    --requestsWaitingForResponse;
                    if (err) {
                        log.err("web_server_manager:notifyOtherServers:" + err);
                        reject(err);
                    }
                    if (requestsWaitingForResponse === 0) {
                        resolve();
                    }
                });
            });
        }
    });
}

function setupSelf(isFirstServer) {
    const self = new WebServerInfo(baseAddr);
    if (isFirstServer && isFirstServer === true) {
        return serverInfoModel
            .create(self)
            .then(res => {
                startHeartbeat();
                return res;
            });
    }
    return new Promise((resolve, reject) => {
        const requestParams = {
            url: constants.apiAddress + 'webserver/allserverinfo?excludeid=true',
            method: 'GET',
            json: true
        }
        request(requestParams, (err, res) => {
            if (err) {
                reject(err);
                return;
            }
            const servers = res.body;
            if (!servers) {
                reject("Could not retrieve list of servers");
            } else {
                // we include ourself in the database of servers to make it easier
                // to compare different web server databases
                servers.push(self);
                Promise
                    .all([
                        serverInfoModel.create(servers),
                        addSelfToNetwork()
                    ])
                    .then(() => {
                        startHeartbeat();
                        resolve();
                    })
                    .catch(reject);
            }
        });

        function addSelfToNetwork() {
            return new Promise((resolve, reject) => {
                const requestParams = {
                    url: constants.apiAddress + 'webserver/newserver',
                    body: self,
                    method: 'POST',
                    json: true
                }
                request(requestParams, (err, res) => {
                    if (err) {
                        log.err("web_server_manager:setupSelf:" + err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }
    });
}

// gets the server following this server, when the server order is alphabetical
function getNextServer(servers) {
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

function sendHeartbeat(serverBaseAddr) {
    const requestParams = {
        url: serverBaseAddr + '/heartbeat',
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
        });
    });
}

function validateServerFailure(failedServer) {
    serverInfoModel
        .find()
        .then(servers => validateServerFailureWithServers(failedServer, servers))
        .catch(err => {
            log.err("web_server_manager:validateServerFailure:" + err);
        })
}

function validateServerFailureWithServers(failedServer, servers) {
    if (servers.length === 1) {
        removeServerInfo(failedServer);
        return;
    }
    log.bright("Validating server failure for server " + JSON.stringify(failedServer));
    servers.sort((a, b) => a < b ? -1 : 1);
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
            removeServerInfo(failedServer.baseAddr);
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
function startHeartbeat() {
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
                    serverBeingChecked = getNextServer(servers);
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
            .catch(() => {
                log.bright('Heartbeat failed for server ' + JSON.stringify(serverBeingChecked));
                ++numSequentialFailures;
                if (numSequentialFailures >= 3) {
                    validateServerFailure(serverBeingChecked);
                    serverBeingChecked = undefined;
                    numSequentialFailures = 0;
                }
            });
    }
}

/**
 * syncWithNetwork - Validate the web server info with the rest of the network, 
 *  and update it if it is incorrect
 * @param {string[]} otherServerAddresses - The addresses of the other
 *  servers in the network used for data validation
 */
function syncWithNetwork(otherServerAddresses) {
    return NetworkSyncronizationUtils.syncWithNetwork(
            serverInfoModel,
            otherServerAddresses,
            '/webserver/allserverinfo?excludeid=true',
            'baseAddr')
        .then(res => {
            if (res === true) {
                log.bright("successfully synced web server info with network, no changes made");
                return;
            } else {
                log.bright("successfully synced web server info with network, new data is " + JSON.stringify(res));
                serverInfoModel
                    .remove({})
                    .then(() => {
                        serverInfoModel.create(res);
                    })
            }
        })
        .catch((err) => {
            log.err("web_server_manager:syncWithNetwork:" + err);
            throw err;
        });
}

module.exports = (serverInfoCollectionName, _baseAddr) => {
    baseAddr = _baseAddr;

    const serverInfoSchema = mongoose.Schema(WebServerInfo.getStructure(), {
        collection: serverInfoCollectionName
    });

    serverInfoSchema.index({
        baseAddr: 1
    }, {
        unique: true
    });

    serverInfoModel = mongoose.model(SERVER_INFO_MODEL_NAME, serverInfoSchema);

    return {
        addServerInfo,
        getAllServerInfo,
        removeServerInfo,
        notifyOtherServers,
        setupSelf,
        syncWithNetwork,
    }
}