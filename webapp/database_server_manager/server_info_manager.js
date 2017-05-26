// TODO: Rename to 'database_server_manager'
const DatabaseServerInfo = require(__dirname + '/database_server_info');
const SqrGeoRng = require(__dirname + '/sqr_geo_rng');
const log = require(__dirname + '/../utils/log');
const request = require('request-promise');

let serverInfoModelWrapper;

function getApiCallURL(baseAddr, path) {
    return baseAddr + '/api/' + path;
}

function addServerInfo(serverInfo) {
    log.msg('server_manager:addServerInfo:Adding server ' + JSON.stringify(serverInfo));
    return serverInfoModelWrapper.create(serverInfo);
}

function addServersInfo(serversInfo) {
    serversInfo.forEach(addServerInfo);
}

function updateServerInfo(updatedServerInfo) {
    return serverInfoModelWrapper.updateOne({
        baseAddr: updatedServerInfo.baseAddr
    }, updatedServerInfo);
}

function updateServersInfo(updatedServersInfo) {
    return Promise.all(updatedServersInfo.map(updateServerInfo));
}

function addAllServerInfo(serversInfo) {
    return serverInfoModelWrapper.create(serversInfo);
}

function removeServerInfo(baseAddr) {
    return serverInfoModelWrapper
        .removeOne({
            baseAddr
        })
        .catch((err) => {
            log.err('server_manager:removeServerInfo:' + err);
            throw err;
        });
}

/**
 * For every server on the network, shrink the 'read range' of the server if 
 * possible so that when the database server manager is determining which servers 
 * to send location-based requests to, it makes less unnecesary server calls
 * TODO: Every web server is going to be doing this - look into avoiding needless
 * repition (although avoiding extra calls is also nice). Also, only make the 
 * call if the read range is larger than the write range
 */
function recalculateServersRanges() {
    serverInfoModelWrapper
        .find()
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
            log.err('server_manager:server range calculations:' + err);
        });
}

function recalculateServerRanges(server) {
    let addr = server.baseAddr;
    let url = getApiCallURL(addr, 'postrange');
    let requestParams = {
        url: url,
        method: 'GET',
        json: true
    };
    request(requestParams)
        .then(res => {
            const serverPostArea = SqrGeoRng.convertObjToClass(res);
            server.readRng = serverPostArea;
            // we expand the read range to encompass the entire write range so that,
            // no matter where a post is created, it will be within the read range 
            // and will be read by the web server
            if (!server.readRng || !server.writeRng) {
                return;
            }
            server.readRng.expandToContainOther(server.writeRng);
            if (server.readRng.minLat === null || server.readRng.maxLat === null ||
                server.readRng.minLng === null || server.readRng.maxLng === null) {
                return;
            }
            log.msg('updating read area for a database server, updated info is:');
            log.msg(JSON.stringify(server));
            resizeServer(server)
                .catch((err) => {
                    log.err('server_manager:recalculateServerRanges:' + err);
                });
        })
        .catch(err => {
            log.err('server_manager:recalculateServerRanges:' + err);
            return;
        });
}

function resizeServer(updatedServer) {
    return serverInfoModelWrapper
        .updateOne({
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
        })
        .catch(err => {
            log.err('server_manager:resizeServer:' + err);
            throw err;
        });
}

function getAllServerInfo(excludeid) {
    return serverInfoModelWrapper
        .find({}, excludeid === 'true' ? {
            _id: 0,
            __v: 0
        } : {
            __v: 0
        })
        .then(servers =>
            servers.sort((a, b) => a.baseAddr.localeCompare(b.baseAddr)))
        .then(servers => DatabaseServerInfo.convertObjsToClasses(servers));
}

function getServerInfo(targetAddr) {
    return serverInfoModelWrapper.findOne({
        baseAddr: targetAddr
    });
}

var locationUtils = require(__dirname + '/server_location_utils');

