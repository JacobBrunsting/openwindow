var request = require('request');
var util = require('util');
module.exports = function(app) {
    return {
        redirectRequest: function(req, res, targLocation) {
            // TODO: Replace 'localhost' with target server based on location
            var path = req.baseUrl;
            request.post('localhost:27017/#/' + path, function(err, reqRes) {
                if (err) {
                    res.json(err);
                } else {
                    res.json(reqRes);
                }
            });
        }
    }
};
