/** Class representing a web server */
module.exports = class WebServerInfo {
    /**
     * Create a WebServerInfo
     * @constructor
     * @param {string} baseAddr
     */
    constructor(baseAddr) {
        this.baseAddr = baseAddr;
    }

    /**
     * Convert a javascript object with the same fields as a WebServerInfo into 
     * a WebServerInfo object
     * @param {Object} obj
     * @param {number} obj.baseAddr
     */
    static convertObjToClass(obj) {
        const baseAddr = obj.baseAddr;
        return new DatabaseServerInfo(baseAddr);
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
            }
        }
    }
}