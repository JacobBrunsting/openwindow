
// ============== Imports ===============

var config = require('../../config');
var geolib = require('geolib');
var request = require('request');

// ============== Settings ==============

var serversInfoCollectionName = 'ServersInfo';
var SERVERS_INFO_COLLECTION_KEY = 'serversInfoCollection';
if (config[SERVERS_INFO_COLLECTION_KEY]) {
    serversInfoCollectionName = config[SERVERS_INFO_COLLECTION_KEY];
} else {
    console.log(SERVERS_INFO_COLLECTION_KEY + " not set in config file, defaulting to " + serversInfoCollectionName);
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
        baseAddress: {type: String, required: true},
        maxLatWrite: {type: Number, required: true},
        minLatWrite: {type: Number, required: true},
        maxLngWrite: {type: Number, required: true},
        minLngWrite: {type: Number, required: true},
        maxLatRead: {type: Number, required: true},
        minLatRead: {type: Number, required: true},
        maxLngRead: {type: Number, required: true},
        minLngRead: {type: Number, required: true}
    }, {collection: serversInfoCollectionName});

    var serverInfoModel = mongoose.model(SERVER_INFO_MODEL_NAME, serverInfoSchema);

    /**
     * Get the search query that should be used to find the servers the request 
     * should be routed to
     * targLoc ({longitude, latitude}): The center of the search range
     * targRad (Number):                The search radius in meters
     * returns: An object that should be passed to the 'find' function of a 
     *          mongoose query
     */
    function getServerSearchQuery(targLoc, targRad) {
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
        var query = {$and: [{maxLatRead: {$gte: minValidMaxLat}},
                {minLatRead: {$lte: maxValidMinLat}}]};
        if (minValidMaxLng < -180) {
            query.$and.push({
                $or: [{maxLngRead: {$gte: -180}},
                    {maxLngRead: {$gte: minValidMaxLng + 180}}]
            });
        } else {
            query.$and.push({maxLngRead: {$gte: minValidMaxLng}});
        }
        if (maxValidMinLng > 180) {
            query.$and.push({
                $or: [{minLngRead: {$lte: 180}},
                    {minLngRead: {$lte: maxValidMinLng - 360}}]
            });
        } else {
            query.$and.push({minLngRead: {$lte: maxValidMinLng}});
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
                    console.log("traffic_director.js:redirectRequest:" + err);
                } else {
                    // This only does a shallow merge, and isn't supported by
                    // older versions of IE, so you should look varo changing
                    // potentially
                    Object.assign(mergedRspBody, reqRes.body);
                }
                if (numCallsRemaining === 0) {
                    res.json({statusCode: 200, body: mergedRspBody});
                }
            });
        });
    }

    // You may find yourself wondering if this function is efficient. The answer is
    // no, it is most definitely not, but it's very rarely called, since servers 
    // aren't added very often, so I'm not too worried about it
    function setupServerLocation(newServer, otherServers, onServerLocationUpdate) {
        var FILL_VAL = 1;
        var EMPTY_VAL = 0;

        var blockLngs = [-180, 180];  // width of a chunk of the world in degrees longitude
        var blockLats = [-90, 90]; // height of a chunk of the world in degrees latitude
        var blockVals = [[EMPTY_VAL]];  // 1 for a covered block, 0 for a uncovered one
        // first index lat, next is lng

        // returns the index of insertion, or -1 if it was not inserted
        function insertEntryInOrderNoDuplicates(arr, val) {
            for (var splitIndex = 0; splitIndex < arr.length; ++splitIndex) {
                if (arr[splitIndex] >= val) {
                    break;
                }
            }
            if (arr[splitIndex] === val) {
                return -1;
            } else {
                arr.splice(splitIndex, 0, val);
                return splitIndex;
            }
        }

        function splitAtLatitude(latitude) {
            var insertionIndex = insertEntryInOrderNoDuplicates(blockLats, latitude);
            if (insertionIndex !== -1) {
                // the '.slice()' ensures we get a copy of the array, not a reference to it
                blockVals.splice(insertionIndex, 0, blockVals[insertionIndex - 1].slice());
            }
        }

        function splitAtLongitude(longitude) {
            var insertionIndex = insertEntryInOrderNoDuplicates(blockLngs, longitude);
            if (insertionIndex !== -1) {
                for (var i = 0; i < blockVals.length; ++i) {
                    blockVals[i].splice(insertionIndex, 0, blockVals[i][insertionIndex - 1]);
                }
            }
        }

        function fillRange(minLng, maxLng, minLat, maxLat, fillVal) {
            var minLatIndex = -1;
            var maxLatIndex = -1;
            for (var i = 0; i < blockLats.length; ++i) {
                if (minLatIndex === -1 && minLat <= blockLats[i]) {
                    minLatIndex = i;
                } else if (maxLatIndex === -1 && maxLat <= blockLats[i]) {
                    maxLatIndex = i - 1;
                }
            }

            var minLngIndex = -1;
            var maxLngIndex = -1;
            for (var i = 0; i < blockLngs.length; ++i) {
                if (minLngIndex === -1 && minLng <= blockLngs[i]) {
                    minLngIndex = i;
                } else if (maxLngIndex === -1 && maxLng <= blockLngs[i]) {
                    maxLngIndex = i - 1;
                }
            }
            for (var lat = minLatIndex; lat <= maxLatIndex; ++lat) {
                for (var lng = minLngIndex; lng <= maxLngIndex; ++lng) {
                    blockVals[lat][lng] = fillVal;
                }
            }
        }

        function bottomPerimeterContainsVal(targVal, r1, c1, r2, c2) {
            for (var c = c1; c <= c2; ++c) {
                if (blockVals[r2][c] === targVal) {
                    return true;
                }
            }
            for (var r = r1; r <= r2; ++r) {
                if (blockVals[r][c2] === targVal) {
                    return true;
                }
            }
            return false;
        }

        // TODO: Clean up this mess, stop using 'r' and 'c', us 'lng' and 'lat'
        function calculateSquareArea(r1, c1, r2, c2) {
            return (blockLngs[c2 + 1] - blockLngs[c1]) * (blockLats[r2 + 1] - blockLats[r1]);
        }

        // returns {minLng, maxLng, minLat, maxLat}
        function getLargestRectangleInfoFromCoord(row, col) {
            var largestRectangleInfo = {
                area: 0,
                minLng: 0,
                maxLng: 0,
                minLat: 0,
                maxLat: 0
            };
            for (var h = 0; row + h < blockVals.length; ++h) {
                for (var w = 0; col + w < blockVals[0].length; ++w) {
                    var area = calculateSquareArea(row, col, row + h, col + w);
                    if (bottomPerimeterContainsVal(FILL_VAL, row, col, row + h, col + w)) {
                        break;
                    }
                    if (area > largestRectangleInfo.area) {
                        largestRectangleInfo = {
                            area: area,
                            minLng: blockLngs[col],
                            maxLng: blockLngs[col + w + 1],
                            minLat: blockLats[row],
                            maxLat: blockLats[row + h + 1]
                        };
                    }
                }
            }
            return largestRectangleInfo;
        }

        // returns {minLng, maxLng, minLat, maxLat}
        function getLargestArea() {
            var currentLargestAreaParams = {
                area: 0,
                minLng: 0,
                maxLng: 0,
                minLat: 0,
                maxLat: 0
            };
            for (var r = 0; r < blockVals.length; ++r) {
                for (var c = 0; c < blockVals[0].length; ++c) {
                    if (blockVals[r][c] !== FILL_VAL) {
                        var rectangleInfo = getLargestRectangleInfoFromCoord(r, c);
                        if (rectangleInfo.area > currentLargestAreaParams.area) {
                            currentLargestAreaParams = rectangleInfo;
                        }
                    }
                }
            }
            return currentLargestAreaParams;
        }

        // on success should take an area object representing the area removed from the server
        // TODO: Create function to get area object
        function splitLargestServerArea(servers, onSuccess) {
            var largestArea = 0;
            var targServer = {};
            servers.forEach(function (server) {
                var area = (server.maxLatWrite - server.minLatWrite) * (server.maxLngWrite - server.maxLngWrite);
                if (area > largestArea) {
                    largestArea = area;
                }
                targServer = server;
            });

            var areaOfNewSpace = {
                maxLngWrite: targServer.maxLngWrite,
                maxLatWrite: targServer.maxLatWrite
            };

            if ((targServer.maxLatWrite - targServer.minLatWrite) > (targServer.maxLngWrite - targServer.minLngWrite)) {
                var middleLat = (targServer.maxLatWrite + targServer.minLatWrite) / 2;
                var areaOfNewSpace = {
                    minLngWrite:targServer.minLngWrite,
                    maxLngWrite:targServer.maxLngWrite,
                    minLatWrite:middleLat,
                    maxLatWrite:targServer.maxLatWrite
                };
                targServer.maxLatWrite = middleLat;
            } else {
                var middleLng = (targServer.maxLngWrite + targServer.minLngWrite) / 2;
                var areaOfNewSpace = {
                    minLngWrite:middleLng,
                    maxLngWrite:targServer.maxLngWrite,
                    minLatWrite:targServer.minLatWrite,
                    maxLatWrite:targServer.maxLatWrite
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
            splitAtLatitude(server.minLatWrite);
            splitAtLatitude(server.maxLatWrite);
            splitAtLongitude(server.minLngWrite);
            splitAtLongitude(server.maxLngWrite);
            fillRange(server.minLngWrite, server.maxLngWrite,
                    server.minLatWrite, server.maxLatWrite, FILL_VAL);
        });
        console.log(JSON.stringify(blockLngs));
        for (var r = 0; r < blockVals.length; ++r) {
            console.log(blockLats[r] + ":" + JSON.stringify(blockVals[r]));
        }
        console.log(blockLats[blockLats.length - 1]);

        var serverArea = getLargestArea();
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

    function resizeServer(newServer, onSuccess) {
        serverInfoModel.findByIdAndUpdate(
                {_id: newServer._id},
                {$set: {
                        maxLatWrite: newServer.maxLatWrite,
                        minLatWrite: newServer.minLatWrite,
                        maxLngWrite: newServer.maxLngWrite,
                        minLngWrite: newServer.minLngWrite,
                        maxLatRead: newServer.maxLatRead,
                        minLatRead: newServer.minLatRead,
                        maxLngRead: newServer.maxLngRead,
                        minLngRead: newServer.minLngRead
                    }},
                {new : true},
                function (err, data) {
                    if (!err) {
                        onSuccess();
                    }
                });
    }

    function redirectRequest(req, res, targLoc, targRad) {
        var query = getServerSearchQuery(targLoc, targRad);
        console.log("query is " + JSON.stringify(query));
        serverInfoModel
                .find(query)
                .then(
                        function (servers) {
                            sendRequestToServers(req, res, servers);
                        },
                        function (err) {
                            console.log("traffic_director.js:redirectRequest:" + err);
                        }
                );
    }

    // req.body must be of form {baseAddress:Number}
    function addServerInfo(req, res) {
        var newServer = req.body;
        console.log("request body is:");
        console.log(JSON.stringify(req.body));
        serverInfoModel
            .find({})
            .then(
                function (servers) {
                    setupServerLocation(newServer, servers, function (newServerWithLocation) {
                        console.log("adding server " + JSON.stringify(newServerWithLocation));
                        serverInfoModel
                            .create(newServerWithLocation)
                            .then(
                                function (reqRes) {
                                    // TODO: Setup backup stuff
                                    res.json({backupAddr:"asdf"});
                                },
                                function (err) {
                                    console.log("traffic_director.js:addServerInfo(1):" + err);
                                    res.status(500).send();
                                }
                            );
                        }
                    );
                },
                function (err) {
                    console.log("traffic_director.js:addServerInfo(2):" + err);
                }
            );
    }

    function removeServerInfo(req, res) {
        var baseAddress = req.baseAddress;
        serverInfoModel
                .find({baseAddress: baseAddress})
                .remove(function (err, data) {
                    if (err || data === null) {
                        res.status(400).send();
                    } else {
                        res.json(data);
                    }
                });
    }

    return {
        redirectRequest: redirectRequest,
        addServerInfo: addServerInfo,
        removeServerInfo: removeServerInfo
    };
};
