filteredArgs=()
firstSetup=false
for arg in "$@"; do
    if [ "${arg}" == "firstSetup=true" ]; then
        firstSetup="true"
    else
        filteredArgs+=("${arg}")
    fi
done
firstStartupArgs=${filteredArgs[@]}
if [ "${firstSetup}" == "true" ]; then
    firstStartupArgs+=("firstSetup=true")
fi
node --use-strict webapp.js ${firstStartupArgs[@]}
sleep 60
while :; do
    echo "Restarting Server"
    node --use-strict webapp.js ${filteredArgs[@]}
    sleep 60
done
