/**
 * @file Provides functions to add and remove database servers from the network,
 * and redirect requests to the correct server based on the location the request
 * originates from
 */

var ServerInfo = require('./classes/server_info');

var SERVER_INFO_MODEL_NAME = 'ServerInfo';

module.exports = (app, mongoose, serverInfoCollectionName) => {
    // We have seperate longitudes for reading and writting because when we get
    // a new server, we want to send posts from some geographical area to it.
    // To avoid having to move over all the posts from the server currently 
    // serving that area to the new server, we continue reading posts from the
    // old server, and write new ones to the new server until all the posts from
    // that area have been removed from the old server, meaning we can restrict
    // the read distance further.
    var serverInfoSchema = mongoose.Schema(ServerInfo.getStructure(), {
        collection: serverInfoCollectionName
    });

    var serverInfoModel = mongoose.model(SERVER_INFO_MODEL_NAME, serverInfoSchema);

    var requestRedirector = require('./request_redirector')(serverInfoModel);
    var serverManager = require('./server_manager')(serverInfoModel);

    return {
        redirectRequest: requestRedirector.redirectRequest,
        addServerInfo: serverManager.addServerInfo,
        removeServerInfo: serverManager.removeServerInfo,
        getAllServerInfo: serverManager.getAllServerInfo,
        recalculateServersRanges: serverManager.recalculateServersRanges
    };
};