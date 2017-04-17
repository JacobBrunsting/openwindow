const request = require('request');
const log = require(__dirname + '/../utils/log');
const DatabaseServerInfo = require(__dirname + '/../classes/database_server_info');

module.exports = class ServerInfoWrapper {
    constructor(serverInfoModel) {
        this.serverInfoModel = serverInfoModel;
        this.GET = 'GET';
        this.POST = 'POST';
        this.PUT = 'PUT';
        this.DELETE = 'DELETE';
    }

    getAllServers() {
        return this.serverInfoModel
            .find({})
            .lean()
            .then(DatabaseServerInfo.convertObjsToClasses);
    }

    sendRequestToServer(server, method, path, queries, body) {
        const requestParams = {
            url: server.baseAddr + path,
            body: body,
            qs: queries,
            method: method
        }
        return new Promise((resolve, reject) => {
            request(requestParams, (err, res) => {
                if (err) {
                    log.err("server_info_wrapper:sendRequestToServer (path:" + path + "):" + err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        })
    }

    sendRequestToAllServers(method, path, queries, body) {
        return getAllServerInfo()
            .then((servers) => Promise.all([servers.map(server =>
                sendRequestToServer(server, method, path, queries, body))]));
    }
}
