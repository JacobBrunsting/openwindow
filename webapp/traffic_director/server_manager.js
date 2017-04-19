// TODO: Rename to 'database_server_manager'
const request = require('request');
const DatabaseServerInfo = require(__dirname + '/../classes/database_server_info');
const log = require(__dirname + '/../utils/log');
const SqrGeoRng = require(__dirname + '/../classes/sqr_geo_rng');

var serverInfoModel;

function getApiCallURL(baseAddr, path) {
    return baseAddr + "/api/" + path;
}

function addServerInfo(serverInfo) {
    log.msg("server_manager:addServerInfo:Adding server " + JSON.stringify(serverInfo));
    return serverInfoModel.create(serverInfo);
}

function addServersInfo(serversInfo) {
    serversInfo.forEach(addServerInfo);
}

function updateServerInfo(updatedServerInfo) {
    return serverInfoModel.findOneAndUpdate({
        baseAddr: updatedServerInfo.baseAddr
    }, updatedServerInfo);
}

function updateServersInfo(updatedServersInfo) {
    return Promise.all(updatedServersInfo.map(updateServerInfo));
}

function addAllServerInfo(serversInfo) {
    log.msg("server_manager:addAllServerInfo:Adding servers " + JSON.stringify(serversInfo));
    return serverInfoModel.create(serversInfo);
}

function removeServerInfo(baseAddr) {
    return new Promise((resolve, reject) => {
        serverInfoModel
            .findOneAndRemove({
                baseAddr: baseAddr
            })
            .then((server) => {
                resolve();
            })
            .catch((err) => {
                reject();
                log.err("server_manager:removeServerInfo:" + err);
            });
    });
}

/**
 * For every server on the network, shrink the 'read range' of the server if 
 * possible so that when the traffic director is determining which servers 
 * to send location-based requests to, it makes less unnecesary server calls
 * TODO: Every web server is going to be doing this - look into avoiding needless
 * repition (although avoiding extra calls is also nice). Also, only make the 
 * call if the read range is larger than the write range
 */
function recalculateServersRanges() {
    serverInfoModel
        .find()
        .lean()
        .then(servers => {
            const formattedServers = DatabaseServerInfo.convertObjsToClasses(servers);
            formattedServers.forEach((server) => {
                // the read range can never be smaller than the write range, so
                // if the read range is already equal to the write range, we 
                // do not need to try and resize it, as it is already as small
                // as possible
                if (!server.readRng.equals(server.writeRng)) {
                    recalculateServerRanges(server);
                }
            });
        })
        .catch((err) => {
            log.err("server_manager:server range calculations:" + err);
        });
}

function recalculateServerRanges(server) {
    let addr = server.baseAddr;
    let url = getApiCallURL(addr, "postrange");
    let requestParams = {
        url: url,
        method: 'GET',
        json: true
    };
    request(requestParams, function (err, res) {
        if (err) {
            log.err("server_manager:recalculateServerRanges:" + err);
            return;
        } else if (!res) {
            log.msg("server_manager:recalculateServerRanges:empty response");
            return;
        }
        const serverPostArea = SqrGeoRng.convertObjToClass(res.body);
        server.readRng = serverPostArea;
        // we expand the read range to encompass the entire write range so that,
        // no matter where a post is created, it will be within the read range 
        // and will be read by the web server
        server.readRng.expandToContainOther(server.writeRng);
        log.msg("updating read area for a database server, updated info is:");
        log.msg(JSON.stringify(server));
        resizeServer(server)
            .catch((err) => {
                log.err("server_manager:recalculateServerRanges:" + err);
            });
    });
}

