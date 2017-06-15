import time
from urllib2 import urlopen
import boardgamegeek
from bs4 import BeautifulSoup
from pymongo import MongoClient

PAGES = 100  # constant for the number of pages of search results to look
             # through. Each page consists of 100 items. 


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
        # time.sleep(10)
        print "processing page no. %s" % pageno
        search_url = (BASEURL + "/page/" + str(pageno) + "?sort="
                      + sortcriterion + "&sortdir=" + sortdirection)
        page = urlopen(search_url)
        html = page.read()
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
    data = game.data()
    data.pop("language_dependence")
    return data


def update_game_database(bgg_client, id_lists):
    """
    This function takes a list of lists of game ids, pulls all the data 
    about the corresponding games from the BGG API, then uploads them 
    to the MongoDB running on localhost. The database is called "BGG", 
    and the collection is called "game_info". The previous data is first 
    cleared, so that when the program is run the database is updated with 
    the latest BGG data, instead of adding new data to the old (which would
    introduce many duplicates and make the database grow huge over time).
    """
    # create connection:
    with MongoClient(host="localhost", port=27017) as client:
        db = client.BGG
        collection = db.game_info
        # first wipe previous data
        collection.delete_many({})
        counter = 0
        for list in id_lists:
            time.sleep(10)  # pause to prevent API throttling
            counter = counter+1
            print "trying to upload API data for page %s of %s" % (counter, PAGES)
            # first get game data from API. The following API call returns a
            # list of objects representing the games: 
            games = bgg_client.game_list(game_id_list=list)
            # for each game, the .data() method returns a dictionary of the
            # game's data. We pack those dictionaries into a list
            data_dict = map(get_good_data, games)
            # upload new data
            collection.insert_many(data_dict)
            print "successfully uploaded to MongoDB!"


bgg = boardgamegeek.BGGClient(requests_per_minute = 10)
id_lists = []
for i in range (0, PAGES):
    id_lists.append(get_game_ids("numvoters", i+1, 1))
update_game_database(bgg, id_lists)  # upload data to Mongo
