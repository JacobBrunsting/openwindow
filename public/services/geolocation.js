// This is a service to allow for changing location retriever later
angular.module('openwindow').service('geolocation', [function() {
    this.get = function(onSuccess, onError) {
        navigator.geolocation.getCurrentPosition(onSuccess, onError);
    }
}]);
