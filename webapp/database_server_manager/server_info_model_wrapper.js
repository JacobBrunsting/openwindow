const request = require('request-promise');
const DatabaseServerInfo = require(__dirname + '/database_server_info');
const log = require(__dirname + '/../utils/log');

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

    find(query, params) {
        return this.serverInfoModel
            .find(query, params)
            .lean()
            .then(DatabaseServerInfo.convertObjsToClasses);
    }

    findOne(query, params) {
        return this.serverInfoModel
            .findOne(query, params)
            .lean()
            .then(DatabaseServerInfo.convertObjToClass);
    }

    create(data) {
        return this.serverInfoModel
            .create(data)
            .then(res => {
                if (!res) {
                    return;
                }
                if (res.constructor === Array) {
                    return DatabaseServerInfo.convertObjsToClasses(res);
                } else {
                    return DatabaseServerInfo.convertObjToClass(res);
                }
            });
    }

    removeOne(query) {
        console.log('removing with query ' + JSON.stringify(query));
        return this.serverInfoModel
            .findOneAndRemove(query)
            .lean()
            .then(res => {
                if (!res) {
                    throw 'could not find server to remove';
                } else {
                    return res;
                }
            })
            .then(DatabaseServerInfo.convertObjToClass);
    }

    updateOne(query, updateInfo) {
        return this.serverInfoModel
            .findOneAndUpdate(query, updateInfo, {
                new: true
            })
            .lean()
            .then(res => {
                return res;
            })
            .then(DatabaseServerInfo.convertObjToClass);

    }

    sendRequestToServer(server, method, path, qs, body, timeout) {
        const requestParams = {
            url: server.baseAddr + path,
            body,
            qs,
            method,
            timeout
        }
        return request(requestParams)
            .catch(err => {
                log.err('server_info_model_wrapper:sendRequestToServer:' + err);
                throw err;
            });
    }
}