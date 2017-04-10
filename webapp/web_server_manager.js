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
        return serverInfoModel.create(self);
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
                    .then(resolve)
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