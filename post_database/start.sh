while :; do
    node --use-strict post_database.js $@
    sleep 60
    echo "Restarting server"
done
