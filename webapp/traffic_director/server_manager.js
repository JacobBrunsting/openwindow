var request = require('request');
var ServerInfo = require('./classes/server_info');
var SqrGeoRng = require('./classes/sqr_geo_rng');

var serverInfoModel;

function getApiCallURL(baseAddr, path) {
    return baseAddr + "/api/" + path;
}

// TODO: Rearange backups after removing the server
function removeServerInfo(req, res) {
    var baseAddr = req.query.baseAddr;
    serverInfoModel
        .findOneAndRemove({
            baseAddr: baseAddr
        })
        .then(function (server) {
                if (!server) {
                    console.log("server_manager:removeServerInfo:Could not find the server to remove")
                    req.status(500).send();
                    return;
                }
                replaceServer(server);
                res.status(200).send();
            },
            function (err) {
                console.log("server_manager:removeServerInfo:" + err);
                res.status(500).send();
            }
        );
}

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
    // TODO: Actually copy over data from server
    serverInfoModel
        .find(query)
        .then(
            function (servers) {
                onBorderingServersRetrieval(servers);
            },
            function (err) {
                console.log("server_manager:replaceServer:" + err);
            }
        );

    function onBorderingServerRetrieval(server) {
        servers.forEach(function (server) {
            var minLngMatch = server.writeRng.minLng == oldServer.writeRng.minLng;
            var maxLngMatch = server.writeRng.maxLng == oldServer.writeRng.maxLng;
            var minLatMatch = server.writeRng.minLat == oldServer.writeRng.minLat;
            var maxLatMatch = server.writeRng.maxLat == oldServer.writeRng.maxLat;
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
        var url = getApiCallURL(serverToMerge.backupAddr, "allsiteposts");
        request.get(url, function (err, res) {
            if (err) {
                console.log("server_manager:mergeServers:" + err);
                return;
            } else if (!res) {
                console.log("server_manager:mergeServers:empty response");
                return;
            }
            var posts = res.body;
            var url = getApiCallURL(serverToMergeWith.baseAddr, "posts");
            request.post(url, function (err, res) {
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
        .then(
            function (servers) {
                servers.forEach(function (server) {
                    recalculateServerRanges(ServerInfo.convertObjToClass(server));
                });
            },
            function (err) {
                console.log("traffic_director:server range calculations:" + err);
            }
        );
}

function recalculateServerRanges(server) {
    var addr = server.baseAddr;
    var url = getApiCallURL(addr, "postrange");
    var requestParams = {
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
        var serverPostArea = res.body;
        // we take the max/min of the serverPostArea and the original server
        // values because we only update this information once in a while,
        // so we need to assume that at any time a post can be added to 
        // anywhere inside the write range, thus expanding the serverPostArea
        // TODO: This can probably be done a bit nicer
        var newMinLngRead = Math.min(serverPostArea.minLng, server.writeRng.minLng);
        var newMaxLngRead = Math.max(serverPostArea.maxLng, server.writeRng.maxLng);
        var newMinLatRead = Math.min(serverPostArea.minLat, server.writeRng.minLat);
        var newMaxLatRead = Math.max(serverPostArea.maxLat, server.writeRng.maxLat);
        var shouldUpdate = false;
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
    server.writeRng.minLng = Math.min(server.writeRng.minLng, oldServer.writeRng.minLng);
    server.writeRng.maxLng = Math.max(server.writeRng.maxLng, oldServer.writeRng.maxLng);
    server.writeRng.minLat = Math.min(server.writeRng.minLat, oldServer.writeRng.minLat);
    server.writeRng.maxLat = Math.max(server.writeRng.maxLat, oldServer.writeRng.maxLat);
    server.readRng.minLng = Math.min(server.readRng.minLng, oldServer.readRng.minLng);
    server.readRng.maxLng = Math.max(server.readRng.maxLng, oldServer.readRng.maxLng);
    server.readRng.minLat = Math.min(server.readRng.minLat, oldServer.readRng.minLat);
    server.readRng.maxLat = Math.max(server.readRng.maxLat, oldServer.readRng.maxLat);
    resizeServer(server, function () {
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
            function (err, data) {
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
        .then(
            function (servers) {
                res.json(servers);
            },
            function (err) {
                console.log("server_manager:getAllServerInfo:" + err);
                res.status(500).send();
            }
        )
}


var locationUtils = require('./server_location_utils');

var serverInfoModel;

// req.body must be of form {baseAddr:Number}
function addServerInfo(req, res) {
    let baseAddr = req.body.baseAddr;
    let backupAddr;
    serverInfoModel
        .find()
        .then(
            onServerListRetrieval,
            (err) => {
                console.log("server_creator:addServerInfo:" + err);
            }
        );

    function onServerListRetrieval(servers) {
        let serverInfos = [];
        servers.forEach((server) => {
            serverInfos.push(ServerInfo.convertObjToClass(server));
        });
        getNewServerLocation(serverInfos).then(function (range) {
            backupAddr = getBackupAddr(baseAddr, range, serverInfos);
            insertNewServer(new ServerInfo(baseAddr, backupAddr, range, range));
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
            .then(
                function (reqRes) {
                    res.json(newServer);
                },
                function (err) {
                    console.log("server_creator:insertNewServer:" + err);
                    res.status(500).send();
                }
            );
    }
}

function clearBackupsAtServer(serverAddress) {
    var requestParams = {
        url: getApiCallURL(serverAddress, "backups"),
        json: true
    };
    request.delete(requestParams, function (err) {
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
            function (err, data) {
                if (err) {
                    console.log("server_creator:changeServerbackupAddr:" + err);
                } else {
                    notifyServerOfChange();
                }
            });

    function notifyServerOfChange() {
        var requestParams = {
            url: getApiCallURL(serverInfo.baseAddr, "backupAddr"),
            qs: {
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
    var curMaxDist = -1;
    var targetCoords = getCenterOfRange(serverRng);
    var farthestServer;
    otherServers.forEach(function (server) {
        var dist = getDistanceBetweenCoords(targetCoords, getCenterOfRange(server.writeRng));
        if (dist > curMaxDist) {
            curMaxDist = dist;
            farthestServer = server;
        }
    });
    return farthestServer;
}

function getCenterOfRange(geoRange) {
    var lngRange = getDistanceBetweenPointsOnCircle(geoRange.minLng, geoRange.maxLng, 360);
    var latRange = getDistanceBetweenPointsOnCircle(geoRange.minLat, geoRange.maxLat, 180);
    var center = {
        lng: geoRange.minLng + lngRange / 2,
        lat: geoRange.minLat + latRange / 2
    };
    if (center.lng > 180) {
        center.lng -= 360;
    } else if (center.lng < -180) {
        center.lng += 360;
    }
    if (center.lat > 90) {
        center.lat -= 180;
    } else if (center.lat < -90) {
        center.lat += 180;
    }
    return center;
}

// coordinates must be of the form {lng:Number, lat:Number}
function getDistanceBetweenCoords(coord1, coord2) {
    var lngDist = Math.min(
        getDistanceBetweenPointsOnCircle(coord1.lng, coord2.lng, 360),
        getDistanceBetweenPointsOnCircle(coord2.lng, coord1.lng, 360)
    );
    var latDist = Math.min(
        getDistanceBetweenPointsOnCircle(coord1.lat, coord2.lat, 180),
        getDistanceBetweenPointsOnCircle(coord2.lat, coord1.lat, 180)
    );
    return Math.sqrt(lngDist * lngDist + latDist * latDist);
}

// gets the distance it takes to travel from startPos to endPos by only
// incrimenting the position. When the position exceeds maxVal, it skips to
// minVal
function getDistanceBetweenPointsOnCircle(startPos, endPos, circleLen) {
    if (startPos < endPos) {
        return endPos - startPos;
    } else {
        return endPos + circleLen - startPos;
    }
}

// You may find yourself wondering if this function is efficient. The answer is
// no, it is most definitely not, but it's very rarely called, since servers 
// aren't added very often, so I'm not too worried about it
// TODO: You aren't handling cases where a server is on a lng/lat extreme
// very well
function getNewServerLocation(serverInfos) {
    var FILL_VAL = 1;
    var EMPTY_VAL = 0;

    var blockLngs = [-180, 180]; // width of a chunk of the world in degrees longitude
    var blockLats = [-90, 90]; // height of a chunk of the world in degrees latitude
    var blockVals = [
        [EMPTY_VAL]
    ]; // 1 for a covered block, 0 for a uncovered one
    // first index lat, next is lng

    // on success should take an area object representing the area removed from the server
    // TODO: Create function to get area object
    function splitLargestServerArea(serverInfos) {
        let largestArea = 0;
        let targServer;
        let minLng;
        let maxLng;
        let minLat;
        let maxLat;
        serverInfos.forEach(function (serverInfo) {
            var area = serverInfo.writeRng.getArea();
            if (area > largestArea) {
                largestArea = area;
                targServer = serverInfo;
            }
        });
        if ((targServer.writeRng.maxLat - targServer.writeRng.minLat) > (targServer.writeRng.maxLng - targServer.writeRng.minLng)) {
            var middleLat = (targServer.writeRng.maxLat + targServer.writeRng.minLat) / 2;
            minLng = targServer.writeRng.minLng;
            maxLng = targServer.writeRng.maxLng;
            minLat = middleLat;
            maxLat = targServer.writeRng.maxLat;
            targServer.writeRng.maxLat = middleLat;
        } else {
            var middleLng = (targServer.writeRng.maxLng + targServer.writeRng.minLng) / 2;
            minLng = middleLng;
            maxLng = targServer.writeRng.maxLng;
            minLat = targServer.writeRng.minLat;
            maxLat = targServer.writeRng.maxLat;
            targServer.writeRng.maxLng = middleLng;
        }
        return new Promise((resolve, reject) => {
            resizeServer(targServer, function (res) {
                resolve(new SqrGeoRng(minLat, maxLat, minLng, maxLng));
            });
        });
    }
    
    return new Promise((resolve, reject) => {
        serverInfos.forEach(function (serverInfo) {
            locationUtils.splitAtLatitude(blockVals, blockLats, serverInfo.writeRng.minLat);
            locationUtils.splitAtLatitude(blockVals, blockLats, serverInfo.writeRng.maxLat);
            locationUtils.splitAtLongitude(blockVals, blockLngs, serverInfo.writeRng.minLng);
            locationUtils.splitAtLongitude(blockVals, blockLngs, serverInfo.writeRng.maxLng);
            locationUtils.fillRange(blockVals, blockLngs, blockLats, serverInfo.writeRng.minLng,
                serverInfo.writeRng.maxLng, serverInfo.writeRng.minLat,
                serverInfo.writeRng.maxLat, FILL_VAL);
        });

        var range = locationUtils.getLargestArea(blockVals, blockLngs, blockLats, FILL_VAL);
        if (range.getArea() === 0) {
            // if there are no open spaces split a server to create one
            splitLargestServerArea(serverInfos).then(resolve);
        } else {
            resolve(range);
        }
    });
}

module.exports = (nServerInfoModel) => {
    serverInfoModel = nServerInfoModel;

    return {
        removeServerInfo: removeServerInfo,
        getAllServerInfo: getAllServerInfo,
        recalculateServersRanges: recalculateServersRanges,
        resizeServer: resizeServer,
        addServerInfo: addServerInfo
    }
}