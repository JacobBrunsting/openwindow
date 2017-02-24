// ============== Imports ===============

var config = require('../../config');
var geolib = require('geolib');
var request = require('request');
var locationUtils = require('./server_location_utils');

// ============== Settings ==============

var SERVERS_INFO_COLLECTION_KEY = 'serversInfoCollection';
var SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY = 'secondsBetweenServerSizeCalculations';

var settings = {};
settings[SERVERS_INFO_COLLECTION_KEY] = 'ServersInfo';
settings[SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY] = 20;

for (var key in settings) {
    if (config[key]) {
        settings[key] = config[key];
    } else {
        console.log(key + " not set in config file, defaulting to " + settings[key]);
    }
}

// ============= Constants ==============

var SERVER_INFO_MODEL_NAME = 'ServerInfo';

// ============== Exports ===============

module.exports = function (app, mongoose) {
    // We have seperate longitudes for reading and writting because when we get
    // a new server, we want to send posts from some geographical area to it.
    // To avoid having to move over all the posts from the server currently 
    // serving that area to the new server, we continue reading posts from the
    // old server, and write new ones to the new server until all the posts from
    // that area have been removed from the old server, meaning we can restrict
    // the read distance further.
    // TODO: Resize the 'read' area to match the current posts on the server
    // periodically
    var serverInfoSchema = mongoose.Schema({
        baseAddress: {
            type: String,
            required: true
        },
        maxLatWrite: {
            type: Number,
            required: true
        },
        minLatWrite: {
            type: Number,
            required: true
        },
        maxLngWrite: {
            type: Number,
            required: true
        },
        minLngWrite: {
            type: Number,
            required: true
        },
        maxLatRead: {
            type: Number,
            required: true
        },
        minLatRead: {
            type: Number,
            required: true
        },
        maxLngRead: {
            type: Number,
            required: true
        },
        minLngRead: {
            type: Number,
            required: true
        }
    }, {
        collection: settings[SERVERS_INFO_COLLECTION_KEY]
    });

    var serverInfoModel = mongoose.model(SERVER_INFO_MODEL_NAME, serverInfoSchema);

    // ====== Server Range Calculations ======

    setInterval(function () {
        serverInfoModel
            .find()
            .then(
                function (servers) {
                    servers.forEach(function (server) {
                        recalculateServerRanges(server);
                    });
                },
                function (err) {
                    console.log("traffic_director:server range calculations:" + err);
                }
            );
    }, 1000 * settings[SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY]);

    function recalculateServerRanges(server) {
        var addr = server.baseAddress;
        var url = "http://" + addr + "/api/getpostrange";
        var requestParams = {
            url: url,
            method: 'GET',
            json: true
        };
        request(requestParams, function (err, res) {
            if (err) {
                console.log("traffic_director:recalculateServerRanges:" + err);
                return;
            } else if (!res) {
                console.log("traffic_director:recalculateServerRanges:empty response");
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

    /**
     * Get the search query that should be used to find the servers the request 
     * should be routed to
     * targLoc ({longitude, latitude}): The center of the search range
     * targRad (Number):                The search radius in meters
     * returns: An object that should be passed to the 'find' function of a 
     *          mongoose query
     */
    function getServerSearchQuery(targLoc, targRad) {
        if (!targRad || targRad == 0) {
            console.log("returning empty serach uery");
            return {};
        }
        var lat = Number(targLoc.latitude);
        var lng = Number(targLoc.longitude);
        var oneLatDegInMeters = Math.cos(lat * Math.PI / 180) * 111000;
        var oneLngDegInMeters = Math.cos(lng * Math.PI / 180) * 111000;

        if (oneLatDegInMeters > 0) {
            var locationRadInLatDeg = Number(targRad) / oneLatDegInMeters;
            var minValidMaxLat = lat - locationRadInLatDeg;
            var maxValidMinLat = lat + locationRadInLatDeg;
        } else {
            var minValidMaxLat = -90;
            var maxValidMinLat = 90;
        }
        if (oneLngDegInMeters > 0) {
            var locationRadInLngDeg = Number(targRad) / oneLngDegInMeters;
            var minValidMaxLng = lng - locationRadInLngDeg;
            var maxValidMinLng = lng + locationRadInLngDeg;
        } else {
            var minValidMaxLat = -180;
            var maxValidMinLng = 180;
        }
        // we add latitude to the query immediately, but not longitude, because
        // longitude wraps around from -180 to 180
        var query = {
            $and: [{
                    maxLatRead: {
                        $gte: minValidMaxLat
                    }
                },
                {
                    minLatRead: {
                        $lte: maxValidMinLat
                    }
                }
            ]
        };
        if (minValidMaxLng < -180) {
            query.$and.push({
                $or: [{
                        maxLngRead: {
                            $gte: -180
                        }
                    },
                    {
                        maxLngRead: {
                            $gte: minValidMaxLng + 180
                        }
                    }
                ]
            });
        } else {
            query.$and.push({
                maxLngRead: {
                    $gte: minValidMaxLng
                }
            });
        }
        if (maxValidMinLng > 180) {
            query.$and.push({
                $or: [{
                        minLngRead: {
                            $lte: 180
                        }
                    },
                    {
                        minLngRead: {
                            $lte: maxValidMinLng - 360
                        }
                    }
                ]
            });
        } else {
            query.$and.push({
                minLngRead: {
                    $lte: maxValidMinLng
                }
            });
        }
        return query;
    }

    /**
     * Makes and merges a request to a list of servers
     * req:     The mongoose request
     * res:     The mongoose response
     * servers: A list of Objects which each have the address of a server stored in
     *          the baseAddress property
     */
    function sendRequestToServers(req, res, servers) {
        var numCallsRemaining = servers.length;
        var mergedRspBody = {};
        servers.forEach(function (server) {
            var addr = server.baseAddress;
            var path = req.originalUrl;
            var url = "http://" + addr + path;
            var requestParams = {
                url: url,
                method: req.method,
                body: req.body,
                json: true
            };
            request(requestParams, function (err, reqRes) {
                numCallsRemaining -= 1;
                if (err) {
                    console.log("traffic_director:redirectRequest:" + err);
                } else {
                    // This only does a shallow merge, and isn't supported by
                    // older versions of IE, so you should look varo changing
                    // potentially
                    Object.assign(mergedRspBody, reqRes.body);
                }
                if (numCallsRemaining === 0) {
                    res.json({
                        statusCode: 200,
                        body: mergedRspBody
                    });
                }
            });
        });
    }

    // You may find yourself wondering if this function is efficient. The answer is
    // no, it is most definitely not, but it's very rarely called, since servers 
    // aren't added very often, so I'm not too worried about it
    // TODO: Use promise instead of callback
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
                    console.log("traffic_director:replaceServer:" + err);
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
            var url = "http://" + serverToMerge.baseAddress + "/api/allsiteposts";
            request.get(url, function (err, res) {
                if (err) {
                    console.log("traffic_director:mergeServers:" + err);
                    return;
                } else if (!res) {
                    console.log("traffic_director:mergeServers:empty response");
                    return;
                }
                var posts = res.body;
                var url = "http://" + serverToMergeWith.baseAddress + "/api/posts";
                request.post(url, function (err, res) {
                    if (err) {
                        console.log("traffic_director:mergeServers:" + err);
                    }
                });
            });
        }
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
        serverInfoModel.findByIdAndUpdate({
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
                    console.log("traffic_director:resizeServer:" + err);
                } else {
                    if (onSuccess) {
                        onSuccess();
                    }
                }
            });
    }

    function redirectRequest(req, res, targLoc, targRad) {
        var query = getServerSearchQuery(targLoc, targRad);
        serverInfoModel
            .find(query)
            .then(
                function (servers) {
                    sendRequestToServers(req, res, servers);
                },
                function (err) {
                    console.log("traffic_director:redirectRequest:" + err);
                }
            );
    }

    // req.body must be of form {baseAddress:Number}
    function addServerInfo(req, res) {
        var newServer = req.body;
        console.log("request body is:");
        console.log(JSON.stringify(req.body));
        // TODO: Refactor so this isn't so nested
        serverInfoModel
            .find({})
            .then(
                function (servers) {
                    setupServerLocation(newServer, servers, function (newServerWithLocation) {
                        console.log("traffic_director:adding server" + JSON.stringify(newServerWithLocation));
                        serverInfoModel
                            .create(newServerWithLocation)
                            .then(
                                function (reqRes) {
                                    // TODO: Setup backup stuff
                                    res.json({
                                        backupAddr: "asdf"
                                    });
                                },
                                function (err) {
                                    console.log("traffic_director:addServerInfo(1):" + err);
                                    res.status(500).send();
                                }
                            );
                    });
                },
                function (err) {
                    console.log("traffic_director:addServerInfo(2):" + err);
                }
            );
    }

    function removeServerInfo(req, res) {
        var baseAddress = req.query.baseAddress;
        serverInfoModel
            .findOneAndRemove({
                baseAddress: baseAddress
            })
            .then(function (server) {
                    if (!server) {
                        console.log("traffic_director:removeServerInfo:Could not find the server to remove")
                        return;
                    }
                    replaceServer(server);
                    res.status(200).send();
                },
                function (err) {
                    console.log("traffic_director:removeServerInfo:" + err);
                    res.status(500).send();
                }
            );
    }

    function getAllServerInfo(req, res) {
        serverInfoModel
            .find()
            .then(
                function (servers) {
                    res.json(servers);
                },
                function (err) {
                    console.log("traffic_director:getAllServerInfo:" + err);
                    res.status(500).send();
                }
            )
    }

    return {
        redirectRequest: redirectRequest,
        addServerInfo: addServerInfo,
        removeServerInfo: removeServerInfo,
        getAllServerInfo: getAllServerInfo
    };
};