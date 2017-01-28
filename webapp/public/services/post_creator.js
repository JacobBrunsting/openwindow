angular.module('openwindow').service('post_creator', [function() {
    this.createPostForServer = function(title, body, latitude, longitude) {
        return {title:title, body:body, loc:{coordinate:{lat:latitude, lng:longitude}}};
    }

    this.createPost = function(id, title, body, upvoted, downvoted, posterId, 
                               postTime, secondsToShowFor, comments,
                               mainDatabaseAddr, backupDatabaseAddr) {
        var post = {};
        post.id = id;
        post.title = title;
        post.body = body;
        post.posterId = posterId;
        post.postTime = postTime;
        post.secondsToShowFor = secondsToShowFor;
        post.comments = comments;
        post.mainDatabaseAddr = mainDatabaseAddr;
        post.backupDatabaseAddr = backupDatabaseAddr;

        post.getId = function()                  { return post.id; }
        post.getTitle = function()               { return post.title; }
        post.getBody = function()                { return post.body; }
        post.isUpvoted = function()              { return post.upvoted; }
        post.isDownvoted = function()            { return post.downvoted; }
        post.getPosterId = function()            { return post.posterId; }
        post.getPostTime = function()            { return post.postTime; }
        post.getSecondsToShowFor = function()    { return post.secondsToShowFor; }
        post.getComments = function()            { return post.comments; }
        post.getMainDatabaseAddr = function()    { return post.mainDatabaseAddr; }
        post.getBackupDatabaseAddr = function()  { return post.backupDatabaseAddr; }

        post.setIsUpvoted = function(val)        { post.upvoted = val; }
        post.setIsDownvoted = function(val)      { post.downvoted = val; }
        post.setPostTime = function(val)         { post.postTime = val; }
        post.setSecondsToShowFor = function(val) { post.secondsToShowFor = val; }
        post.setComments = function(val)         { post.comments = val; }

        return post;
    }

    // TODO: Look into setting the value of 'upvote' and 'downvote' differently
    // gets a formatted post object with getters and setters from a post 
    // object returned by the server
    this.getFormattedPost = function(post) {
        return this.createPost(
                   post._id,
                   post.title,
                   post.body,
                   post.posterId,
                   false,
                   false,
                   post.postTime,
                   post.secondsToShowFor,
                   this.getFormattedCommentList(post.comments),
                   post.mainDatabaseAddr,
                   post.backupDatabaseAddr
               );
    }

    this.createComment = function(body) {
        var comment = {};
        comment.body = body;

        comment.getBody = function() { return comment.body; }
        return comment;
    }

    this.getFormattedCommentList = function(comments) {
        var formattedList = [];
        for (commentId in comments) {
            formattedList.push(this.getFormattedComment(comments[commentId]));
        }
        return formattedList;
    }

    this.getFormattedComment = function(comment) {
        return this.createComment(comment.body);
    }

    this.title = function(post) {
        return post.title;
    }
}]);
