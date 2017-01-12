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
                console.log("location is " + JSON.stringify(position));
                posterLocation = position;
            });

            $scope.createNewSitePost = function() {
                console.log("creating new site post");
                if (posterLocation == undefined) {
                    console.log("location is undefined");
                    navigator.geolocation.getCurrentPosition($scope.submitPostWithThisLocation, function(err) {
                        // TODO: Add error checking stuff here
                    });
                    /*function(position) {
                        console.log("location is " + JSON.stringify(position));
                        $scope.submitPostWithThisLocation(position);
                    });*/
                } else {
                    console.log("location isdefined");
                    $scope.submitPostWithThisLocation(position);
                }
            }
            $scope.submitPostWithThisLocation = function(posterLocation) {
                console.log("postign with location " + JSON.stringify(posterLocation));
                var sitepost = {
                    title:$scope.title,
                    body:$scope.body,
                    location:posterLocation
                };
                $scope.title = '';
                $scope.body = '';
                $http.post("/api/sitepost", sitepost)
                     .success(function(response) {
                                  $window.location.href = '#/home';
                              })
                     .error(function(error) {
                                  console.log(error);
                              });
            }
        }
]);


