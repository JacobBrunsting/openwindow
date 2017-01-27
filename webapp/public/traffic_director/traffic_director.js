var request = require('request');
var util = require('util');
var geolib = require('geolib');

var SERVER_INFO_COLLECTION_NAME = "ServerInfoDatabase";

module.exports = function(app, mongoose) {
    var serverInfoSchema = mongoose.Schema({
        baseAddress:  {type:String, required:true},
        maxLongitude: {type:Number, required:true},
        minLongitude: {type:Number, required:true},
        maxLatitude:  {type:Number, required:true},
        minLatitude:  {type:Number, required:true}
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

    return {
        redirectRequest: function(req, res, targLocation, locationRadius) {
            serverInfoSchema.find()
                            .where(function() {
                                       var topRightCoord = getCoord(this.maxLatitude, this.maxLongitude);
                                       var bottomLeftCoord = getCoord(this.minLatitude, this.minLongitude);
                                       if (coordInsideSquare()) {
                                           return true;
                                       }
                                       if (getDistToSquare(targLocation, topRightCoord, bottoLeftCoord) <= locationRadius) {
                                           return true;
                                       }
                                       return false;
                                   })
                            .then(function(reqRes) {
                                  },
                                  function(err) {
                                  });
        },



                /*
            // TODO: Replace 'localhost' with target server based on location
            console.log("radius is " + locationRadius);
            var path = req.originalUrl;
            console.log("redirecting request " + path);
            if (req.method == 'GET') {
                request.get('http://localhost:3000' + path, 
                             {json: req.body}, 
                             function(err, reqRes) {
                    if (err) {
                        console.log("error was " + err);
                        res.status(500).send();
                    } else if (reqRes == undefined) {
                        console.log("undefined response");
                    } else {
                        res.json(reqRes);
                    }
                });
            } else if (req.method == 'POST') {
                request.post('http://localhost:3000' + path, 
                             {json: req.body}, 
                             function(err, reqRes) {
                    if (err) {
                        console.log("error was " + err);
                        res.status(500).send();
                    } else if (reqRes == undefined) {
                        console.log("undefined response");
                    } else {
                        res.json(reqRes);
                    }
                });
            }*/
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
                                 
};
