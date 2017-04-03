const request = require('request');
const stableStringify = require('json-stable-stringify');
const log = require(__dirname + '/log');

/**
 * syncWithNetwork - Syncronize the data stored at the provided model with the
 *  other servers in the network
 * @param {Object} model - The mongoose model used to store and retrieve the
 *  data being synced
 * @param {string[]} otherServers - The other servers in the network that will
 *  be used to validate the data stored in the model
 * @param {string} retrievalURI - The path used to get the data being synced 
 *  from other servers on the network (note that, the data retreived from this
 *  URI must not include the '_id' field or '__v' field)
 */
// TODO: This should return a promise containing the correct data retrived by
// the 'getCorrectData' function, or some sort of indicator to say that the 
// current data is correct
function syncWithNetwork(model, otherServers, retrievalURI, sortQuery) {
    return model
        .find({}, {
            _id: 0,
            __v: 0
        })
        .then(data => {
            return determineIfMatchesNetwork(data, retrievalURI, otherServers);
        })
        .then((matchesNetwork) => {
            if (matchesNetwork) {
                return true;
            } else {
                return getCorrectData();
            }
        })
        .catch(err => {
            log.err("web_server_manager:syncWithNetwork:" + err);
            throw err;
        });

    function getCorrectData() {
        return new Promise((resolve, reject) => {
            log.err("server does not match network");
        });
    }
}

function determineIfMatchesNetwork(data, retrievalURI, otherServers) {
    let validationServerAddresses = [];
    for (let i = 1; i < Math.min(5, otherServers.length); ++i) {
        validationServerAddresses.push(
            otherServers[(otherServers.length - 1) / i]
        );
    }
    const promises = validationServerAddresses.map(addr => {
        return retrieveDataAndCompare(data, addr + retrievalURI);
    });
    return new Promise((resolve, reject) => {
        Promise.all(promises)
            .then(serversMatch => {
                resolve(serversMatch.every(a => a));
            })
            .catch(err => {
                reject(err);
            });
    });
}

function retrieveDataAndCompare(data, retrievalURL) {
    return new Promise((resolve, reject) => {
        const requestParams = {
            url: retrievalURL,
            method: 'GET',
            json: true
        }
        request(requestParams, (err, res) => {
            if (err) {
                log.err("web_server_manager:retrieveDataAndCompare:" + err);
                reject(err);
            } else {
                resolve(sortAndCompare(data, res.body));
            }
        });
    });
}

function sortAndCompare(first, second) {
    const sortedFirst = sortObjectArray(first);
    const sortedSecond = sortObjectArray(second);
    // temporary, should use deepEqual instead for efficiency (although this
    // method is nice and simple)
    return stableStringify(first) === stableStringify(second);
    // TODO: Figure out why this deepEquals is broken. Currently, the 'first' 
    //  parameter always looks correct when preforming JSON.stringify, but the
    //  keys retrieved by Object.keys are all random mongoose hidden properties.
    //  wrapping the paramters in a JSON.parse(JSON.stringify(...)) works, since
    //  that removes all of the hidden properties, but that isn't exactly a
    //  clean solution
    // return deepEqual(sortedFirst, sortedSecond);
}

function deepEqual(first, second) {
    if (Array.isArray(first)) {
        if (Array.isArray(second) && first.length === second.length) {
            for (let i = 0; i < first.length; ++i) {
                if (!deepEqual(first[i], second[i])) {
                    return false;
                }
            }
            return true;
        } else {
            return false;
        }
    } else if (isObject(first) && isObject(second)) {
        return Object.keys(first).every((key) => deepEqual(first[key], second[key])) &&
            Object.keys(second).every((key) => (key in first));
    } else {
        return first === second;
    }

    function isObject(obj) {
        return obj !== null && typeof obj === 'object';
    }
}

function sortObjectArray(arr) {
    return arr.sort((a, b) => {
        return stableStringify(a) < stableStringify(b)
    });
}

module.exports = {
    syncWithNetwork
};