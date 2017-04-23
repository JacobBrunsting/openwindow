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
                    log.err("web_server_manager:mergePromisesIgnoreErrors:" + err);
                    if (responsesRemaining <= 0) {
                        resolve(mergedResponses);
                    }
                });
        })
    });
}

/**
 * Sort the list of servers by their address, and find the first server 
 *  following the current server in the list, making a request to it with the 
 *  required path
 * @param {Object[]} servers - The list of web servers in the network
 * @param {string} curServerAddr - The address of this server
 * @param {string} path - The path of the request being made to the server
 */
function notifyNextAliveServer(servers, curServerAddr, path) {
    servers.sort((a, b) => a.baseAddr < b.baseAddr ? 1 : -1);
    let thisServerIndex;
    for (let i = 0; i < servers.length; ++i) {
        if (servers[i].baseAddr === baseAddr) {
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
            while (curServerIndex >= servers.length) {
                curServerIndex -= servers.length;
            }
            if (curServerIndex === thisServerIndex) {
                // If we have reached the current server in the list of all of the
                // servers, we have tried all of the other servers, so we failed to
                // find an alive server
                reject();
                return;
            }
            if (servers[curServerIndex].baseAddr === failedServer.baseAddr) {
                next();
                return;
            }
            const requestParams = {
                url: servers[curServerIndex].baseAddr + path,
                method: 'POST',
                body: failedServer,
                json: true,
            }
            request(requestParams, (err, res) => {
                    if (err) {
                        next();
                    } else {
                        resolve();
                    }
                })
                .on('error', () => {
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