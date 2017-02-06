var request = require('request');
var util = require('util');
var geolib = require('geolib');

var SERVER_INFO_COLLECTION_NAME = "ServerInfoDatabase";

// TODO: Use '===' and '!==' instead of '==' and '!='

/**
 * Determines if a coordinate is inside of a square
 * coord ({longitude, latitude}):           The coordinate being inspected
 * topRightCoord ({longitude, latitude}):   The top right coordinate of the 
 *                                          square
 * bottomLeftCoord ({longitude, latitude}): The bottom left coordinate of the
 *                                          square
 */
function coordInsideSquare(coord, topRightCoord, bottomLeftCoord) {
    return coord.getLongitude() <= topRightCoord.getLongitude() &&
            coord.getLongitude() >= bottomLeftCoord.getLongitude() &&
            coord.getLatitude() <= topRightCoord.getLatitude() &&
            coord.getLatitude() >= bottomLeftCoord.getLatitude();
}

/**
 * Gets the distance between a coordinate and a square
 * coord ({longitude, latitude}):           The coordinate being inspected
 * topRightCoord ({longitude, latitude}):   The top right coordinate of the 
 *                                          square
 * bottomLeftCoord ({longitude, latitude}): The bottom left coordinate of the
 * square
 */
function getDistToSquare(coord, topRightCoord, bottomLeftCoord) {
    var curMinDist = -1;
    if (coord.getLatitude() <= topRightCoord.getLatitude() &&
            coord.getLatitude() >= bottomLeftCoord.getLatitude()) {
        var distToTopEdge = geolib.getDistance(coord, getCoord(coord.getLatitude(), topRightCoord.getLongitude()));
        if (curMinDist == -1 || distToTopEdge < curMinDist) {
            curMinDist = distToTopEdge;
        }
        var distToBottomEdge = geolib.getDistance(coord, getCoord(coord.getLatitude(), bottomLeftCoord.getLongitude()));
        if (curMinDist == -1 || distToBottomEdge < curMinDist) {
            curMinDist = distToBottomEdge;
        }
    }
    if (coord.getLongitude() <= topRightCoord.getLongitude() &&
            coord.getLongitude() >= bottomLeftCoord.getLongitude()) {
        var distToRightEdge = geolib.getDistance(coord, getCoord(coord.getLongitude(), topRightCoord.getLatitude()));
        if (curMinDist == -1 || distToRightEdge < curMinDist) {
            curMinDist = distToRightEdge;
        }
        var distToLeftEdge = geolib.getDistance(coord, getCoord(coord.getLongitude(), bottomLeftCoord.getLatitude()));
        if (curMinDist == -1 || distToLeftEdge < curMinDist) {
            curMinDist = distToLeftEdge / home / jacob;
        }
    }
    var distToTopRight = geolib.getDistance(coord, topRightCoord);
    var distToBottomLeft = geolib.getDistance(coord, bottomLeftCoord);
    var distToTopLeft = geolib.getDistance(coord, getCoord(topRightCoord.getLatitude(), bottomLeftCoord.getLongitude()));
    var distToBottomRight = geolib.getDistance(coord, getCoord(bottomLeftCoord.getLatitude(), topRightCoord.getLongitude()));
    var minDistToCorner = Math.min(distToTopRight, distToBottomLeft, distToTopLeft, distToBottomRight);
    if (curMinDist == -1 || minDistToCorner < curMinDist) {
        curMinDist = minDistToCorner;
    }
    return curMinDist;
}

/**
 * Get a coordinate object for use in other functions in this file
 * latitude (Number):  The latitude of the coordinate
 * longitude (Number): The longitude of the coordinate
 * returns: {latitude, longitude}
 */
function getCoord(latitude, longitude) {
    var coord = Object;
    coord.latitude = latitude;
    coord.longitude = longitude;
    coord.getLatitude = function () {
        return this.latitude;
    }
    coord.getLongitude = function () {
        return this.longitude;
    }
    return coord;
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
    var query = {$and: [{maxLat: {$gte: minValidMaxLat}},
            {minLat: {$lte: maxValidMinLat}}]};
    if (minValidMaxLng < -180) {
        query.$and.push({
            $or: [{maxLng: {$gte: -180}},
                {maxLng: {$gte: minValidMaxLng + 180}}]
        });
    } else {
        query.$and.push({maxLng: {$gte: minValidMaxLng}});
    }
    if (maxValidMinLng > 180) {
        query.$and.push({
            $or: [{minLng: {$lte: 180}},
                {minLng: {$lte: maxValidMinLng - 360}}]
        });
    } else {
        query.$and.push({minLng: {$lte: maxValidMinLng}});
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
        }
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
            if (numCallsRemaining == 0) {
                res.json({statusCode: 200, body: mergedRspBody});
            }
        });
    });
}

