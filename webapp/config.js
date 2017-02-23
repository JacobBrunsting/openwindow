module.exports = {
    // the port used for the webapp 
    port: 8080,
    
    // the IP the webapp is bound to (0.0.0.0 represents all IP addresses)
    boundIp: '0.0.0.0',
    
    // the path to the database used to store the posts
    mongoDbAddress: 'mongodb://localhost/openwindowdatabase',
    
    // the collection to store the info for all the servers
    serversInfoCollection: 'ServersInfo',

    // the interval on which to update the information about the range of posts
    // stored on each server
    secondsBetweenServerSizeCalculations: 60
};