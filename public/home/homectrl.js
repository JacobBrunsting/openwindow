angular.module('openwindow').controller('homectrl', [
        '$scope',
        '$http',
        '$window',
        function($scope, $http, $window) {
            // Title
            $scope.test = "Posts";
            // Input
            $scope.addPost = function() {
                $window.location.href = '#/new';
            }
            $scope.upvote = function(id) {
                console.log("looking for id " + id);
                for (postId in $scope.posts) {
                    var post = $scope.posts[postId];
                    if (post._id == id) {
                        console.log("found id " + id + "cur secs left " + post.secondsLeft);
                        if (post.selectedClass == "upvoted") {
                            removeUpvote(post); 
                            post.selectedClass = "none";
                        } else {
                            upvote(post);
                            post.selectedClass = "upvoted";
                        }
                    }
                }
            }
            upvote = function(post) {
                $http.post("/api/upvote", {id: post._id})
                     .success(function(response) {
                         if (response.secondsLeft) {
                            post.secondsLeft = response.secondsLeft;
                            console.log("updated post " + post._id);
                            console.log("new seconds " + post.secondsLeft);
                            updatePostTimes(0);
                         }
                     })
                     .error(function(error) {
                          
                     });
            }
            removeUpvote = function(post) {
                $http.post("/api/unupvote", {id: post._id})
                     .success(function(response) {
                         if (response.secondsLeft) {
                            post.secondsLeft = response.secondsLeft;
                            console.log("updated post " + post._id + " (unupvote)");
                            console.log("new seconds " + post.secondsLeft);
                            updatePostTimes(0);
                         }
                     })
                     .error(function(error) {
                     
                     });
            }
            $scope.downvote = function(id) {
                $http.post("/api/downvote", {id: id})
                     .success(function(response) {
                     })
                     .error(function(error) {});

            }
            getAllSitePosts = function() {
                $http.get("/api/siteposts")
                     .success(function(posts) {
                         $scope.posts = posts;
                         updatePostTimes(10);
                     });
                
            }
            updatePostTimes = function(timeToRemove) {
                for (var postId in $scope.posts) {
                    var post = $scope.posts[postId];
                    post.secondsLeft -= timeToRemove;
                    if (post.secondsLeft < 3540) {
                        post.time_str = Math.ceil(post.secondsLeft / 60) + " min";
                    } else if (post.secondsLeft < 21600) {
                        post.time_str = Math.floor(post.secondsLeft / 3600) + " hr";
                    } else {
                        post.time_str = Math.floor(post.secondsLeft / 21600) + " day";
                    }
                }
            }
            function init() {
                getAllSitePosts();
            }
            init();
        }
]);