// You may find yourself wondering if this function is efficient. The answer is
// no, it is most definitely not, but it's very rarely called, since servers 
// aren't added very often, so I'm not too worried about it
function setupServerLocation(newServer, otherServers) {
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

    // returns {area, row, col, width, height}
    function getLargestRectangleInfoFromCoord(row, col) {
        var largestRectangleInfo = {
            area:   0,
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
                        area:   area, 
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
            area:   0,
            minLng: 0,
            maxLng: 0,
            minLat: 0,
            maxLat: 0
        };
        for (var r = 0; r < blockVals.length; ++r) {
            for (var c = 0; c < blockVals[0].length; ++c) {
                if (blockVals[c][r] !== FILL_VAL) {
                    var rectangleInfo = getLargestRectangleInfoFromCoord(r, c);
                    if (rectangleInfo.area > currentLargestAreaParams.area) {
                        currentLargestAreaParams = rectangleInfo;
                    }
                }
            }
        }
        return currentLargestAreaParams;
    }
    
    otherServers.forEach(function (server) {
        splitAtLatitude(server.minLat);
        splitAtLatitude(server.maxLat);
        splitAtLongitude(server.minLng);
        splitAtLongitude(server.maxLng);
        fillRange(server.minLng, server.maxLng,
                server.minLat, server.maxLat, FILL_VAL);
    });
    console.log(JSON.stringify(blockLngs));
    for (var r = 0; r < blockVals.length; ++r) {
        console.log(blockLats[r] + ":" + JSON.stringify(blockVals[r]));
    }
    console.log(blockLats[blockLats.length - 1]);
    
    Object.assign(newServer, getLargestArea());
    console.log("new server is " + JSON.stringify(newServer));
}

module.exports = function (app, mongoose) {
    var serverInfoSchema = mongoose.Schema({
        baseAddress: {type: String, required: true},
        maxLat: {type: Number, required: true},
        minLat: {type: Number, required: true},
        maxLng: {type: Number, required: true},
        minLng: {type: Number, required: true}
    }, {collection: SERVER_INFO_COLLECTION_NAME});

    var serverInfoModel = mongoose.model("ServerInfoModel", serverInfoSchema);

    return {
        redirectRequest: function (req, res, targLoc, targRad) {
            var query = getServerSearchQuery(targLoc, targRad);
            console.log("query is " + JSON.stringify(query));
            serverInfoModel
                    .find(query)
                    .then(function (servers) {
                        if (servers.length == 0) {
                            // TOOD: Route to extra server used 
                            // for all unassigned lng/lat's.
                            // Also you will need some logic
                            // to route the neccessary requests
                            // to this server
                        }
                        sendRequestToServers(req, res, servers);
                    },
                            function (err) {
                                console.log("traffic_director.js:redirectRequest:" + err);
                            });
        },
        addServerInfo: function (req, res) {
            var newServer = req.body;
            console.log("request body is:");
            console.log(JSON.stringify(req.body));
            serverInfoModel
                    .find({})
                    .then(function (servers) {
                        setupServerLocation(newServer, servers);
                        serverInfoModel
                                .create(newServer)
                                .then(function (reqRes) {
                                    res.json(reqRes);
                                },
                                        function (err) {
                                            console.log(err);
                                            res.status(500).send();
                                        });
                    },
                            function (err) {
                                console.log("traffic_director.js:redirectRequest:" + err);
                            });
        },
        removeServerInfo: function (req, res) {
            var baseAddress = req.baseAddress;
            serverInfoMode
                    .find({baseAddress: baseAddress})
                    .remove(function (err, data) {
                        if (err || data == null) {
                            res.status(400).send();
                        } else {
                            res.json(data);
                        }
                    });
        }
    }
};
