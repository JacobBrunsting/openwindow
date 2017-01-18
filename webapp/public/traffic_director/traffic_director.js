var request = require('request');
var util = require('util');
module.exports = function(app) {
    return {
        redirectRequest: function(req, res, targLocation) {
            // TODO: Replace 'localhost' with target server based on location
            var path = req.originalUrl;
            console.log("redirecting request " + path);
            if (req.method == 'GET') {
                request.get('http://localhost:3000' + path, function(err, reqRes) {
                    if (err) {
                        console.log("error was " + err);
                        res.json(err);
                    } else {
                        res.json(JSON.parse(reqRes.body));
                    }
                });
            } else if (req.method == 'POST') {
                request.post('http://localhost:3000' + path, 
                             {json: req.body}, 
                             function(err, reqRes) {
                    if (err) {
                        console.log("error was " + err);
                        res.json(err);
                    } else {
                        console.log("made request response: " + JSON.stringify(reqRes));
                        res.json(reqRes);
                    }
                });
            }
        }
    }
};
