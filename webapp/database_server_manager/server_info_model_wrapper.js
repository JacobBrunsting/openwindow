const request = require('request');
const log = require(__dirname + '/../utils/log');
const DatabaseServerInfo = require(__dirname + '/database_server_info');

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
        return this.serverInfoModel
            .findOneAndRemove(query)
            .lean()
            .then(DatabaseServerInfo.convertObjToClass);
    }

    updateOne(query, updateInfo) {
        return this.serverInfoModel
            .findOneAndUpdate(query, updateInfo, {
                new: true
            })
            .lean()
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
        return new Promise((resolve, reject) => {
            request(requestParams, (err, res) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(res)
                }
            })
            .on('error', err => {
                log.err('server_info_model_wrapper:sendRequestToServer:' + err);
                reject(err);
            });
        });
    }
}