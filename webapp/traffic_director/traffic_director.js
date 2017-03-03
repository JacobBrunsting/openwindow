// ============= Constants ==============

var SERVER_INFO_MODEL_NAME = 'ServerInfo';

module.exports = (app, mongoose, serverInfoCollectionName) => {
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
        // TODO: In all cases, these addresses are just IP's, so rename them to
        // reflect that
        baseAddress: {
            type: String,
            required: true
        },
        backupAddress: {
            type: String,
            required: true,
        },
        maxLatWrite: {
            type: Number,
            required: true
        },
        minLatWrite: {
            type: Number,
            required: true
        },
        maxLngWrite: {
            type: Number,
            required: true
        },
        minLngWrite: {
            type: Number,
            required: true
        },
        maxLatRead: {
            type: Number,
            required: true
        },
        minLatRead: {
            type: Number,
            required: true
        },
        maxLngRead: {
            type: Number,
            required: true
        },
        minLngRead: {
            type: Number,
            required: true
        }
    }, {
        collection: serverInfoCollectionName
    });

    var serverInfoModel = mongoose.model(SERVER_INFO_MODEL_NAME, serverInfoSchema);

    var requestRedirector = require('./request_redirector')(serverInfoModel);
    var serverManager = require('./server_manager')(serverInfoModel);

    function updateServerSizes() {
        serverInfoModel
            .find()
            .then(
                function (servers) {
                    servers.forEach(function (server) {
                        serverManager.recalculateServerRanges(server);
                    });
                },
                function (err) {
                    console.log("traffic_director:server range calculations:" + err);
                }
            );
    }

    return {
        redirectRequest: requestRedirector.redirectRequest,
        addServerInfo: serverManager.addServerInfo,
        removeServerInfo: serverManager.removeServerInfo,
        getAllServerInfo: serverManager.getAllServerInfo,
        updateServerSizes: updateServerSizes
    };
};