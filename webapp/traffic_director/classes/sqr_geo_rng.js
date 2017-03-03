/** Class representing a square geographic range */
module.exports = class SqrGeoRng {
    /**
     * Create a SqrGeoRng
     * @constructor
     * @param {number} minLat - The min latitude of the range, from -90 to 90
     * @param {number} maxLat - The max latitude of the range, from -90 to 90
     * @param {number} minLng - The min longitude of the range, from -180 to 180
     * @param {number} maxLng - The max longitude of the range, from -180 to 180
     */
    constructor(minLat, maxLat, minLng, maxLng) {
        this.minLat = minLat;
        this.maxLat = maxLat;
        this.minLng = minLng;
        this.maxLng = maxLng;
    }

    /**
     * Convert a javascript object with the same fields as a SqrGeoRng into a 
     * SqrGeoRng object
     * @param {Object} obj
     * @param {number} obj.minLat
     * @param {number} obj.maxLat
     * @param {number} obj.minLng
     * @param {number} obj.maxLng
     */
    static convertObjToClass(obj) {
        let minLat = obj.minLat;
        let maxLat = obj.maxLat;
        let minLng = obj.minLng;
        let maxLng = obj.maxLng;
        return new SqrGeoRng(minLat, maxLat, minLng, maxLng);
    }

    /**
     * Get the area of the range, currently calculated in square degrees
     * of longitude/latitude, but should be changed at some point to account for
     * the earth not being flat (unless the flat-earthers end up being right)
     * @returns {number} - The area of the range
     */
    getArea() {
        return (this.maxLat - this.minLat) * (this.maxLng - this.minLng);
    }

    /**
     * Clone this class
     * @returns {SqrGeoRng} - A clone of the class
     */
    clone() {
        return new SqrGeoRng(this.minLat, this.maxLat, this.minLng, this.maxLng);
    }

    /**
     * Get the structure of this class in the format required for a Mongoose 
     * Schema
     * @returns {Object} - The class structure.
     */
    static getStructure() {
        return {
            minLat: {
                type: Number,
                required: true,
            },
            maxLat: {
                type: Number,
                required: true,
            },
            minLng: {
                type: Number,
                required: true,
            },
            maxLng: {
                type: Number,
                required: true,
            },
        };
    }
}