function resizeServer(updatedServer) {
    return new Promise((resolve, reject) => {
        serverInfoModel
            .findOneAndUpdate({
                    baseAddr: updatedServer.baseAddr
                }, {
                    $set: {
                        'writeRng.maxLat': updatedServer.writeRng.maxLat,
                        'writeRng.minLat': updatedServer.writeRng.minLat,
                        'writeRng.maxLng': updatedServer.writeRng.maxLng,
                        'writeRng.minLng': updatedServer.writeRng.minLng,
                        'readRng.maxLat': updatedServer.readRng.maxLat,
                        'readRng.minLat': updatedServer.readRng.minLat,
                        'readRng.maxLng': updatedServer.readRng.maxLng,
                        'readRng.minLng': updatedServer.readRng.minLng
                    }
                }, {
                    new: true
                },
                (err) => {
                    if (err) {
                        log.err("server_manager:resizeServer:" + err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
    });
}

function getAllServerInfo(excludeid) {
    return new Promise((resolve, reject) => {
        serverInfoModel
            .find({}, excludeid === "true" ? {
                _id: 0,
                __v: 0
            } : {
                __v: 0
            })
            .lean()
            .sort({
                baseAddr: 1
            })
            .then((servers) => {
                resolve(DatabaseServerInfo.convertObjsToClasses(servers));
            })
            .catch(reject);
    });
}


var locationUtils = require(__dirname + '/server_location_utils');

var serverInfoModel;

function generateAndStoreServerInfo(serverInfo) {
    let serverInfos;
    let updatedServers = [];
    let newServer;
    return serverInfoModel
        .find()
        .lean()
        .then((servers) => {
            if (!servers || servers.length === 0) {
                const fullRange = new SqrGeoRng(-90, 90, -180, 180);
                newServer = new DatabaseServerInfo(
                    serverInfo.baseAddr,
                    serverInfo.baseAddr,
                    fullRange,
                    fullRange
                );
                return serverInfoModel.create(newServer)
            }
            serverInfos = DatabaseServerInfo.convertObjsToClasses(servers);
            return getMostFilledServer(serverInfos)
                .then(server => {
                    const updatedRanges = splitArea(server.writeRng);
                    const newServerWriteRng = updatedRanges[0];
                    const existingServerUpdatedWriteRng = updatedRanges[1];
                    const splitServerUpdateInfo = {
                        baseAddr: server.baseAddr,
                        writeRng: existingServerUpdatedWriteRng
                    };
                    const backupAddr = setupNewBackupInfo(serverInfo.baseAddr, newServerWriteRng, serverInfos);
                    newServer = new DatabaseServerInfo(
                        serverInfo.baseAddr,
                        backupAddr,
                        newServerWriteRng,
                        newServerWriteRng
                    );
                    updatedServers.push(splitServerUpdateInfo);
                    return Promise.all([
                        updateServerInfo(splitServerUpdateInfo),
                        serverInfoModel.create(newServer)
                    ]);
                });
        })
        .then(() => ({
            newServer: newServer,
            updatedServers: updatedServers
        }))
        .catch(err => {
            log.err("server_manager:generateAndStoreServerInfo:" + err);
            throw err;
        });

    function setupNewBackupInfo(newBaseAddr, newWriteRng, otherServers) {
        let farthestServer = findFarthestServer(newWriteRng, otherServers);
        let backupAddr;
        if (farthestServer) {
            // make the farthest server back up to the new server, and make
            // the new server backup to the server the farthest server was 
            // previously backing up to
            // we chose the farthest server because if there is ever logic
            // implemented to have database servers store posts only from 
            // their area, we want to avoid having servers back up other
            // servers in the same area
            clearBackupsAtServer(farthestServer.backupAddr);
            backupAddr = farthestServer.backupAddr;
            changeServerbackupAddr(farthestServer, newBaseAddr);
            updatedServers.push({
                baseAddr: farthestServer.baseAddr,
                backupAddr: newBaseAddr
            });
        } else {
            backupAddr = baseAddr;
        }
        return backupAddr;
    }
}

// function (list of removed servers, list of updated servers)
function removeServerAndAdjust(serverToRemove, useBackupServerForData) {
    let serverUpdates = [];
    return serverInfoModel
        .findOneAndRemove({
            baseAddr: serverToRemove.baseAddr
        })
        .then(res => {
            if (res) {
                return res;
            } else {
                throw 'Server not found in database';
            }
        })
        .then(DatabaseServerInfo.convertObjToClass)
        .then(removedServer => fillSpaceLeftByServer(removedServer, useBackupServerForData))
        .then(updatedServers => {
            const removedServerBackupAddr = serverToRemove.backupAddr;
            log.bright("clearing backups at server " + removedServerBackupAddr);
            return clearBackupsAtServer(removedServerBackupAddr)
                .then(() => serverInfoModel.find())
                .then(servers => {
                    serverUpdates = generateUpdates(servers, updatedServers);
                    // find the server that was previously backing up to the
                    //  removed server, and make it back up to the server 
                    //  the removed server was backing up to
                    return servers.find(s =>
                        s && s.backupAddr === serverToRemove.baseAddr);
                })
                .then(serverBackingUpToRemovedServer =>
                    changeServerbackupAddr(
                        serverBackingUpToRemovedServer,
                        removedServerBackupAddr
                    )
                );
        })
        .then(() => ({
            removedServer: serverToRemove,
            updatedServers: serverUpdates
        }))
        .catch(err => {
            log.err("server_manager:removeServerAndAdjust:" + err);
            throw err;
        });

    function generateUpdates(originalServers, updatedServers) {
        let originalServersByAddr = {};
        originalServers.forEach(server => {
            originalServersByAddr[server.baseAddr] = server;
        });
        let updates = [];
        updatedServers.forEach(updatedServer => {
            const originalServer = originalServersByAddr[updatedServer.baseAddr];
            let updateInfo = {};
            for (let key in updatedServer) {
                if (updatedServer[key] !== originalServer[key]) {
                    updateInfo[key] = updatedServer[key];
                }
            }
            updateInfo["baseAddr"] = originalServer["baseAddr"];
            updates.push(updateInfo);
        });
        return updates;
    }
}

// Fills in the area previously covered by the provided server by expanding an
// existing server
function fillSpaceLeftByServer(oldServer, useBackupServerForData) {
    let serverUpdates = [];
    let query = {
        $or: [{
                'writeRng.minLng': {
                    $eq: oldServer.writeRng.minLng
                }
            },
            {
                'writeRng.maxLng': {
                    $eq: oldServer.writeRng.maxLng
                }
            },
            {
                'writeRng.minLat': {
                    $eq: oldServer.writeRng.minLat
                }
            },
            {
                'writeRng.maxLat': {
                    $eq: oldServer.writeRng.maxLat
                }
            }
        ]
    };

    return serverInfoModel
        .find(query)
        .lean()
        .then(DatabaseServerInfo.convertObjsToClasses)
        .then(onBorderingServerRetrieval)
        .catch(err => {
            log.err("server_manager:fillSpaceLeftByServer:" + err);
            throw err;
        });

    // returns an array of the servers that were modified
    function onBorderingServerRetrieval(servers) {
        for (let i = 0; i < servers.length; ++i) {
            const server = servers[i];
            let minLngMatch = server.writeRng.minLng == oldServer.writeRng.minLng;
            let maxLngMatch = server.writeRng.maxLng == oldServer.writeRng.maxLng;
            let minLatMatch = server.writeRng.minLat == oldServer.writeRng.minLat;
            let maxLatMatch = server.writeRng.maxLat == oldServer.writeRng.maxLat;
            // if the server has an edge with the same position and length as an
            //  edge on the removed server, expand that edge outwards to
            //  cover the space previously occupied by the removed server
            if ((minLngMatch && maxLngMatch) || (minLatMatch && maxLatMatch)) {
                return expandServerToMatchOldServer(server, oldServer)
                    .then(modifiedServer => [modifiedServer]);
            }
        }

        // TODO: Complete the rare case where there are no bordering servers
        //  which have a side perfectly matching the removed server
    }

    function expandServerToMatchOldServer(server, oldServer) {
        server.expandToContainOther(oldServer);
        return resizeServer(server)
            .then(() => mergeServers(oldServer, server))
            .then(() => server);
    }

    function mergeServers(serverToMerge, serverToMergeWith) {
        let fromUrl;
        if (useBackupServerForData) {
            fromUrl = getApiCallURL(serverToMerge.backupAddr, "allbackupposts");
        } else {
            fromUrl = getApiCallURL(serverToMerge.baseAddr, "allposts");
        }
        console.log("from url is " + fromUrl);
        return new Promise((resolve, reject) => {
            console.log("returning promise");
            request.get(fromUrl, (err, res) => {
                console.log("got response");
                if (err) {
                    log.err("server_manager:mergeServers:" + err);
                    reject(err);
                    return;
                } else if (!res) {
                    log.msg("server_manager:mergeServers:empty response");
                    reject("empty response");
                    return;
                }
                console.log("response is " + JSON.stringify(res.body));
                const posts = res.body;
                const toUrl = getApiCallURL(serverToMergeWith.baseAddr, "posts");
                const requestParams = {
                    url: toUrl,
                    method: 'POST',
                    body: posts,
                    json: true
                }
                request(requestParams, (err, res) => {
                    if (err) {
                        log.err("server_manager:mergeServers:" + err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }
}

function splitArea(area) {
    let areaOne = Object.assign({}, area);
    let areaTwo = Object.assign({}, area);
    if ((area.maxLat - area.minLat) > (area.maxLng - area.minLng)) {
        let middleLat = (area.maxLat + area.minLat) / 2;
        areaOne.maxLat = middleLat;
        areaTwo.minLat = middleLat;
    } else {
        let middleLng = (area.maxLng + area.minLng) / 2;
        areaOne.maxLng = middleLng;
        areaTwo.minLng = middleLng;
    }
    return [areaOne, areaTwo];
}

function getMostFilledServer(servers) {
    return new Promise((resolve, reject) => {
        Promise.all(servers.map(getServerFilledAmount))
            .then(serverFilledAmounts => {
                if (serverFilledAmounts.length <= 0) {
                    log.msg("server_manager:getFilledServer:No server capacity information retrieved");
                    reject("No server capacity information retrieved")
                    return;
                }
                let maxVal = serverFilledAmounts[0];
                let index = 0;
                for (let i = 1; i < serverFilledAmounts.length; ++i) {
                    if (maxVal < serverFilledAmounts[i]) {
                        maxVal = serverFilledAmounts[i];
                        index = i;
                    }
                }
                resolve(servers[index]);
            })
            .catch(err => {
                log.err("server_manager:getMostFilledServer:" + err);
                reject(err);
            });
    });

    function getServerFilledAmount(server) {
        return new Promise((resolve, reject) => {
            var requestParams = {
                url: getApiCallURL(server.baseAddr, "amountfull"),
                json: true
            };
            request.get(requestParams, (err, res) => {
                if (err) {
                    log.err("server_manager:getMostFilledServer:" + err);
                    reject(err);
                } else {
                    resolve(res.body.amountFull);
                }
            });
        });
    }
}

function clearBackupsAtServer(serverAddress) {
    var requestParams = {
        url: getApiCallURL(serverAddress, "backups"),
        json: true
    };
    return new Promise((resolve, reject) => {
        request.delete(requestParams, (err) => {
            if (err) {
                log.err("server_manager:clearBackupsAtServer:" + err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function changeServerbackupAddr(serverInfo, newBackupAddr) {
    serverInfoModel
        .findOneAndUpdate({
                baseAddr: serverInfo.baseAddr
            }, {
                $set: {
                    backupAddr: newBackupAddr,
                }
            },
            (err, data) => {
                if (err) {
                    log.err("server_manager:changeServerbackupAddr:" + err);
                } else {
                    notifyServerOfChange();
                }
            });

    function notifyServerOfChange() {
        const requestParams = {
            url: getApiCallURL(serverInfo.baseAddr, "backupaddr"),
            body: {
                newBackupAddr: newBackupAddr
            },
            json: true
        };
        request.put(requestParams, function (err) {
            if (err) {
                log.err("server_manager:changeServerbackupAddr:notifyServerOfChange:" + err);
            }
        });
    }
}

function findFarthestServer(serverRng, otherServers) {
    let curMaxDist = -1;
    let targetCoords = locationUtils.getCenterOfRange(serverRng);
    let farthestServer;
    otherServers.forEach(function (server) {
        const serverCoords = locationUtils.getCenterOfRange(server.writeRng);
        const dist = locationUtils.getDistanceBetweenCoords(targetCoords, serverCoords);
        if (dist > curMaxDist) {
            curMaxDist = dist;
            farthestServer = server;
        }
    });
    return farthestServer;
}

module.exports = (nServerInfoModel) => {
    serverInfoModel = nServerInfoModel;

    return {
        removeServerInfo,
        getAllServerInfo,
        addServerInfo,
        addServersInfo,
        updateServerInfo,
        updateServersInfo,
        addAllServerInfo,
        recalculateServersRanges,
        generateAndStoreServerInfo,
        removeServerAndAdjust
    };
}