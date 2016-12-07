angular.module('openwindow', []).controller('windowopener', [
        '$scope',
        function($scope) {
            // Title
            $scope.test = "this is a test";
            // Posts
            $scope.post_prefix = ":::";
            $scope.posts = [
            {title:'Title1', body:'Body 1'},
            {title:'Title2', body:'Bdy 1'},
            {title:'Title3', body:'By 1'},
            {title:'Title4', body:'o 1'}
            ];
            $scope.post_suffix = ";;;";
            // Input
            $scope.addPost = function() {
                $scope.posts.push({title:'new',body:'other'});
            }
        }
]);
