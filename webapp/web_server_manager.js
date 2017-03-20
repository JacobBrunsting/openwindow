const log = require(__dirname + '/utils/log');
const mongoose = require('mongoose');
const request = require('request');
const WebServerInfo = require(__dirname + '/classes/web_server_info');

const SERVER_INFO_MODEL_NAME = 'WebServerInfo';

var serverInfoModel;

function addServerInfo(req, res) {
    serverInfoModel
        .create(req.body.server)
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send();
            console.log("web_server_manager:addServerInfo:" + err);
        });
}

function getAllServerInfo(req, res) {
    serverInfoModel
        .find()
        .then((servers) => {
            res.json(servers);
        })
        .catch((err) => {
            res.status(500).send();
            console.log("web_server_manager:getAllServerInfo:" + err);
        });
}

function removeServerInfo(req, res) {
    serverInfoModel
        .findOneAndRemove({
            baseAddr: req.query.baseAddr
        })
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send();
            console.log("web_server_manager:removeServerInfo:" + err);
        });
}

function notifyOtherServers(method, path, body, qs) {
    let requestParams = {
        body: body,
        qs: qs,
        method: method,
        json: true
    }
    serverInfoModel
        .find({
            baseAddr: {
                $ne: baseAddr
            }
        })
        .then((servers) => {
            servers.forEach((server) => {
                requestParams.url = server.baseAddr + path;
                request(requestParams, (err) => {
                    if (err) {
                        log("web_server_manager:notifyOtherServers:" + err);
                    }
                });
            });
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send();
            console.log("web_server_manager:notifyOtherServers:" + err);
        });
}

function setupSelf() {
    return new Promise((resolve, reject) => {
        const requestParams = {
            // TODO: This address should be changed to the web address later
            url: 'http://localhost:8080/webserver/newserver',
            body: {
                baseAddr: baseAddr
            },
            method: 'POST',
            json: true
        }
        request(requestParam, (err, res) => {
            if (err) {
                console.log("web_server_manager:setupSelf:" + err);
                reject(err);
            } else {
                populateServerInfoDatabase();
            }
        });

        function populateServerInfoDatabase() {
            const requestParams = {
                // TODO: This address should be changed to the web address later
                url: 'http://localhost:8080/webserver/allserverinfo',
                method: 'GET',
                json: true
            }
            request(requestParam, (err, servers) => {
                if (err) {
                    console.log("web_server_manager:setupSelf:populateServerInfoDatabase:" + err);
                    reject(err);
                } else {
                    addAllServers(servers);
                }
            });
        }

        function addAllServers(servers) {
            serverInfoModel
                .create(servers)
                .then(() => {
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        }
    });
}

module.exports = (serverInfoCollectionName) => {
    const serverInfoSchema = mongoose.Schema(WebServerInfo.getStructure(), {
        collection: serverInfoCollectionName
    });

    serverInfoModel = mongoose.model(SERVER_INFO_MODEL_NAME, serverInfoSchema);

    return {
        addServerInfo,
        getAllServerInfo,
        removeServerInfo,
        notifyOtherServers,
        setupSelf,
    }
}