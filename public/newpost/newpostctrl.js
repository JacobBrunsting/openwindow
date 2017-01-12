angular.module('openwindow').controller('newpostctrl', [
        '$scope',
        '$window',
        '$http',
        function($scope, $window, $http) {
            var posterLocation;
            
            // TODO: Look into alternative geolocation services to add 
            // compatability with more browsers
            if (!("geolocation" in navigator)) {
                alert("Error:location unavaliable");
                return;
            }

            navigator.geolocation.getCurrentPosition(function(position) {
                posterLocation = position;
            });

            $scope.createNewSitePost = function() {
                if (posterLocation == undefined) {
                    navigator.geolocation.getCurrentPosition(
                        $scope.submitPostWithThisLocation, 
                        function(err) {
                        // TODO: Add error checking stuff here
                        }
                    );
                } else {
                    $scope.submitPostWithThisLocation(position);
                }
            }

            $scope.submitPostWithThisLocation = function(posterLocation) {
                var sitepost = {
                    title:$scope.title,
                    body:$scope.body,
                    location:posterLocation
                };
                $scope.title = '';
                $scope.body = '';
                $http.post("/api/sitepost", sitepost)
                    .success(
                    function(response) {
                        $window.location.href = '#/home';
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


