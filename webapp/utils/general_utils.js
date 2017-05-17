const request = require('request-promise');
const log = require('./log');

function mergePromisesIgnoreErrors(promises) {
    return new Promise((resolve, reject) => {
        let responsesRemaining = promises.length;
        let mergedResponses = [];
        promises.forEach(promise => {
            promise
                .then(response => {
                    responsesRemaining -= 1;
                    mergedResponses.push(response);
                    if (responsesRemaining <= 0) {
                        resolve(mergedResponses);
                    }
                })
                .catch(err => {
                    responsesRemaining -= 1;
                    log.err('web_server_manager:mergePromisesIgnoreErrors:' + err);
                    if (responsesRemaining <= 0) {
                        resolve(mergedResponses);
                    }
                });
        })
    });
}

/**
 * Sort the list of servers by their address, and find the first server 
 *  following the current server in the list, making a POST request to it with 
 *  the specified path and body
 * @param {Object[]} servers - The list of web servers in the network
 * @param {string} thisServerAddr - The address of this server
 * @param {string} path - The path of the request being made to the server
 * @param {Object} body - The body of the request
 */
function notifyNextAliveServer(servers, thisServerAddr, path, body) {
    const sortedServers = servers.sort((a, b) => a.baseAddr < b.baseAddr ? 1 : -1);
    let thisServerIndex;
    for (let i = 0; i < sortedServers.length; ++i) {
        if (sortedServers[i].baseAddr === thisServerAddr) {
            thisServerIndex = i;
            break;
        }
    }
    if (!thisServerIndex) {
        thisServerIndex = 0;
    }
    let curServerIndex = thisServerIndex + 1;

    return new Promise((resolve, reject) => {
        notifyNextServer();
        function notifyNextServer() {
            while (curServerIndex >= sortedServers.length) {
                curServerIndex -= sortedServers.length;
            }
            if (curServerIndex === thisServerIndex) {
                // If we have reached the current server in the list of all of the
                // servers, we have tried all of the other servers, so we failed to
                // find an alive server
                reject();
                return;
            }
            const requestParams = {
                url: sortedServers[curServerIndex].baseAddr + path,
                method: 'POST',
                body: body,
                json: true,
            }
            request(requestParams)
                .catch(err => {
                    log.err('general_utils:notifyNextAliveServer:' + err);
                    log.err('error occurred when connecting to: ' + requestparams.url);
                    next();
                });

            function next() {
                curServerIndex += 1;
                notifyNextServer();
            }
        }
    });
}

module.exports = {
    mergePromisesIgnoreErrors,
    notifyNextAliveServer
}