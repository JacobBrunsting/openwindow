// This is a service to allow for changing location retriever later
angular.module('openwindow').service('geolocation', [function () {
    this.get = function (onSuccess, onError) {
        // uncomment once https certified (getCurrentPosition only works with
        // https)
        // navigator.geolocation.getCurrentPosition(onSuccess, onError);
        // onSuccess({
        //     longitude: -2.5,
        //     latitude: 0
        // });
        if (!this.location) {
            let longitude = Math.round((360 * Math.random() - 180) * 10000) / 10000;
            let latitude = Math.round((180 * Math.random() - 90) * 10000) / 10000;

            this.location = {
                longitude,
                latitude
            };
        }
        onSuccess(this.location);
    }

    this.setLocation = function(newLocation) {
        this.location = newLocation;
    }

    this.addLocationToURL = function (url, location) {
        if (url.indexOf('?') == -1) {
            url += '?';
        } else {
            url += '&';
        }
        return url + 'longitude=' + location.longitude +
            '&latitude=' + location.latitude;
    }

    this.getLocationFromLocationService = function (locationService) {
        return {
            longitude: locationService.search().longitude,
            latitude: locationService.search().latitude
        };
    }
}]);