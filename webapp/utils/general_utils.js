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

module.exports = {
    mergePromisesIgnoreErrors
}