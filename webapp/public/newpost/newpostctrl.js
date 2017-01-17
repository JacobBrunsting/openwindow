angular.module('openwindow').controller('newpostctrl', [
        '$scope',
        '$location',
        '$http',
        'geolocation',
        function($scope, $location, $http, geolocation) {
            var posterLocation;
            $scope.location = geolocation.getLocationFromLocationService($location);
            $scope.createNewSitePost = function() {
                var sitePost = {
                    title:     $scope.title,
                    body:      $scope.body,
                    longitude: $scope.location.longitude,
                    latitude:  $scope.location.latitude,
                };
                $scope.title = '';
                $scope.body = '';
                $http.post("/api/sitepost", sitePost, {params:$scope.location})
                    .success(
                        function(response) {
                            $location.url('/home');
                        }
                    )
                    .error(
                        function(error) {
                            console.log(error);
                        }
                    );
            }
        }
]);


