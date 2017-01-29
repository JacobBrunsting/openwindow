// This is a service to allow for changing location retriever later
angular.module('openwindow').service('geolocation', [function() {
    this.get = function(onSuccess, onError) {
        // uncomment once https certified (getCurrentPosition only works with
        // https)
        // navigator.geolocation.getCurrentPosition(onSuccess, onError);
        onSuccess({longitude:179, latitude:40});
    }

    this.addLocationToURL = function(url, location) {
        if (url.indexOf('?') == -1) {
            url += '?';
        } else {
            url += '&';
        }
        return url + 'longitude=' + location.longitude
                   + '&latitude=' + location.latitude;
    }

    this.getLocationFromLocationService = function(locationService) {
        return {longitude:locationService.search().longitude,
                latitude: locationService.search().latitude};
    }
}]);
