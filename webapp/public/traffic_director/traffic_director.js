var request = require('request');
var util = require('util');
var geolib = require('geolib');

var SERVER_INFO_COLLECTION_NAME = "ServerInfoDatabase";

module.exports = function(app, mongoose) {
    var serverInfoSchema = mongoose.Schema({
        baseAddress:  {type:String, required:true},
        maxLat:       {type:Number, required:true},
        minLat:       {type:Number, required:true},
        maxLng:       {type:Number, required:true},
        minLng:       {type:Number, required:true}
    }, {collection:SERVER_INFO_COLLECTION_NAME});

    var serverInfoModel = mongoose.model("ServerInfoModel", serverInfoSchema); 

    function coordInsideSquare(coord, topRightCoord, bottomLeftCoord) {
        // true if dist to top left is less than right side length and if
        // dist to bottom right is less than 
        return coord.getLongitude() <= topRightCoord.getLongitude() &&
               coord.getLongitude() >= bottomLeftCoord.getLongitude() &&
               coord.getLatitude() <= topRightCoord.getLatitude() &&
               coord.getLatitude() >= bottomLeftCoord.getLatitude();
    }

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

    // gets distance to closest outer edge of square, assuming the coordinate
    // is not inside of the square
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

    function findLargestServerSpace() {
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
    }

    function generateServerInfo(baseAddress) {
        serverInfoModel.find({})
                       .then(function(servers) {
                                 
                             },
                             function(err) {
                                 console.log("traffic_director.js:redirectRequest:" + err);
                             });
    }
    
    return {
        redirectRequest: function(req, res, targLoc, targRad) {
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
            // we add latitude immediately, but not longitude, because 
            // longitude wraps around from -180 to 180
            var query = {$and:[
                                   {maxLat: {$gte:minValidMaxLat}},
                                   {minLat: {$lte:maxValidMinLat}}
                              ]};
            if (minValidMaxLng < -180) {
                query.$and.push({
                    $or:[
                        {maxLng:{$gte:-180}},
                        {maxLng:{$gte:minValidMaxLng + 180}}
                    ]
                });
            } else {
                query.$and.push({maxLng:{$gte:minValidMaxLng}});
            }
            if (maxValidMinLng > 180) {
                query.$and.push({
                    $or:[
                        {minLng:{$lte:180}},
                        {minLng:{$lte:maxValidMinLng - 360}}
                    ]
                });
            } else {
                query.$and.push({minLng:{$lte:maxValidMinLng}});
            }
            var mergedRspBody = {};
            console.log("query is " + JSON.stringify(query));
            serverInfoModel.find(query)
                           .then(function(servers) {
                                     var numCallsRemaining = servers.length;
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
                                         request(requestParams,
                                                 function(err, reqRes) {
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
                                  },
                                  function(err) {
                                      console.log("traffic_director.js:redirectRequest:" + err);
                                  });
        }, 
        addServerInfo: function(req, res) {
            var serverInfo = req.body;
            serverInfoModel.create(serverInfo)
                           .then(function(reqRes) {
                                     res.json(reqRes);
                                 },
                                 function(err) {
                                     console.log(err);
                                     res.status(500).send();
                                 });
        },
        removeServerInfo: function(req, res) {
            var baseAddress = req.baseAddress;
            serverInfoMode.find({baseAddress:baseAddress})
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
