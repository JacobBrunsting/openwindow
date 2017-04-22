const request = require('request');
const stableStringify = require('json-stable-stringify');
const log = require(__dirname + '/log');
const GeneralUtils = require('./general_utils');

/**
 * syncWithNetwork - Syncronize the data stored at the provided model with the
 *  other servers in the network
 * @param {Object} model - The mongoose model used to store and retrieve the
 *  data being synced
 * @param {string[]} otherServers - The other servers in the network that will
 *  be used to validate the data stored in the model
 * @param {string} retrievalURI - The path used to get the data being synced 
 *  from other servers on the network (note that, the data retreived from this
 *  URI must not include the '_id' property or '__v' property)
 * @param {string} documentIdProperty - The property used to uniquely identify the
 *  object in the mongoose model so that the same object can be compared between
 *  the different servers in the network
 */
function syncWithNetwork(model, otherServers, retrievalURI, documentIdProperty) {
    return model
        .find({}, {
            _id: 0,
            __v: 0
        })
        .lean()
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
        return GeneralUtils.mergePromisesIgnoreErrors(otherServers.map(server =>
                makeGetCall(server, retrievalURI)
            )).then(dataArr => {
                return getCorrectDataFromArrays(dataArr, documentIdProperty);
            })
            .catch(err => {
                log.err("web_server_manager:syncWithNetwork:" + err);
                throw err;
            });
    }
}

/**
 * Take an array of arrays, and compare each subarray, returning an array
 *  containing the objects that occur in at least half of the subarrays, with
 *  their properties containing the most common value among all versions of
 *  that object in the different arrays
 *  Requires that all of the arrays have the same structure
 * @param {Object[][]} listOfArrays - An array of arrays, where every subarray
 *  contains objects that should be compared with the other arrays to generate 
 *  a final array of objects representing the most correct data
 * @param {string} idProperty - The property used to uniquely identify the 
 *  objects in the arrays so that a single object can be identified and compared 
 *  between all of the arrays in the data set
 */
function getCorrectDataFromArrays(listOfArrays, idProperty) {
    // has a property for the value of every ID property in every array in the list, 
    // referring to an array of all of the objects in the list of arrays which
    // have that value for their ID property
    let objectsById = {};
    listOfArrays.forEach(arr => {
        arr.forEach(obj => {
            const objId = obj[idProperty];
            if (!objectsById[objId]) {
                objectsById[objId] = [];
            }
            objectsById[objId].push(obj);
        });
    });
    const minCountForInclusion = listOfArrays.length / 2;
    let resultingArray = [];
    for (let key in objectsById) {
        const objsWithSameId = objectsById[key];
        if (objsWithSameId.length >= minCountForInclusion) {
            resultingArray.push(getCorrectDataFromList(objsWithSameId));
        }
    }
    return resultingArray;
}

/**
 * Takes an array of objects with identical properties, and returns a new object
 *  with the same properties, where the value of each property is the most
 *  common value of that property among all of the objects in the array
 *  Requires that all of the data has the same structure
 * @param {Object[]} listOfData - An array of objects with the same structure
 *  that will be compared to determine the final, correct object
 */
function getCorrectDataFromList(listOfData) {
    if (listOfData.length === 0) {
        return undefined;
    }
    if (typeof listOfData[0] === 'object') {
        let resultingObject = {};
        for (let key in listOfData[0]) {
            resultingObject[key] = getCorrectDataFromList(
                listOfData.map(data => data[key])
            );
        }
        return resultingObject;
    } else {
        /**
         * numDataWithValue is an object where the keys are the values of the 
         * data in the listOfData, and the values are the number of times that 
         * key occurs in the list
         */
        let numDataWithValue = {};
        listOfData.forEach((val) => {
            if (!numDataWithValue[val]) {
                numDataWithValue[val] = 0;
            }
            ++numDataWithValue[val];
        });
        let maxCount;
        let mostCommonVal;
        for (let val in numDataWithValue) {
            if (!maxCount || maxCount < numDataWithValue[val]) {
                maxCount = numDataWithValue[val];
                mostCommonVal = val;
            }
        }
        return mostCommonVal;
    }
}

function determineIfMatchesNetwork(data, retrievalURI, otherServers) {
    let validationServerAddresses = [];
    const numServersToTest = Math.min(5, otherServers.length);
    for (let i = 0; i < numServersToTest; ++i) {
        validationServerAddresses.push(
            otherServers[Math.floor((otherServers.length - 1) * i / numServersToTest)]
        );
    }
    const promises = validationServerAddresses.map(addr => {
        return retrieveDataAndCompare(data, addr, retrievalURI);
    });
    // TODO: You do not have to execute all of the promises neccesarily - you
    // can stop executing once you encounter a 'false'
    return Promise.all(promises)
        .then(dataMatches => dataMatches.every(a => a))
        .catch(err => {
            log.err("network_syncronization_utils:determineIfMatchesNetwork:" + err);
        });
}

function retrieveDataAndCompare(data, serverAddress, retrievalURI) {
    return makeGetCall(serverAddress, retrievalURI)
        .then(retrievedData => sortAndCompare(data, retrievedData))
        .then(result => {
            if (!result) {
                log.msg("data at server " + serverAddress + " does not match");
            }
            return result;
        })
        .catch(err => {
            log.err("network_syncronization_utils:retrieveDataAndCompare:" + err);
        });
}

function sortAndCompare(first, second) {
    const sortedFirst = sortObjectArray(first);
    const sortedSecond = sortObjectArray(second);
    return deepEqual(sortedFirst, sortedSecond);

    function sortObjectArray(arr) {
        return arr.sort((a, b) => {
            return stableStringify(a) < stableStringify(b)
        });
    }
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
        // we allow comparing of different types here because sometimes when the
        // data being compared comes from different sources, numbers get
        // converted to strings (probably would be good to get rid of this at
        // some point if possible)
        return first == second;
    }

    function isObject(obj) {
        return obj !== null && typeof obj === 'object';
    }
}

function makeGetCall(serverAddress, uri) {
    return new Promise((resolve, reject) => {
        const requestParams = {
            url: serverAddress + uri,
            method: 'GET',
            json: true
        }
        request(requestParams, (err, res) => {
            if (err) {
                log.err("web_server_manager:makeGetCall:" + err);
                reject(err);
            } else {
                resolve(res.body);
            }
        });
    });
}

module.exports = {
    syncWithNetwork
};