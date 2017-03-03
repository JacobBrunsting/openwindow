var request = require('request');

function apiCall(serverAddress, path, method, body, queries) {
    return serverCall(serverAddress + "/api/" + path, method, body, queries);
}

function serverCall(url, method, body, queries) {
    let requestParams = {
        url: url,
        body: body,
        qs: queries,
        method: method,
        json: true
    }
    return new Promise((resolve, reject) => {
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