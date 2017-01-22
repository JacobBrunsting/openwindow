var request = require('request');
var util = require('util');

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

    return {
        redirectRequest: function(req, res, targLocation, locationRadius) {
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
            }
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
        }
    }
};
