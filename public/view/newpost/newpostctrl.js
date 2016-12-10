angular.module('openwindow').controller('newpostctrl', [
        '$scope',
        '$window',
        function($scope, $window) {
            $scope.test = "You should be on the new message page now";
            $scope.addCustomPost = function() {
                // add a post to the database
                $scope.test = "changed";
                $window.location.href = '#/home';
            }
        }
]);


