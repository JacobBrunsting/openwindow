function getTimestamp() {
    function addLeadingZeros(val, targLength) {
        return ("0".repeat(targLength) + val).slice(-targLength);
    }
    const curDate = new Date();
    const hrs = curDate.getHours();
    const mins = addLeadingZeros(curDate.getMinutes(), 2);
    const secs = addLeadingZeros(curDate.getSeconds(), 2);
    const mills = addLeadingZeros(curDate.getMilliseconds() % 1000, 4);
    return hrs + ":" + mins + ":" + secs + ":" + mills;
}

module.exports = {
    err: (message) => {
        console.log("\x1b[31m", getTimestamp() + ": " + message, "\x1b[0m");
    },
    msg: (message) => {
        console.log(getTimestamp() + ":" + message);
    }
}