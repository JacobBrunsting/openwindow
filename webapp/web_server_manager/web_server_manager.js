/**
 * @file Provides functions to maintain a collection storing the addresses of
 *  all of the web servers in the network, and sync up with the network to 
 *  ensure that the data stored at this server is accurate
 */

const mongoose = require('mongoose');
const request = require('request-promise');
const WebServerInfo = require(__dirname + '/web_server_info');
const heartbeatManager = require(__dirname + '/heartbeat_manager');
const constants = require(__dirname + '/../constants');
const log = require(__dirname + '/../utils/log');
const networkSyncronizationUtils = require(__dirname + '/../utils/network_syncronization_utils');

const SERVER_INFO_MODEL_NAME = 'WebServerInfo';

let serverInfoModel; // TODO: Wrap this, like you are doing with the database server
let baseAddr;

function addServerInfo(serverInfo) {
    return serverInfoModel.create(serverInfo);
}

function getAllServerInfo(excludeid) {
    return serverInfoModel
        .find({}, excludeid === 'true' ? {
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
    log.msg('web_server_manager:notifyOtherServers:making a request to URL ' + path + ' to all servers, params are:');
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
                log.err('web_server_manager:notifyOtherServers:' + err);
                reject(err);
            });

        function notifyServerFromList(servers) {
            if (!servers || servers.length === 0) {
                log.msg('web_server_manager:notifyOtherServers:No servers to notify');
                resolve();
                return;
            }
            let requestsWaitingForResponse = 0;
            servers.forEach((server) => {
                ++requestsWaitingForResponse;
                requestParams.url = server.baseAddr + '/' + path;
                request(requestParams)
                    .then(() => {
                        --requestsWaitingForResponse;
                        if (requestsWaitingForResponse === 0) {
                            resolve();
                        }
                    })
                    .catch(err => {
                        log.err('web_server_manager:notifyOtherServers:' + err);
                        reject(err);
                    });
            });
        }
    });
}

function setupSelf(isFirstServer, serverFailureCallback) {
    const self = new WebServerInfo(baseAddr);
    if (isFirstServer && isFirstServer === true) {
        return serverInfoModel
            .create(self)
            .then(res => {
                heartbeatManager.startHeartbeat(serverInfoModel, baseAddr, serverFailureCallback);
                return res;
            });
    }
    const requestParams = {
        url: constants.apiAddress + 'webserver/allserverinfo?excludeid=true',
        method: 'GET',
        json: true
    }
    return request(requestParams).then(servers => {
        if (!servers) {
            throw 'Could not retrieve list of servers';
        } else {
            // we include ourself in the database of servers to make it easier
            // to compare different web server databases
            servers.push(self);
            return Promise
                .all([
                    serverInfoModel.create(servers),
                    addSelfToNetwork()
                ])
                .then(() => {
                    heartbeatManager.startHeartbeat(serverInfoModel, baseAddr, serverFailureCallback);
                })
                .catch(err => {
                    console.log('web_server_manager:setupSelf:' + err);
                    throw err;
                });
        }
    }).catch(err => {
        throw err;
    });

    function addSelfToNetwork() {
        const requestParams = {
            url: constants.apiAddress + 'webserver/newserver',
            body: self,
            method: 'POST',
            json: true
        }
        return request(requestParams).catch(err => {
            log.err('web_server_manager:setupSelf:' + err);
            throw err;
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
    return networkSyncronizationUtils.syncWithNetwork(
            serverInfoModel,
            otherServerAddresses,
            '/webserver/allserverinfo?excludeid=true',
            'baseAddr')
        .then(res => {
            if (res === true) {
                log.bright('successfully synced web server info with network, no changes made');
                return;
            } else {
                log.bright('successfully synced web server info with network, new data is ' + JSON.stringify(res));
                serverInfoModel
                    .remove({})
                    .then(() => {
                        serverInfoModel.create(res);
                    })
            }
        })
        .catch((err) => {
            log.err('web_server_manager:syncWithNetwork:' + err);
            throw err;
        });
}

module.exports = (serverInfoCollectionName, nbaseAddr) => {
    baseAddr = nbaseAddr;

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