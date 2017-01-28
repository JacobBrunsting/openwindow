angular.module('openwindow').controller('newpostctrl', [
        '$scope',
        '$location',
        '$http',
        'post_creator',
        'geolocation',
        function($scope, $location, $http, post_creator, geolocation) {
            var posterLocation;
            $scope.location = geolocation.getLocationFromLocationService($location);
            $scope.createNewSitePost = function() {
                var sitePost = post_creator.createPostForServer($scope.title, 
                                                                $scope.body, 
                                                                $scope.location.latitude, 
                                                                $scope.location.longitude);
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


