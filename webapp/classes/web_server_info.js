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