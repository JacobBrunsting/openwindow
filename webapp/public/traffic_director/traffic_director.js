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
    
    return {
        redirectRequest: function(req, res, targLocation, locationRadius) {
            // find all servers where targLocation is not more than locationRadius
            // outside of the server longitude/latitude range
            // this will get more servers than neccesary in some cases, but that
            // won't cause any problems, just might cause a few extra requests
            var minValidMaxLat = targLocation.latitude - locationRadius;
            var maxValidMinLat = targLocation.latitude + locationRadius;
            var minValidMaxLng = targLocation.longitude - locationRadius;
            var maxValidMinLng = targLocation.longitude + locationRadius;
            var mergedRspBody = {};
            serverInfoModel.find({$and:[
                                        {maxLat: {$gte:minValidMaxLat}},
                                        {minLat: {$lte:maxValidMinLat}},
                                        {maxLng: {$gte:minValidMaxLng}},
                                        {minLng: {$lte:maxValidMinLng}}
                                       ]})
                            .then(function(servers) {
                                      var numCallsRemaining = servers.length;
                                      servers.forEach(function(server) {
                                          var addr = server.baseAddress; 
                                          var path = req.originalUrl;
                                          var url = "http://" + addr + path;
                                          request(url, {json: req.body},
                                                  function(err, reqRes) {
                                                      numCallsRemaining -= 1;
                                                      if (err) {
                                                          console.log("error was " + err);
                                                      } else {
                                                          console.log("Merged response is " + JSON.stringify(mergedRspBody));
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
                                      console.log("error was " + err);
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
