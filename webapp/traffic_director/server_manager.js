var request = require('request');
var DatabaseServerInfo = require('../classes/database_server_info');
var SqrGeoRng = require('../classes/sqr_geo_rng');

var serverInfoModel;

function getApiCallURL(baseAddr, path) {
    return baseAddr + "/api/" + path;
}

function addServerInfo(req, res) {
    serverInfoModel
        .create(req.body)
        .then((server) => {
            res.json(server);
        })
        .catch((err) => {
            res.json(500).send();
            console.log("server_manager:addServerInfo:" + err);
        });
}

// TODO: Rearange backups after removing the server
function removeServerInfo(req, res) {
    return new Promise((resolve, reject) => {
        var baseAddr = req.query.baseAddr;
        serverInfoModel
            .findOneAndRemove({
                baseAddr: baseAddr
            })
            .then((server) => {
                if (!server) {
                    res.status(500).send();
                    reject();
                    console.log("server_manager:removeServerInfo:" + err);
                    return;
                }
                replaceServer(DatabaseServerInfo.convertObjToClass(server));
                res.status(200).send();
                resolve();
            })
            .catch((err) => {
                res.status(500).send();
                reject();
                console.log("server_manager:removeServerInfo:" + err);
            });
    });
}

// Fills in the area previously covered by the provided server by expanding an
// existing server
function replaceServer(oldServer) {
    var query = {
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

    serverInfoModel
        .find(query)
        .then((servers) => {
            const formattedServers = DatabaseServerInfo.convertObjsToClasses(servers);
            onBorderingServerRetrieval(formattedServers);
        })
        .catch((err) => {
            console.log("server_manager:replaceServer:" + err);
        });

    function onBorderingServerRetrieval(server) {
        servers.forEach(function (server) {
            let minLngMatch = server.writeRng.minLng == oldServer.writeRng.minLng;
            let maxLngMatch = server.writeRng.maxLng == oldServer.writeRng.maxLng;
            let minLatMatch = server.writeRng.minLat == oldServer.writeRng.minLat;
            let maxLatMatch = server.writeRng.maxLat == oldServer.writeRng.maxLat;
            if ((minLngMatch && maxLngMatch) || (minLatMatch && maxLatMatch)) {
                expandServerToMatchOldServer(server, oldServer);
                return;
            }
        });

        // TODO: Complete this relatively rare case
        // find a server that shares a corner, and shrink it until it has 
        // the same height or width, then expand, and fill in the gap with
        // another server
    }

    function mergeServers(serverToMerge, serverToMergeWith) {
        let url = getApiCallURL(serverToMerge.backupAddr, "allposts");
        request.get(url, (err, res) => {
            if (err) {
                console.log("server_manager:mergeServers:" + err);
                return;
            } else if (!res) {
                console.log("server_manager:mergeServers:empty response");
                return;
            }
            let posts = res.body;
            let url = getApiCallURL(serverToMergeWith.baseAddr, "posts");
            request.post(url, (err, res) => {
                if (err) {
                    console.log("server_manager:mergeServers:" + err);
                }
            });
        });
    }
}

/**
 * For every server on the network, shrink the 'read range' of the server if 
 * possible so that when the traffic director is determining which servers 
 * to send location-based requests to, it makes less unnecesary server calls
 */
function recalculateServersRanges() {
    serverInfoModel
        .find()
        .then((servers) => {
            servers.forEach((server) => {
                recalculateServerRanges(DatabaseServerInfo.convertObjToClass(server));
            });
        })
        .catch((err) => {
            console.log("traffic_director:server range calculations:" + err);
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
            console.log("server_manager:recalculateServerRanges:" + err);
            return;
        } else if (!res) {
            console.log("server_manager:recalculateServerRanges:empty response");
            return;
        }
        let serverPostArea = res.body;
        // we take the max/min of the serverPostArea and the original server
        // values because we only update this information once in a while,
        // so we need to assume that at any time a post can be added to 
        // anywhere inside the write range, thus expanding the serverPostArea
        // TODO: This can probably be done a bit nicer
        // This can be done nicer by using the 'expandRange...' function and
        // comparing after
        server.writeRng.expandToContainOther(serverPostArea); // TODO: IS THIS ThE RIGHT FUNCTION TO USE HERE
        let newMinLngRead = Math.min(serverPostArea.minLng, server.writeRng.minLng);
        let newMaxLngRead = Math.max(serverPostArea.maxLng, server.writeRng.maxLng);
        let newMinLatRead = Math.min(serverPostArea.minLat, server.writeRng.minLat);
        let newMaxLatRead = Math.max(serverPostArea.maxLat, server.writeRng.maxLat);
        let shouldUpdate = false;
        if (newMinLngRead !== server.readRng.minLng) {
            server.readRng.minLng = newMinLngRead;
            shouldUpdate = true;
        }
        if (newMaxLngRead !== server.readRng.maxLng) {
            server.readRng.maxLng = newMaxLngRead;
            shouldUpdate = true;
        }
        if (newMinLatRead !== server.readRng.minLat) {
            server.readRng.minLat = newMinLatRead;
            shouldUpdate = true;
        }
        if (newMaxLatRead !== server.readRng.maxLat) {
            server.readRng.maxLat = newMaxLatRead;
            shouldUpdate = true;
        }
        if (shouldUpdate) {
            console.log("updating read area for a database server, updated info is:");
            console.log(JSON.stringify(server));
            resizeServer(server);
        }
    });
}

function expandServerToMatchOldServer(server, oldServer) {
    server.expandToContainOther(oldServer);
    resizeServer(server, () => {
        mergeServers(oldServer, server);
    });
}

