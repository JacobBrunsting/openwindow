angular.module('openwindow').controller('homectrl', [
        '$scope',
        '$http',
        '$window',
        function($scope, $http, $window) {
            getAllSitePosts = function() {
                $scope.page = "home";
                $http.get("/api/siteposts")
                     .success(function(posts) {
                         $scope.posts = [];
                         for (postId in posts) {
                             var post = posts[postId];
                             var formattedPost = {
                                 id:            post._id,
                                 title:         post.title,
                                 body:          post.body,
                                 upvoted:       false,
                                 downvoted:     false,
                                 comment_count: post.comments.length,
                                 secondsLeft:  post.secondsLeft,
                                 time_str:      ""
                             }
                             $scope.posts.push(formattedPost);
                         }
                     });
                
            }
            getAllSitePosts();
            $scope.addPost = function() {
               $window.location.href = '#/new';
            }
        }
]);

