/**
 * @file Provides functions to add and remove database servers from the network,
 * and redirect requests to the correct server based on the location the request
 * originates from
 */

const DatabaseServerInfo = require(__dirname + '/../classes/database_server_info');
const HeartbeatManager = require(__dirname + '/heartbeat_manager');
const ServerInfoWrapper = require(__dirname + '/server_info_wrapper');
const constants = require(__dirname + '/../constants');
const request = require('request');
const log = require(__dirname + '/../utils/log');
const NetworkSyncronizationUtils = require(__dirname + '/../utils/network_syncronization_utils');
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
                url: constants.apiAddress + 'director/allserverinfo?excludeid=true',
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

    /**
     * syncWithNetwork - Validate the database server info with the rest of the
     *  network, and update it if it is incorrect
     * @param {string[]} otherServerAddresses - The addresses of the other
     *  servers in the network used for data validation
     */
    function syncWithNetwork(otherServerAddresses) {
        return NetworkSyncronizationUtils.syncWithNetwork(
                serverInfoModel,
                otherServerAddresses,
                '/director/allserverinfo?excludeid=true',
                'baseAddr')
            .then((res) => {
                if (res === true) {
                    log.bright("successfully synced database server info with network, no changes made");
                    return;
                } else {
                    log.bright("successfully synced database server info with network, new data is " + JSON.stringify(res));
                    serverInfoModel
                        .remove({})
                        .then(() => {
                            serverInfoModel.create(res);
                        })
                }
            })
            .catch((err) => {
                log.err("traffic_director:syncWithNetwork:" + err);
                throw err;
            });
    }

    function startHeartbeat(onServerFailure) {
        log.bright("starting heartbeat");
        HeartbeatManager.startHeartbeat(new ServerInfoWrapper(serverInfoModel), onServerFailure);
    }

    return {
        setupSelf,
        syncWithNetwork,
        startHeartbeat,
        redirectRequest: requestRedirector.redirectRequest,
        generateAndStoreServerInfo: serverManager.generateAndStoreServerInfo,
        removeServerAndAdjust: serverManager.removeServerAndAdjust,
        removeServerInfo: serverManager.removeServerInfo,
        getAllServerInfo: serverManager.getAllServerInfo,
        addServerInfo: serverManager.addServerInfo,
        addServersInfo: serverManager.addServersInfo,
        addAllServerInfo: serverManager.addAllServerInfo,
        updateServerInfo: serverManager.updateServerInfo,
        updateServersInfo: serverManager.updateServersInfo,
        recalculateServersRanges: serverManager.recalculateServersRanges,
    };
};
