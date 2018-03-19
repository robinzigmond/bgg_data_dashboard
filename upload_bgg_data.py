import time
import os
from urllib2 import urlopen, HTTPError
import boardgamegeek
from bs4 import BeautifulSoup
from pymongo import MongoClient


def get_game_ids(sortcriterion, firstpage, pages, sortdirection="desc"):
    """
    This function uses BeautifulSoup to return the BGG id #s
    of all games in the first n pages of the BGG database, where
    n is given by the pages parameter, and the pages are based on
    a sort criterion specified by the user. The sorts supported by
    BGG are: "rank", "bggrating", "avgrating", "numvoters". Its
    purpose in this project is to get the ids of the games with
    most user ratings, as the most interesting ones to get data on,
    allowing the number of requests to the BGG API to be kept to
    a minimum (by passing it precisely the game IDs which are
    wanted).
    """
    BASEURL = "https://boardgamegeek.com/browse/boardgame"
    game_ids = []
    for pageno in range(firstpage, firstpage+pages):
        print "processing page no. %s" % pageno
        search_url = (BASEURL + "/page/" + str(pageno) + "?sort="
                      + sortcriterion + "&sortdir=" + sortdirection)
        # catch HTTPErrors (usually gateway timeout) and repeat until the call works
        success = False
        while not success:
            try:
                html = urlopen(search_url).read()
                success = True
            except HTTPError as e:
                print "HTTPError: %s - retrying" %e
                time.sleep(10)
        soup = BeautifulSoup(html, "lxml")
        # now search for all boardgame links in ranking list
        link_tags = soup.findAll(is_link_in_ranking_list)
        # iterate through the list to get the id numbers.
        # (The id immediately follows "/boardgame/" in the href value)
        for link in link_tags:
            # many items in the search results are not "actual" games -
            # they are expansions, or even something else. I am not interested
            # in these "others" for this project.
            if link["href"][:11] == "/boardgame/":
                id_and_more = link["href"][11:]  # chop off the "/boardgame/"
                slash_index = id_and_more.find("/")
                new_id = int(id_and_more[:slash_index])
                game_ids.append(new_id)
            else:
                # if not an "actual" game, skip it
                continue
        print "%s actual games found on page" % len(game_ids)
    return game_ids


def is_link_in_ranking_list(tag):
    """
    finds game links for items in the ranking list. From studying the html
    for these pages, the distinguishing feature of them is that they are
    links inside a <td>, and that <td> has a class of "collection_thumbnail"
    """
    parent = tag.parent
    return (tag.name == "a"
            and parent.name == "td"
            and parent.has_attr("class")
            # need to use a list for class names, because there can be multiple
            # classes on a single element
            and parent["class"] == ["collection_thumbnail"]
           )


def get_good_data(game):
    """this function uses the .data() method in the boardgamegeek module
    to extract the data into a dictionary. We also need to remove the
    "language_dependence" key and corresponding value, because the value
    is itself a dictionary which contains non-string keys, which can't be
    parsed by MongoDB"""
    stats = game.data()
    stats.pop("language_dependence")
    return stats


def get_api_data(bgg_client, id_lists):
    """
    This function takes in a list of lists of game IDs, makes the necessary API calls, and
    returns a list of lists of dictionaries, each dictionary containing the BGG data for
    one game.
    """
    game_data = []
    counter = 1
    for id_list in id_lists:
        success = False
        additional_delay = 0
        data_available = False
        # loop to keep trying each API call (for this set of 100 games)
        # a usable result is obtained
        while not success:
            time.sleep(10) # pause to prevent API throttling
            print "trying to obtain API data for page %s of 100" % counter
            # The following API call returns a list of objects representing the games.
            # it may fail cause a BGGApiError (typically "non-XML response"), for
            # seemingly random reasons. We try to catch these and retry the call.
            call_success = False
            while not call_success:
                try:
                    games = bgg_client.game_list(game_id_list=id_list)
                    call_success = True
                except boardgamegeek.exceptions.BGGApiError as e:
                    print "error: %s - retrying" %e
                    time.sleep(60)
            # check if the API call succesfully gave a non-empty list.
            # (It gives an empty list in cases of throttling or other API
            # errors - which then cause an error to be thrown when uploading
            # to Mongo.)
            if games == []:
                if id_list:
                    # in case of an API error causing lack of output,
                    # wait for a further 30 minutes and try again - 
                    # increasing timeout by 30 minutes each time
                    # (from experience, half hour delay should be enough to get it working)
                    print "failure - retrying..."
                    time.sleep(additional_delay)
                    additional_delay += 1800
                    # keep waiting longer with each failure, to allow a result to
                    # eventually be obtained
                else:
                    # it is possible (at least theoretically) that there
                    # is no data because no "genuine" games were obtained
                    # from a particular page. In this case we simply skip
                    # this page
                    success = True
            else:
                print "success!"
                success = True
                data_available = True
                counter = counter+1
                # reset delay counter if successful
                additional_delay = 10
        # map over the list to get a list of dictionaries of the desired data
        # - but skip if there was genuinely no data (to avoid MongoDB error):
        if data_available:
            data_dicts = map(get_good_data, games)
            game_data.append(data_dicts)
    return game_data


def update_game_database(game_data):
    """
    This very simple function uploads a list of game-data dictionaries to MongoDB.
    It first uploads them to a new collection, and only wipes the old one and replaces it
    if the new data is "good". (Failures can mostly be caused by issues with the BGG API.)
    """
    # the following setup is for the heroku server.
    # I can also update the heroku database manually by runing the script
    # from my PC - providing I give the right values for MONGO_URI and
    # DBS_NAME. (Not listed here, for obvious reasons.)
    MONGO_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
    DBS_NAME = os.getenv('MONGO_DB_NAME', 'BGG')
    COLLECTION_NAME = "game_info"
    TEMP_COLLECTION_NAME = "temp"
    # create connection:
    with MongoClient(MONGO_URI) as client:
        db = client[DBS_NAME]
        collection = db[TEMP_COLLECTION_NAME]
        # first wipe any previous termporary data - this is now not needed
        collection.delete_many({})
        counter = 0
        for data_dict in game_data:
            counter = counter+1
            print "trying to upload API data for page %s of 100" % counter
            # upload new data
            collection.insert_many(data_dict)
            print "successfully uploaded to MongoDB!"
        # if we have succesffully reached this point with no errors, it is safe to
        # replace the old "permanent" data with the new.
        # Errors may occur due to a user accessing the old data at the exact moment
        # we want to drop it, so we keep trying until we achieve success:
        success = False
        while not success:
            try:
                collection.rename(COLLECTION_NAME, dropTarget=True)
                success = True
            except Exception as e:
                print e
                continue


def main_process():
    """ the main program just uses the functions defined above to first
    get the game ID lists, uses those to get the data from the BGG API, and finally
    uploads the data to MongoDB"""
 
    bgg = boardgamegeek.BGGClient(requests_per_minute=10)
    lists = []
    for i in range(0, 100):
        lists.append(get_game_ids("numvoters", i+1, 1))
    data = get_api_data(bgg, lists)
    update_game_database(data)
