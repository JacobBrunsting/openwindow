angular.module('openwindow').controller('commentsctrl', [
    '$scope',
    '$http',
    '$location',
    'post_creator',
    'request_maker',
    'INT_CONSTANTS',
    function ($scope, $http, $location, post_creator, request_maker, INT_CONSTANTS) {
        var postId = $location.search().postId;
        var postServerAddress = $location.search().postServerAddress;

        $scope.page = "comments";
        $scope.post = post_creator.createPost("", "", "", false, false, "", "", "", "", "", "");
        $scope.comments = {};

        // TODO: The add comment function should only be created after the post is retrieved
        request_maker.getPostFromServer(postId,
            postServerAddress,
            function (response) {
                $scope.post = post_creator.getFormattedPost(response.body);
                $scope.comments = $scope.post.getComments();
            }
        );

        $scope.addComment = function () {
            if ($scope.body_box == "") {
                return;
            }
            var comment = post_creator.createComment($scope.body_box);
            request_maker.addComment($scope.post.getId(), postServerAddress, comment,
                function (response) {
                    $scope.comments = post_creator.getFormattedCommentList(response.body.comments);
                }
            );
            $scope.body_box = "";
        }

        $scope.goHome = function() {
            $location.url('/home');
        }
    }
]);