// TODO: Use a promise instead of a callback
function resizeServer(newServer, onSuccess) {
    serverInfoModel
        .findByIdAndUpdate({
                _id: newServer._id
            }, {
                $set: {
                    'writeRng.maxLat': newServer.writeRng.maxLat,
                    'writeRng.minLat': newServer.writeRng.minLat,
                    'writeRng.maxLng': newServer.writeRng.maxLng,
                    'writeRng.minLng': newServer.writeRng.minLng,
                    'readRng.maxLat': newServer.readRng.maxLat,
                    'readRng.minLat': newServer.readRng.minLat,
                    'readRng.maxLng': newServer.readRng.maxLng,
                    'readRng.minLng': newServer.readRng.minLng
                }
            }, {
                new: true
            },
            (err, data) => {
                if (err) {
                    console.log("server_manager:resizeServer:" + err);
                } else {
                    if (onSuccess) {
                        onSuccess();
                    }
                }
            });
}

function getAllServerInfo(req, res) {
    serverInfoModel
        .find()
        .then((servers) => {
            res.json(servers);
        })
        .catch((err) => {
            res.status(500).send();
            console.log("server_manager:getAllServerInfo:" + err);
        })
}


var locationUtils = require('./server_location_utils');

var serverInfoModel;

// req.body must be of form {baseAddr:Number}
function generateServerInfo(req, res, resolve, reject) {
    // nesting for days
    return new Promise((resolve, reject) => {
        let baseAddr = req.body.baseAddr;
        let backupAddr;
        serverInfoModel
            .find()
            .then(onServerListRetrieval)
            .catch((err) => {
                console.log("server_creator:generateServerInfo:" + err);
            });

        function onServerListRetrieval(servers) {
            let serverInfos = [];
            servers.forEach((server) => {
                serverInfos.push(DatabaseServerInfo.convertObjToClass(server));
            });
            getNewServerLocation(serverInfos).then((range) => {
                backupAddr = getBackupAddr(baseAddr, range, serverInfos);
                console.log("backup addr is " + backupAddr);
                insertNewServer(new DatabaseServerInfo(baseAddr, backupAddr, range, range));
            });
        }

        function getBackupAddr(newBaseAddr, newWriteRng, otherServers) {
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
            } else {
                backupAddr = baseAddr;
            }
            return backupAddr;
        }

        function insertNewServer(newServer) {
            console.log("server_creator:adding server" + JSON.stringify(newServer));
            serverInfoModel
                .create(newServer)
                .then((reqRes) => {
                    res.json(newServer);
                    resolve(newServer);
                })
                .catch((err) => {
                    res.status(500).send();
                    reject();
                    console.log("server_creator:insertNewServer:" + err);
                });
        }
    });
}

function clearBackupsAtServer(serverAddress) {
    var requestParams = {
        url: getApiCallURL(serverAddress, "backups"),
        json: true
    };
    request.delete(requestParams, (err) => {
        if (err) {
            console.log("server_creator:clearBackupsAtServer:" + err);
        }
    });
}

function changeServerbackupAddr(serverInfo, newbackupAddr) {
    serverInfoModel
        .findByIdAndUpdate({
                _id: serverInfo._id
            }, {
                $set: {
                    backupAddr: newbackupAddr,
                }
            },
            (err, data) => {
                if (err) {
                    console.log("server_creator:changeServerbackupAddr:" + err);
                } else {
                    notifyServerOfChange();
                }
            });

    function notifyServerOfChange() {
        const requestParams = {
            url: getApiCallURL(serverInfo.baseAddr, "backupaddr"),
            body: {
                newbackupAddr: newbackupAddr
            },
            json: true
        };
        request.put(requestParams, function (err) {
            if (err) {
                console.log("server_creator:changeServerbackupAddr:notifyServerOfChange:" + err);
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

function getNewServerLocation(serverInfos) {
    function splitLargestServerArea(serverInfos) {
        let largestArea = 0;
        let targServer;
        let minLng;
        let maxLng;
        let minLat;
        let maxLat;
        serverInfos.forEach((serverInfo) => {
            let area = serverInfo.writeRng.getArea();
            if (area > largestArea) {
                largestArea = area;
                targServer = serverInfo;
            }
        });
        if ((targServer.writeRng.maxLat - targServer.writeRng.minLat) > (targServer.writeRng.maxLng - targServer.writeRng.minLng)) {
            let middleLat = (targServer.writeRng.maxLat + targServer.writeRng.minLat) / 2;
            minLng = targServer.writeRng.minLng;
            maxLng = targServer.writeRng.maxLng;
            minLat = middleLat;
            maxLat = targServer.writeRng.maxLat;
            targServer.writeRng.maxLat = middleLat;
        } else {
            let middleLng = (targServer.writeRng.maxLng + targServer.writeRng.minLng) / 2;
            minLng = middleLng;
            maxLng = targServer.writeRng.maxLng;
            minLat = targServer.writeRng.minLat;
            maxLat = targServer.writeRng.maxLat;
            targServer.writeRng.maxLng = middleLng;
        }
        return new Promise((resolve, reject) => {
            resizeServer(targServer, (res) => {
                resolve(new SqrGeoRng(minLat, maxLat, minLng, maxLng));
            });
        });
    }

    return new Promise((resolve, reject) => {
        if (serverInfos.length === 0) {
            resolve(new SqrGeoRng(-90, 90, -180, 180));
            return;
        } else {
            splitLargestServerArea(serverInfos).then(resolve);
            return;
        }
    });
}

module.exports = (nServerInfoModel) => {
    serverInfoModel = nServerInfoModel;

    return {
        removeServerInfo,
        getAllServerInfo,
        addServerInfo,
        recalculateServersRanges,
        resizeServer,
        generateServerInfo
    }
}