var request = require('request');
var util = require('util');
var geolib = require('geolib');

var SERVER_INFO_COLLECTION_NAME = "ServerInfoDatabase";

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
            curMinDist = distToLeftEdge;
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
    coord.getLatitude = function() {
        return this.latitude;
    }
    coord.getLongitude = function() {
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
    var query = {$and:[{maxLat: {$gte:minValidMaxLat}},
                       {minLat: {$lte:maxValidMinLat}}]};
    if (minValidMaxLng < -180) {
        query.$and.push({
            $or:[{maxLng:{$gte:-180}},
                 {maxLng:{$gte:minValidMaxLng + 180}}]
        });
    } else {
        query.$and.push({maxLng:{$gte:minValidMaxLng}});
    }
    if (maxValidMinLng > 180) {
        query.$and.push({
            $or:[{minLng:{$lte:180}},
                 {minLng:{$lte:maxValidMinLng - 360}}]
        });
    } else {
        query.$and.push({minLng:{$lte:maxValidMinLng}});
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
    servers.forEach(function(server) {
        var addr = server.baseAddress;
        var path = req.originalUrl;
        var url = "http://" + addr + path;
        var requestParams = {
            url:url,
            method:req.method,
            body:req.body,
            json:true
        }
        request(requestParams, function(err, reqRes) {
            numCallsRemaining -= 1;
            if (err) {
                console.log("traffic_director.js:redirectRequest:" + err);
            } else {
                // This only does a shallow merge, and isn't supported by
                // older versions of IE, so you should look into changing
                // potentially
                Object.assign(mergedRspBody, reqRes.body);
            }
            if (numCallsRemaining == 0) {
                res.json({statusCode:200, body:mergedRspBody});
            }
        });
    });
}

// You may find yourself wondering if this function is efficient. The answer is
// no, it is most definitely not, but it's very rarely called, since servers 
// aren't added very often, so I'm not too worried about it
function setupServerLocation(newServer, otherServers) {
    const FILL_VAL = 1;
    // one array for longitude, where each entry is a number representing
    // some number of longitude degrees
    // a similar array for latitude
    // A 2d array, with the same 'width' as the length of the longitude
    // array, and the same 'height' as the latitude array
    // 2d array will start out as a 1x1 array, where the only entry in
    // the longitude array is 360, and the only one in the latitude array
    // is 180
    // As you get servers, you divide up the 2d array into cells, where 
    // each cell either is fully covered by a server, or is not at all
    // the 1d arrays record how large these cells are
    // Once you have retrieved all the servers and populated the array,
    // you find the largest empty spot to put the server
    // You probably want a server that covers all uncovered postions
    
    var blockWidths = [];  // width of a chunk of the world in degrees longitude
    var blockHeights = []; // height of a chunk of the world in degrees latitude
    var blockVals = [[]];  // 1 for a covered block, 0 for a uncovered one
    
    // returns true if the split occured, false if the array was already split
    // at that sum
    function splitArrAtSum(arr, targSum) {
        var splitIndex = 0;
        for (; splitIndex < blockWidths.length; ++splitIndex) {
            targSum -= blockWidths[i];
            if (targSum <= 0) {
                break;
            }
        }
        if (targSum == 0) {
            return false;
        } else {
            var oldWidth = blockWidths[splitIndex];
            var newWidth = oldWidth = server.minLng;
            var remainingWidth = oldWidth - newWidth;
            blockWidths.splice(splitIndex, 0, newWidth);
            blockWidths[splitIndex] = remainingWidth;

            return true;
        }
    }
    
    function splitHorizontallyAtSum(targSum) {
        if (splitArrAtSum(blockWidths, targSum)) {
            for (var i = 0; i < blockVals.length; ++i) {
                blockVals[i].splice(splitIndex, 0, blockVals[i][splitIndex]);
            }
        }
    }
    
    function splitVerticallyAtSum(targSum) {
        if (splitArrAtSum(blockHeights, targSum)) {
            for (var i = 0; i < blockVals.length; ++i) {
                blockVals.splice(splitIndex, 0, blockVals[splitIndex]);
            }
        }
    }
    
    function fillRange(minWidthSum, maxWidthSum, minHeightSum, maxHeightSum, fillVal) {
        var maxHeightSumLeft = maxHeightSum;
        var totalHeightFill = maxHeightSum - minHeightSum;
        for (var r = 0; r < blockVals.length; ++r) {
            if (maxHeightSumLeft < 0) {
                // if we have passed the maximum height, continue
                break;
            } else if (maxHeightSumLeft <= totalHeightFill) {
                var maxWidthSumLeft = maxWidthSum;
                var totalWidthFill = maxWidthSum - minWidthSum;
                for (var c = 0; c < blockVals[lng].length; ++c) {
                    if (maxWidthSumLeft < 0) {
                        break;
                    } else if (maxWidthSumLeft <= totalWidthFill) {
                        blockVals[h][c] = FILL_VAL;
                    }
                    maxWidthSumLeft -= blockWidths[c];
                }
            }
            h -= blockHeights[h];
        }
    }
        
    servers.forEach(function(server) {
        splitHorizontallyAtSum(server.minLng + 180);
        splitHorizontallyAtSum(server.maxLng + 180);
        splitVerticallyAtSum(server.minLat + 90);
        splitVerticallyAtSum(server.maxLat + 90);
        fillRange(server.minLng + 180, server.maxLng + 180, 
                  server.minLat + 90, server.maxLat + 90);
        
        // TODO: Here, you should search through the blockVals array to find
        // the largest filled section, and extract the longitude/latitude 
        // vals from that.
    });
}

module.exports = function(app, mongoose) {
    var serverInfoSchema = mongoose.Schema({
        baseAddress:  {type:String, required:true},
        maxLat:       {type:Number, required:true},
        minLat:       {type:Number, required:true},
        maxLng:       {type:Number, required:true},
        minLng:       {type:Number, required:true}
    }, {collection:SERVER_INFO_COLLECTION_NAME});

    var serverInfoModel = mongoose.model("ServerInfoModel", serverInfoSchema); 
    
    return {
        redirectRequest: function(req, res, targLoc, targRad) {
            var query = getServerSearchQuery(targLoc, targRad);
            console.log("query is " + JSON.stringify(query));
            serverInfoModel
                .find(query)
                .then(function(servers) {
                    if (servers.length == 0) {
                        // TOOD: Route to extra server used 
                        // for all unassigned lng/lat's.
                        // Also you will need some logic
                        // to route the neccessary requests
                        // to this server
                     }
                     sendRequestToServers(req, res, servers);
                },
                function(err) {
                    console.log("traffic_director.js:redirectRequest:" + err);
                });
        }, 
        addServerInfo: function(req, res) {
            var newServer = req.body;
            serverInfoModel
                .find({})
                .then(function(servers) {
                    setupServerLocation(servers, newServer);
                    serverInfoModel
                        .create(newServer)
                        .then(function(reqRes) {
                             res.json(reqRes);
                         },
                         function(err) {
                             console.log(err);
                             res.status(500).send();
                         });
                },
                function(err) {
                    console.log("traffic_director.js:redirectRequest:" + err);
                });
        },
        removeServerInfo: function(req, res) {
            var baseAddress = req.baseAddress;
            serverInfoMode
                .find({baseAddress:baseAddress})
                .remove(function(err, data) {
                    if (err || data == null) {
                        res.status(400).send();
                    } else {
                        res.json(data);
                    }
                });
        }
    }                             
};
