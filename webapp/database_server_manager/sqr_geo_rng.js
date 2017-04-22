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
     * Expand the range to encompass the provided range
     * @param {SqrGeoRng} rangeToContain - The range this range will be
     *  expanded to contain
     */
    expandToContainOther(rangeToContain) {
        this.minLat = Math.min(rangeToContain.minLat, this.minLat);
        this.maxLat = Math.max(rangeToContain.maxLat, this.maxLat);
        this.minLng = Math.min(rangeToContain.minLng, this.minLng);
        this.maxLng = Math.max(rangeToContain.maxLng, this.maxLng);
    }

    /**
     * Preform a deep comparison with another SqrGeoRng
     * @param {SqrGeoRng} other - The range to compare with
     */
    equals(other) {
        return this.minLat === other.minLat && this.maxLat === other.maxLat &&
               this.minLng === other.minLng && this.maxLng === other.maxLng;
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
     * Convert an array javascript objects with the same fields as a SqrGeoRng 
     * into an array of SqrGeoRng object
     * @param {Object[]} objs
     * @param {number} objs.minLat
     * @param {number} objs.maxLat
     * @param {number} objs.minLng
     * @param {number} objs.maxLng
     */
    static convertObjsToClasses(objs) {
        let newArr = [];
        objs.forEach((obj) => {
            let minLat = obj.minLat;
            let maxLat = obj.maxLat;
            let minLng = obj.minLng;
            let maxLng = obj.maxLng;
            newArr.push(new SqrGeoRng(minLat, maxLat, minLng, maxLng));
        });
        return newArr;
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