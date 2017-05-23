angular.module('openwindow').controller('newpostctrl', [
    '$scope',
    '$location',
    '$http',
    'post_creator',
    'geolocation',
    function ($scope, $location, $http, post_creator, geolocation) {
        geolocation.get(setupPage, onLocationRetrievalFailure);

        function onLocationRetrievalFailure(err) {
            console.log(err);
        }

        function setupPage(geolocation) {
            var posterLocation;
            $scope.createNewPost = function () {
                var post = post_creator.createPostForServer($scope.title,
                    $scope.body,
                    geolocation.latitude,
                    geolocation.longitude);
                $scope.title = '';
                $scope.body = '';
                $http.post("/api/post", post, {
                        params: {
                            latitude: geolocation.latitude,
                            longitude: geolocation.longitude,
                            radius: 0
                        }
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

            $scope.goHome = function () {
                $location.url('/home');
            }
        }
    }
]);