var SqrGeoRng = require(__dirname + '/sqr_geo_rng');
var mongoose = require('mongoose');

/** Class representing a database server */
module.exports = class DatabaseServerInfo {
    /**
     * Create a DatabaseServerInfo
     * @constructor
     * @param {string} baseAddr - The base address of the server
     * @param {string} backupAddr - The address the server backs up its data 
     *  too
     * @param {SqrGeoRng} writeRng - The geographic range of posts that
     *  should be stored at this server
     * @param {SqrGeoRng} readRng - The geographic range of posts that can
     *  possibly be read from this server, must always fully encompass the write 
     *  range
     */
    constructor(baseAddr, backupAddr, writeRng, readRng) {
        this.baseAddr = baseAddr;
        this.backupAddr = backupAddr;
        this.writeRng = (writeRng ? writeRng : new SqrGeoRng());
        this.readRng = (readRng ? readRng : new SqrGeoRng());
    }

    /**
     * Expand the read/write area of this server to encompass their original
     * areas, along with the area of the provided server
     * @param {DatabaseServerInfo} serverToContain - The server this server will be 
     *  expanding to contain
     */
    expandToContainOther(serverToContain) {
        this.writeRng.expandToContainOther(serverToContain.writeRng);
        this.readRng.expandToContainOther(serverToContain.readRng);
    }

    /**
     * Convert a javascript object with the same fields as a DatabaseServerInfo into a 
     * DatabaseServerInfo object
     * @param {Object} obj
     * @param {number} obj.baseAddr
     * @param {number} obj.backupAddr
     * @param {SqrGeoRng} obj.writeRng
     * @param {SqrGeoRng} obj.readRng
     */
    static convertObjToClass(obj) {
        const baseAddr = obj.baseAddr;
        const backupAddr = obj.backupAddr;
        const writeRng = SqrGeoRng.convertObjToClass(obj.writeRng);
        const readRng = SqrGeoRng.convertObjToClass(obj.readRng);
        return new DatabaseServerInfo(baseAddr, backupAddr, writeRng, readRng);
    }

    /**
     * Convert an array of javascript object with the same fields as a 
     * DatabaseServerInfo into an array of DatabaseServerInfo objects
     * @param {Object} objs
     * @param {number} objs.baseAddr
     * @param {number} objs.backupAddr
     * @param {SqrGeoRng} objs.writeRng
     * @param {SqrGeoRng} objs.readRng
     */
    static convertObjsToClasses(objs) {
        return objs.map(DatabaseServerInfo.convertObjToClass);
    }

    /**
     * Get the structure of this class in the format required for a Mongoose 
     * Schema
     * @returns {Object} - The class structure
     */
    static getStructure() {
        return {
            baseAddr: {
                type: String,
                required: true,
            },
            backupAddr: {
                type: String,
                required: true,
            },
            writeRng: {
                type: SqrGeoRng.getStructure(),
                required: true,
            },
            readRng: {
                type: SqrGeoRng.getStructure(),
                required: true,
            }
        };
    }
}