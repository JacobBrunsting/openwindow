module.exports = function(message) {
    function addLeadingZeros(val, targLength) {
        return ("0".repeat(targLength) + val).slice(-targLength);
    }
    const curDate = new Date();
    const hrs = curDate.getHours();
    const mins = addLeadingZeros(curDate.getMinutes(), 2);
    const secs = addLeadingZeros(curDate.getSeconds(), 2);
    const mills = addLeadingZeros(curDate.getMilliseconds() % 1000, 4);
    const time = hrs + ":" + mins + ":" + secs + ":" + mills;
    console.log(time + ": " + message);
}