function generateAndStoreServerInfo(serverInfo) {
    let serverInfos;
    let updatedServers = [];
    let newServer;
    return serverInfoModelWrapper
        .find()
        .then((servers) => {
            if (!servers || servers.length === 0) {
                const fullRange = new SqrGeoRng(-90, 90, -180, 180);
                newServer = new DatabaseServerInfo(
                    serverInfo.baseAddr,
                    serverInfo.baseAddr,
                    fullRange,
                    fullRange
                );
                return serverInfoModelWrapper.create(newServer)
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
                        serverInfoModelWrapper.create(newServer)
                    ]);
                });
        })
        .then(() => ({
            newServer: newServer,
            updatedServers: updatedServers
        }))
        .catch(err => {
            log.err('server_manager:generateAndStoreServerInfo:' + err);
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
            backupAddr = farthestServer.backupAddr;
            changeServerBackupAddr(farthestServer.baseAddr, newBaseAddr);
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
    let updatesByAddr = {};

    return serverInfoModelWrapper
        .removeOne({
            baseAddr: serverToRemove.baseAddr
        })
        .then(res => {
            if (!res) {
                throw 'Server not found in database';
            }
        })
        .then(getBackupAddrUpdates)
        .then(addToUpdatesObject)
        .then(getRangeUpdates)
        .then(addToUpdatesObject)
        .then(() => generateUpdatedServersInfo(['backupAddr']))
        .then(preformUpdatesLocally)
        .then(redistributeBackupPosts)
        .then(() => generateUpdatedServersInfo(['readRng', 'writeRng']))
        .then(preformUpdatesLocally)
        .then(() => generateUpdatedServersInfo([]))
        .catch(err => {
            log.err("server_info_manager:removeServerAndAdjust:" + err);
        });

    function getBackupAddrUpdates() {
        return serverInfoModelWrapper.getAllServers()
            .then(servers => {
                const serverBackingToRemoved = servers.find(s =>
                    s && s.backupAddr === serverToRemove.baseAddr);
                if (!serverBackingToRemoved) {
                    return;
                }
                let backupUpdatesByAddr = {};
                backupUpdatesByAddr[serverBackingToRemoved.baseAddr] = {
                    backupAddr: serverToRemove.backupAddr
                };
                return backupUpdatesByAddr;
            })
    }

    function getRangeUpdates() {
        return fillSpaceLeftByServer(serverToRemove, useBackupServerForData);
    }

    function addToUpdatesObject(newUpdates) {
        for (let addr in newUpdates) {
            if (updatesByAddr[addr]) {
                updatesByAddr[addr] = Object.assign(updatesByAddr[addr], newUpdates[addr]);
            } else {
                updatesByAddr[addr] = newUpdates[addr];
            }
        }
    }

    function generateUpdatedServersInfo(keysToExclude) {
        return Object.keys(updatesByAddr).map(addr => {
            let updatedServerInfo = removeKeys(updatesByAddr[addr], keysToExclude);
            updatedServerInfo.baseAddr = addr;
            return updatedServerInfo;
        });
    }

    function removeKeys(object, keys) {
        return Object.keys(object).reduce((result, key) => {
            if (keys.indexOf(key) == -1) {
                result[key] = object[key];
            }
            return result;
        }, {});
    }

    function preformUpdatesLocally(updatedServersInfo) {
        return Promise.all(updatedServersInfo.reduce((promises, serverInfo) => {
                if (serverInfo.backupAddr) {
                    promises.push(
                        changeServerBackupAddr(serverInfo.baseAddr,
                            serverInfo.backupAddr));
                }
                return promises;
            }, []))
            .then(() => updateServersInfo(updatedServersInfo));
    }

    function redistributeBackupPosts() {
        return serverInfoModelWrapper.getAllServers().then(redistributeBackups);

        function redistributeBackups(servers) {
            console.log("reedistributing backups from servers " + JSON.stringify(servers));
            let serverRangesAndAddresses = [];
            servers.forEach(serverInfo => {
                if (serverInfo.writeRng) {
                    serverRangesAndAddresses.push({
                        range: serverInfo.writeRng,
                        address: serverInfo.baseAddr
                    });
                }
            });
            const requestParams = {
                url: serverToRemove.backupAddr + '/api/redistributebackups?stream=true',
                body: {
                    targetServers: serverRangesAndAddresses
                },
                json: true
            };
            return request.post(requestParams);
        }
    }
}

// Fills in the area previously covered by the provided server by expanding an
// existing server, return the updated server fields
function fillSpaceLeftByServer(oldServer, useBackupServerForData) {
    let query = {
        $or: [{
                'writeRng.minLng': oldServer.writeRng.minLng
            },
            {
                'writeRng.maxLng': oldServer.writeRng.maxLng
            },
            {
                'writeRng.minLat': oldServer.writeRng.minLat
            },
            {
                'writeRng.maxLat': oldServer.writeRng.maxLat
            }
        ]
    };

    return serverInfoModelWrapper
        .find(query)
        .then(DatabaseServerInfo.convertObjsToClasses)
        .then(onBorderingServerRetrieval)
        .catch(err => {
            log.err('server_manager:fillSpaceLeftByServer:' + err);
            throw err;
        });

    // returns an object with address keys of the servers that were modified CLEAN UP LATER
    function onBorderingServerRetrieval(servers) {
        let rangeUpdatesByAddr = {};
        const edges = ['minLng', 'maxLat', 'maxLng', 'minLat'];
        for (let i = 0; i < 4; ++i) {
            let parallelEdge = edges[i < 3 ? i + 1 : i - 3];
            let minAdjascent = i % 2 === 0 ? 'minLng' : 'minLat';
            let maxAdjascent = i % 2 === 0 ? 'maxLng' : 'maxLat';
            let oppositeEdge = edges[i < 1 ? i + 3 : i - 1];
            let parallelAlignedServers = findServersAlignedToSide(
                servers,
                parallelEdge,
                oppositeEdge,
                minAdjascent,
                maxAdjascent
            );
            let alignedMax = false;
            let alignedMin = false;
            for (let i = 0; i < parallelAlignedServers.length; ++i) {
                const curServer = parallelAlignedServers[i];
                if (curServer.writeRng[minAdjascent] === oldServer.writeRng[minAdjascent]) {
                    alignedMin = true;
                }
                if (curServer.writeRng[maxAdjascent] === oldServer.writeRng[maxAdjascent]) {
                    alignedMax = true;
                }
                if (alignedMax && alignedMin) {
                    break;
                }
            }
            if (alignedMax && alignedMin) {
                const oppositeEdgeWriteVal = oldServer.writeRng[oppositeEdge];
                const oppositeEdgeReadVal = oldServer.readRng[oppositeEdge];
                parallelAlignedServers.forEach(server => {
                    const writeRng = server.writeRng;
                    const readRng = server.readRng;
                    if (oppositeEdge.substring(0, 3) === 'max') {
                        writeRng[oppositeEdge] = Math.max(writeRng[oppositeEdge], oppositeEdgeWriteVal);
                        readRng[oppositeEdge] = Math.max(readRng[oppositeEdge], oppositeEdgeReadVal);
                    } else {
                        writeRng[oppositeEdge] = Math.min(writeRng[oppositeEdge], oppositeEdgeWriteVal);
                        readRng[oppositeEdge] = Math.min(readRng[oppositeEdge], oppositeEdgeReadVal);
                    }
                    rangeUpdatesByAddr[server.baseAddr] = {
                        writeRng,
                        readRng
                    };
                });
                break;
            }
        }
        return rangeUpdatesByAddr;
    }

    // idk how to describe this
    function findServersAlignedToSide(servers, targetSide, oppositeSide, minPerpSide, maxPerpSide) {
        return servers.filter(server =>
            (server.writeRng[oppositeSide] === oldServer.writeRng[targetSide] &&
                server.writeRng[minPerpSide] >= oldServer.writeRng[minPerpSide] &&
                server.writeRng[maxPerpSide] <= oldServer.writeRng[maxPerpSide])
        );
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
    return Promise.all(servers.map(getServerFilledAmount))
        .then(serverFilledAmounts => {
            if (serverFilledAmounts.length <= 0) {
                log.err('server_manager:getFilledServer:No server capacity information retrieved');
                reject('No server capacity information retrieved')
                return;
            }
            let maxVal = serverFilledAmounts[0];
            let index = 0;
            for (let i = 1; i < serverFilledAmounts.length; ++i) {
                if (maxVal < serverFilledAmounts[i]) {
                    maxVal = serverFilledAmounts[i];
                    index = i;
                } else if (maxVal === serverFilledAmounts[i] &&
                    servers[i].writeRng.getArea() > servers[index].writeRng.getArea()) {
                    index = i;
                }
            }
            return servers[index];
        })
        .catch(err => {
            log.err('server_manager:getMostFilledServer:' + err);
            throw err;
        });

    function getServerFilledAmount(server) {
        var requestParams = {
            url: getApiCallURL(server.baseAddr, 'amountfull'),
            json: true
        };
        return request.get(requestParams)
            .then(res => res.amountFull)
            .catch(err => {
                log.err('server_manager:getMostFilledServer:' + err);
                throw err;
            });
    }
}

function changeServerBackupAddr(serverAddr, newBackupAddr) {
    return serverInfoModelWrapper
        .updateOne({
            baseAddr: serverAddr
        }, {
            $set: {
                backupAddr: newBackupAddr,
            }
        })
        .then(() => {
            return notifyServerOfChange();
        })
        .catch(err => {
            log.err('server_manager:changeServerBackupAddr:' + err);
        });

    function notifyServerOfChange() {
        const requestParams = {
            url: getApiCallURL(serverAddr, 'backupaddr'),
            body: {
                newBackupAddr: newBackupAddr
            },
            json: true
        };
        return request.put(requestParams)
            .catch(err => {
                log.err('server_manager:changeServerBackupAddr:notifyServerOfChange:' + err);
                throw err;
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

module.exports = (nserverInfoModelWrapper) => {
    serverInfoModelWrapper = nserverInfoModelWrapper;

    return {
        removeServerInfo,
        getAllServerInfo,
        getServerInfo,
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