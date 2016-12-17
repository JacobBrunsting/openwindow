angular.module('openwindow').controller('homectrl', [
        '$scope',
        '$http',
        '$window',
        function($scope, $http, $window) {
            // Title
            $scope.test = "this is a test";
            // Posts
            $scope.posts = [
            {title:'Title1', body:'Body 1'},
            {title:'Title2', body:'Bdy 1'},
            {title:'Title3', body:'By 1'},
            {title:'Title4', body:'o 1'}
            ];
            // Input
            $scope.addPost = function() {
                $window.location.href = '#/new';
            }
            $scope.addCustomPost = function() {
                if ($scope.title != '') {
                    $scope.posts.push({title: $scope.title,body:'bod'});
                    $scope.title = '';
                }
            }
            getAllSitePosts = function() {
                $http.get("/api/siteposts")
                     .success(function(posts) {
                         $scope.posts = posts;
                     });
                
            }
            function init() {
                getAllSitePosts();
            }
            init();
        }
]);

