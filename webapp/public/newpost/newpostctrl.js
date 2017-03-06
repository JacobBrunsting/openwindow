angular.module('openwindow').controller('newpostctrl', [
    '$scope',
    '$location',
    '$http',
    'post_creator',
    'geolocation',
    function ($scope, $location, $http, post_creator, geolocation) {
        var posterLocation;
        $scope.location = geolocation.getLocationFromLocationService($location);
        $scope.createNewPost = function () {
            var post = post_creator.createPostForServer($scope.title,
                $scope.body,
                $scope.location.latitude,
                $scope.location.longitude);
            $scope.title = '';
            $scope.body = '';
            $http.post("/api/post", post, {
                    params: $scope.location
                })
                .success(
                    function (response) {
                        $location.url('/home');
                    }
                )
                .error(
                    function (err) {
                        console.log(err);
                    }
                );
        }
    }
]);