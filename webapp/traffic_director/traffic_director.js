/**
 * @file Provides functions to add and remove database servers from the network,
 * and redirect requests to the correct server based on the location the request
 * originates from
 */

const DatabaseServerInfo = require(__dirname + '/../classes/database_server_info');
const constants = require(__dirname + '/../constants');
const request = require('request');

var SERVER_INFO_MODEL_NAME = 'DatabaseServerInfo';

module.exports = (app, mongoose, serverInfoCollectionName) => {
    // We have seperate longitudes for reading and writting because when we get
    // a new server, we want to send posts from some geographical area to it.
    // To avoid having to move over all the posts from the server currently 
    // serving that area to the new server, we continue reading posts from the
    // old server, and write new ones to the new server until all the posts from
    // that area have been removed from the old server, meaning we can restrict
    // the read distance further.
    var serverInfoSchema = mongoose.Schema(DatabaseServerInfo.getStructure(), {
        collection: serverInfoCollectionName
    });

    serverInfoSchema.index({
        baseAddr: 1
    }, {
        unique: true
    });

    var serverInfoModel = mongoose.model(SERVER_INFO_MODEL_NAME, serverInfoSchema);

    var requestRedirector = require(__dirname + '/request_redirector')(serverInfoModel);
    var serverManager = require(__dirname + '/server_manager')(serverInfoModel);

    function setupSelf(isFirstServer) {
        return new Promise((resolve, reject) => {
            if (isFirstServer && isFirstServer === true) {
                resolve();
                return;
            }
            const requestParams = {
                url: constants.apiAddress + 'director/allserverinfo?excludeId=true',
                method: 'GET',
                json: true
            }
            request(requestParams, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    serverManager.addAllServerInfo(res.body)
                        .then(() => {
                            resolve();
                        })
                        .catch((err) => {
                            reject("traffic_director:setupSelf:" + err);
                        });
                }
            });
        });
    }

    return {
        setupSelf,
        redirectRequest: requestRedirector.redirectRequest,
        generateAndStoreServerInfo: serverManager.generateAndStoreServerInfo,
        removeServerInfo: serverManager.removeServerInfo,
        getAllServerInfo: serverManager.getAllServerInfo,
        addServerInfo: serverManager.addServerInfo,
        addAllServerInfo: serverManager.addAllServerInfo,
        recalculateServersRanges: serverManager.recalculateServersRanges
    };
};