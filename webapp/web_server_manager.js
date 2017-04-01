/**
 * @file Provides functions to maintain a collection storing the addresses of
 *  all of the web servers in the network, and sync up with the network to 
 *  ensure that the data stored at this server is accurate
 */

const constants = require(__dirname + '/constants');
const deepEqual = require('deep-equal');
const log = require(__dirname + '/utils/log');
const mongoose = require('mongoose');
const request = require('request');
const WebServerInfo = require(__dirname + '/classes/web_server_info');

const SERVER_INFO_MODEL_NAME = 'WebServerInfo';

var serverInfoModel;
let baseAddr;

function addServerInfo(serverInfo) {
    return serverInfoModel.create(serverInfo);
}

function getAllServerInfo(excludeId) {
    return serverInfoModel
        .find()
        .select(excludeId === "true" ? '-_id' : '')
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
            url: constants.apiAddress + 'webserver/allserverinfo?excludeId=true',
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
                        serverInfoModel.cresyncWithNetworkate(servers),
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
 * syncWithNetwork - Syncronize the data stored at the provided model with the
 *  other servers in the network
 * @param {Object} model - The mongoose model used to store and retrieve the
 *  data being synced
 * @param {string} retrievalURI - The path used to get the data being synced 
 *  from other servers on the network
 * @param {boolean} compareIds - Determines if the _id fields should be included
 *  in the comparions (note that, if this is false, the retrievalURI must return
 *  data without _id fields)
 */
function syncWithNetwork(model, retrievalURI, compareIds) {
    model
        .find()
        .select('-_id')
        .then((data) => {
            return determineIfMatchesNetwork(data)
        })
        .then((matchesNetwork) => {
            if (!matchesNetwork) {
                getCorrectData();
            }
        })
        .catch((err) => {
            log("web_server_manager:syncWithNetwork:" + err);
        });

    function getCorrectData() {
        log("server does not match network");
    }
}

// retrieval URI must NOT include the _id in the data returned
function determineIfMatchesNetwork(data, retrievalURI) {
    return new Promise((resolve, reject) => {
        serverInfoModel
            .find()
            .sort({
                baseAddr: 1
            })
            .then((otherServers) => {
                let selfPos = 0;
                for (let i = 0; i < otherServers.length; ++i) {
                    if (otherServers[i].baseAddr === baseAddr) {
                        selfPos = i;
                        break;
                    }
                }

                // find two servers which have IP addresses lexographically far 
                // away from the IP address of this server to avoid validating 
                // data using servers on the same network
                let offset = Math.floor(otherServers.length / 5) + 1;
                let confServerOneIndex = selfPos + offset;
                let confServerTwoIndex = selfPos - offset;
                if (confServerOneIndex > otherServers.length) {
                    confServerOne -= otherServers.length;
                }
                if (confServerTwoIndex < 0) {
                    confServerTwoIndex += otherServers.length;
                }
                const addresses = [
                    otherServers[confServerOneIndex].baseAddr,
                    otherServers[confServerTwoIndex].baseAddr,
                ];

                // for every address, determine if the local data matches the
                // data stored at the server using a promise, storing the 
                // promises in an array which is used to merge the results of 
                // each promise using Promise.all
                const serverDataMatchesPromises = addresses.map((addr) => {
                    return serverDataMatches(data, addr + retrievalURI);
                });
                return Promise.all(serverDataMatchesPromises);
            })
            .then((serversMatch) => {
                resolve(serversMatch.reduceRight((a, b) => a & b));
            })
            .err((err) => {
                reject(err);
            });
    });
}

function serverDataMatches(data, retrievalURL) {
    return new Promise((resolve, reject) => {
        const requestParams = {
            url: retrievalURL,
            method: 'GET',
            json: true
        }
        request(requestParams, (err, res) => {
            if (err) {
                log("web_server_manager:serverDataMatches:" + err);
                reject(err);
            } else {
                resolve(deepEqual(data, res.body));
            }
        });
    });
}

function syncWebServerInfoWithNetwork() {
    syncWithNetwork(serverInfoModel, '/webserver/serverinfo');
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
    }
}