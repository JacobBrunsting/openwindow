module.exports = {
    // the port used for the webapp 
    port: 3000,

    // the IP the webapp is bound to (0.0.0.0 represents all IP addresses)
    boundIp: '0.0.0.0',

    // the path to the database used to store the posts
    mongoDbAddress: 'mongodb://localhost/openwindowdatabase',

    // the name of the post model, used to generate the name of the 
    // collection
    postModelName: 'Post',

    // the name of the backup post model, used to generate the name of the
    // collection
    backupPostModelName: 'BackupPost',

    // seconds between removing all expired posts
    secondsBetweenCleanup: 200,

    // the number of seconds to cache responses for
    cacheExpiryTime: 30,

    // the number of seconds to incriment the time when an upvote is received
    upvoteInc: 80,

    // the number of seconds to incriment the time when a downvote is received
    downvoteInc: -150,

    // the initial number of seconds a post should be shown for
    initialSecondsToShowFor: 1000
};
