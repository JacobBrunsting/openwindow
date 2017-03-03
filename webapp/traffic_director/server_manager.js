var request = require('request');

var serverInfoModel;

function getApiCallURL(baseAddress, path) {
    return baseAddress + "/api/" + path;
}

// TODO: Rearange backups after removing the server
function removeServerInfo(req, res) {
    var baseAddress = req.query.baseAddress;
    serverInfoModel
        .findOneAndRemove({
            baseAddress: baseAddress
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
                minLngWrite: {
                    $eq: oldServer.minLngWrite
                }
            },
            {
                maxLngWrite: {
                    $eq: oldServer.maxLngWrite
                }
            },
            {
                minLatWrite: {
                    $eq: oldServer.minLatWrite
                }
            },
            {
                maxLatWrite: {
                    $eq: oldServer.maxLatWrite
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
            var minLngMatch = server.minLngWrite == oldServer.minLngWrite;
            var maxLngMatch = server.maxLngWrite == oldServer.maxLngWrite;
            var minLatMatch = server.minLatWrite == oldServer.minLatWrite;
            var maxLatMatch = server.maxLatWrite == oldServer.maxLatWrite;
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
        var url = getApiCallURL(serverToMerge.backupAddress, "allsiteposts");
        request.get(url, function (err, res) {
            if (err) {
                console.log("server_manager:mergeServers:" + err);
                return;
            } else if (!res) {
                console.log("server_manager:mergeServers:empty response");
                return;
            }
            var posts = res.body;
            var url = getApiCallURL(serverToMergeWith.baseAddress, "posts");
            request.post(url, function (err, res) {
                if (err) {
                    console.log("server_manager:mergeServers:" + err);
                }
            });
        });
    }
}

function recalculateServerRanges(server) {
    var addr = server.baseAddress;
    var url = getApiCallURL(addr, "/api/postrange");
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
        var newMinLngRead = Math.min(serverPostArea.minLng, server.minLngWrite);
        var newMaxLngRead = Math.max(serverPostArea.maxLng, server.maxLngWrite);
        var newMinLatRead = Math.min(serverPostArea.minLat, server.minLatWrite);
        var newMaxLatRead = Math.max(serverPostArea.maxLat, server.maxLatWrite);
        var shouldUpdate = false;
        if (newMinLngRead !== server.minLngRead) {
            server.minLngRead = newMinLngRead;
            shouldUpdate = true;
        }
        if (newMaxLngRead !== server.maxLngRead) {
            server.maxLngRead = newMaxLngRead;
            shouldUpdate = true;
        }
        if (newMinLatRead !== server.minLatRead) {
            server.minLatRead = newMinLatRead;
            shouldUpdate = true;
        }
        if (newMaxLatRead !== server.maxLatRead) {
            server.maxLatRead = newMaxLatRead;
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
    server.minLngWrite = Math.min(server.minLngWrite, oldServer.minLngWrite);
    server.maxLngWrite = Math.max(server.maxLngWrite, oldServer.maxLngWrite);
    server.minLatWrite = Math.min(server.minLatWrite, oldServer.minLatWrite);
    server.maxLatWrite = Math.max(server.maxLatWrite, oldServer.maxLatWrite);
    server.minLngRead = Math.min(server.minLngRead, oldServer.minLngRead);
    server.maxLngRead = Math.max(server.maxLngRead, oldServer.maxLngRead);
    server.minLatRead = Math.min(server.minLatRead, oldServer.minLatRead);
    server.maxLatRead = Math.max(server.maxLatRead, oldServer.maxLatRead);
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
                    maxLatWrite: newServer.maxLatWrite,
                    minLatWrite: newServer.minLatWrite,
                    maxLngWrite: newServer.maxLngWrite,
                    minLngWrite: newServer.minLngWrite,
                    maxLatRead: newServer.maxLatRead,
                    minLatRead: newServer.minLatRead,
                    maxLngRead: newServer.maxLngRead,
                    minLngRead: newServer.minLngRead
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

// req.body must be of form {baseAddress:Number}
function addServerInfo(req, res) {
    serverInfoModel
        .find()
        .then(
            onServerListRetrieval,
            function (err) {
                console.log("server_creator:addServerInfo:" + err);
            }
        );

    function onServerListRetrieval(servers) {
        var newServer = req.body;
        setupServerLocation(newServer, servers, function (newServer) {
            setupServerBackup(newServer, servers, insertNewServer);
        });
    }

    function setupServerBackup(newServer, otherServers, onComplete) {
        var farthestServer = findFarthestServer(newServer, otherServers);
        if (farthestServer) {
            // make the farthest server back up to the new server, and make
            // the new server backup to the server the farthest server was 
            // previously backing up to
            // we chose the farthest server because if there is ever logic
            // implemented to have database servers store posts only from 
            // their area, we want to avoid having servers back up other
            // servers in the same area
            clearBackupsAtServer(farthestServer.backupAddress);
            newServer.backupAddress = farthestServer.backupAddress;
            changeServerBackupAddress(farthestServer, newServer.baseAddress);
        } else {
            newServer.backupAddress = newServer.baseAddress;
        }
        onComplete(newServer);
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

function changeServerBackupAddress(server, newBackupAddress) {
    serverInfoModel
        .findByIdAndUpdate({
                _id: server._id
            }, {
                $set: {
                    backupAddress: newBackupAddress,
                }
            },
            function (err, data) {
                if (err) {
                    console.log("server_creator:changeServerBackupAddress:" + err);
                } else {
                    notifyServerOfChange();
                }
            });

    function notifyServerOfChange() {
        var requestParams = {
            url: getApiCallURL(server.baseAddress, "/api/backupaddress"),
            qs: {
                newBackupAddress: newBackupAddress
            },
            json: true
        };
        request.put(requestParams, function (err) {
            if (err) {
                console.log("server_creator:changeServerBackupAddress:notifyServerOfChange:" + err);
            }
        });
    }
}

function findFarthestServer(targetServer, otherServers) {
    var curMaxDist = -1;
    var targetCoords = getCenterOfServer(targetServer);
    var farthestServer;
    otherServers.forEach(function (server) {
        var dist = getDistanceBetweenCoords(targetCoords, getCenterOfServer(server));
        if (dist > curMaxDist) {
            curMaxDist = dist;
            farthestServer = server;
        }
    });
    return farthestServer
}

function getCenterOfServer(server) {
    var lngRange = getDistanceBetweenPointsOnCircle(server.minLngWrite, server.maxLngWrite, 360);
    var latRange = getDistanceBetweenPointsOnCircle(server.minLatWrite, server.maxLatWrite, 180);
    var center = {
        lng: server.minLngWrite + lngRange / 2,
        lat: server.minLatWrite + latRange / 2
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
// TODO: Use promise instead of callback
// TODO: You aren't handling cases where a server is on a lng/lat extreme
// very well
function setupServerLocation(newServer, otherServers, onServerLocationUpdate) {
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
    function splitLargestServerArea(servers, onSuccess) {
        var largestArea = 0;
        var targServer = {};
        servers.forEach(function (server) {
            var area = (server.maxLatWrite - server.minLatWrite) * (server.maxLngWrite - server.minLngWrite);
            if (area > largestArea) {
                largestArea = area;
                targServer = server;
            }
        });
        var areaOfNewSpace = {
            maxLngWrite: targServer.maxLngWrite,
            maxLatWrite: targServer.maxLatWrite
        };

        if ((targServer.maxLatWrite - targServer.minLatWrite) > (targServer.maxLngWrite - targServer.minLngWrite)) {
            var middleLat = (targServer.maxLatWrite + targServer.minLatWrite) / 2;
            var areaOfNewSpace = {
                minLngWrite: targServer.minLngWrite,
                maxLngWrite: targServer.maxLngWrite,
                minLatWrite: middleLat,
                maxLatWrite: targServer.maxLatWrite
            };
            targServer.maxLatWrite = middleLat;
        } else {
            var middleLng = (targServer.maxLngWrite + targServer.minLngWrite) / 2;
            var areaOfNewSpace = {
                minLngWrite: middleLng,
                maxLngWrite: targServer.maxLngWrite,
                minLatWrite: targServer.minLatWrite,
                maxLatWrite: targServer.maxLatWrite
            };
            targServer.maxLngWrite = middleLng;
        }
        areaOfNewSpace.minLngRead = areaOfNewSpace.minLngWrite;
        areaOfNewSpace.maxLngRead = areaOfNewSpace.maxLngWrite;
        areaOfNewSpace.minLatRead = areaOfNewSpace.minLatWrite;
        areaOfNewSpace.maxLatRead = areaOfNewSpace.maxLatWrite;
        resizeServer(targServer, function () {
            onSuccess(areaOfNewSpace);
        });
    }

    otherServers.forEach(function (server) {
        locationUtils.splitAtLatitude(blockVals, blockLats, server.minLatWrite);
        locationUtils.splitAtLatitude(blockVals, blockLats, server.maxLatWrite);
        locationUtils.splitAtLongitude(blockVals, blockLngs, server.minLngWrite);
        locationUtils.splitAtLongitude(blockVals, blockLngs, server.maxLngWrite);
        locationUtils.fillRange(blockVals, blockLngs, blockLats, server.minLngWrite,
            server.maxLngWrite, server.minLatWrite,
            server.maxLatWrite, FILL_VAL);
    });

    var serverArea = locationUtils.getLargestArea(blockVals, blockLngs, blockLats, FILL_VAL);
    if (serverArea.area === 0) {
        // if there are no open spaces split a server to create one
        splitLargestServerArea(otherServers, function (resultingArea) {
            Object.assign(newServer, resultingArea);
            onServerLocationUpdate(newServer);
        });
    } else {
        newServer.maxLatWrite = serverArea.maxLat;
        newServer.minLatWrite = serverArea.minLat;
        newServer.maxLngWrite = serverArea.maxLng;
        newServer.minLngWrite = serverArea.minLng;
        newServer.maxLatRead = serverArea.maxLat;
        newServer.minLatRead = serverArea.minLat;
        newServer.maxLngRead = serverArea.maxLng;
        newServer.minLngRead = serverArea.minLng;
        onServerLocationUpdate(newServer);
    }
}

module.exports = (nServerInfoModel) => {
    serverInfoModel = nServerInfoModel;

    return {
        removeServerInfo: removeServerInfo,
        getAllServerInfo: getAllServerInfo,
        recalculateServerRanges: recalculateServerRanges,
        resizeServer: resizeServer,
        addServerInfo: addServerInfo
    }
}