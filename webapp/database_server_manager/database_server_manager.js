/**
 * @file Provides functions to add and remove database servers from the network,
 * and redirect requests to the correct server based on the location the request
 * originates from
 */

const request = require('request-promise');
const DatabaseServerInfo = require(__dirname + '/database_server_info');
const heartbeatManager = require(__dirname + '/heartbeat_manager');
const ServerInfoModelWrapper = require(__dirname + '/server_info_model_wrapper');
const constants = require(__dirname + '/../constants');
const log = require(__dirname + '/../utils/log');
const networkSyncronizationUtils = require(__dirname + '/../utils/network_syncronization_utils');

const SERVER_INFO_MODEL_NAME = 'DatabaseServerInfo';

module.exports = (mongoose, serverInfoCollectionName) => {
    // We have seperate longitudes for reading and writting because when we get
    // a new server, we want to send posts from some geographical area to it.
    // To avoid having to move over all the posts from the server currently 
    // serving that area to the new server, we continue reading posts from the
    // old server, and write new ones to the new server until all the posts from
    // that area have been removed from the old server, meaning we can restrict
    // the read distance further.
    const serverInfoSchema = mongoose.Schema(DatabaseServerInfo.getStructure(), {
        collection: serverInfoCollectionName
    });

    serverInfoSchema.index({
        baseAddr: 1
    }, {
        unique: true
    });

    const serverInfoModel = mongoose.model(SERVER_INFO_MODEL_NAME, serverInfoSchema);
    const serverInfoModelWrapper = new ServerInfoModelWrapper(serverInfoModel);

    const requestRedirector = require(__dirname + '/request_redirector')(serverInfoModelWrapper);
    const serverInfoManager = require(__dirname + '/server_info_manager')(serverInfoModelWrapper);

    function setupSelf(isFirstServer) {
        if (isFirstServer && isFirstServer === true) {
            return serverInfoModel.remove({});
        }
        const requestParams = {
            url: constants.apiAddress + 'director/allserverinfo?excludeid=true',
            method: 'GET',
            json: true
        }
        return serverInfoModel.remove({})
            .then(() => request(requestParams))
            .then(serverInfoManager.addAllServerInfo)
            .catch(err => {
                log.err('database_server_manager:setupSelf:' + err);
                throw err;
            });
    }

    /**
     * syncWithNetwork - Validate the database server info with the rest of the
     *  network, and update it if it is incorrect
     * @param {string[]} otherServerAddresses - The addresses of the other
     *  servers in the network used for data validation
     */
    function syncWithNetwork(otherServerAddresses) {
        return networkSyncronizationUtils.syncWithNetwork(
                serverInfoModel,
                otherServerAddresses,
                '/director/allserverinfo?excludeid=true',
                'baseAddr')
            .then((res) => {
                if (res === true) {
                    log.bright('successfully synced database server info with network, no changes made');
                    return;
                } else {
                    log.bright('successfully synced database server info with network, new data is ' + JSON.stringify(res));
                    serverInfoModel
                        .remove({})
                        .then(() => {
                            serverInfoModel.create(res);
                        })
                }
            })
            .catch((err) => {
                log.err('database_server_manager:syncWithNetwork:' + err);
                throw err;
            });
    }

    // getWebServersInfo should be a function that returns a promise, resolving
    // with a list of all of the web servers in the network. This is kind of 
    // gross, you should look into a better way of doing this.
    function startHeartbeat(getWebServersInfo, baseAddr, onHeartbeatFailure) {
        heartbeatManager.startHeartbeat(serverInfoModelWrapper, getWebServersInfo, baseAddr, onHeartbeatFailure);
    }

    return {
        setupSelf,
        syncWithNetwork,
        startHeartbeat,
        redirectRequest: requestRedirector.redirectRequest,
        generateAndStoreServerInfo: serverInfoManager.generateAndStoreServerInfo,
        removeServerAndAdjust: serverInfoManager.removeServerAndAdjust,
        removeServerInfo: serverInfoManager.removeServerInfo,
        getAllServerInfo: serverInfoManager.getAllServerInfo,
        getServerInfo: serverInfoManager.getServerInfo,
        addServerInfo: serverInfoManager.addServerInfo,
        addServersInfo: serverInfoManager.addServersInfo,
        addAllServerInfo: serverInfoManager.addAllServerInfo,
        updateServerInfo: serverInfoManager.updateServerInfo,
        updateServersInfo: serverInfoManager.updateServersInfo,
        recalculateServersRanges: serverInfoManager.recalculateServersRanges,
    };
};
