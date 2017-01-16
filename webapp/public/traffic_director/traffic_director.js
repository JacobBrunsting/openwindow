module.exports = function(app) {
    redirectRequest = function(path, req, res, targLocation) {
        // This function should be called by every location-based call in the
        // webapp.js file, and should redirect the call to the correct database
    }

    app.post('/api/router/test', function(req, res) {
        console.log("test");
    });
};
