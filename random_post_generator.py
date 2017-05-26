import requests
import json
import random
import time
from unidecode import unidecode

SECONDS_BETWEEN_POSTS = 20;

while True:
    r = requests.get('http://quotesondesign.com/wp-json/posts?filter[orderby]=rand')
    quote = json.loads(r.content)[0]
    title = unidecode(quote['title'] + ' (' + quote['link'] + ')')
    body = unidecode(quote['content'].replace('<p>', '').replace('</p>', '').replace('<br />', '')).replace('&#8220;', "'").replace('&#8221;', "'").replace('&#8211;', ',').replace('&#8217;', "'").replace('<strong>', '').replace('</strong>', '').replace('&#8216;', "'").replace('&#8220;', '...');
    lat = random.sample(range(-90, 90), 1)[0]
    lng = random.sample(range(-180, 180), 1)[0]
    print 'sending: title: ' + title + ', body:' + body
    r = requests.post('http://192.168.2.12:8080/api/post?latitude=' + str(lat) + '&longitude=' + str(lng) + '&radius=0', json={'title': title, 'body': body, 'secondsToShowFor': 16000, 'loc': {'coordinates': [lng, lat]}})
    print r
    time.sleep(SECONDS_BETWEEN_POSTS)
