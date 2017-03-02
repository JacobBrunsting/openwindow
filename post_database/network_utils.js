var request = require('request');

function apiCall(serverIp, path, method, body, queries) {
    return serverCall("http://" + serverIp + "/api/" + path, method, body, queries);
}

function serverCall(url, method, body, queries) {
    return new Promise((resolve, reject) => {
        let requestParams = {
            url: url,
            body: body,
            qs: queries,
            method: method,
            json: true
        }
        request(requestParams, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res.body);
            }
        });
    });
}

module.exports = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE',
    apiCall: apiCall,
    serverCall: serverCall
}