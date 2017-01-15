// This is a service to allow for changing location retriever later
angular.module('openwindow').service('geolocation', [function() {
    this.get = function(onSuccess, onError) {
        // uncomment once https certified (getCurrentPosition only works with
        // https)
        // navigator.geolocation.getCurrentPosition(onSuccess, onError);
        onSuccess({longitude:0, latitude:0});
    }
}]);
