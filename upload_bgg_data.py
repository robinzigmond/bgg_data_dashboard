from urllib2 import urlopen
import boardgamegeek
from bs4 import BeautifulSoup
from pymongo import MongoClient

PAGES = 20  # constant for the number of pages of BGG rankings to pull games from. Each page contains 100 games.


def get_game_ids(sortcriterion, pages=1, sortdirection="desc"):
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
    for pageno in range(1, pages+1):
        search_url = (BASEURL + "/page/" + str(pageno) + "?sort="
                      + sortcriterion + "&sortdir=" + sortdirection)
        page = urlopen(search_url)
        html = page.read()
        soup = BeautifulSoup(html, "lxml")
        # now search for all boardgame links in ranking list
        link_tags = soup.findAll(a_inside_td_with_class_collection_thumbnail)
        # iterate through the list to get the id numbers.
        # (The id immediately follows "/boardgame/" in the href value)
        for link in link_tags:
            # a few games have ids as both a standalone game and as an expansion -
            # the same id in each case. But for some (all?) of these, the search
            # page gives the link with the expansion form, so we need to handle
            # both cases
            if link["href"][:20] == "/boardgameexpansion/":
                id_and_more = link["href"][20:]  # chop off the "/boardgameexpansion/"
            else:
                id_and_more = link["href"][11:]  # chop off the "/boardgame/"
            slash_index = id_and_more.find("/")
            new_id = int(id_and_more[:slash_index])
            game_ids.append(new_id)
    return game_ids


def a_inside_td_with_class_collection_thumbnail(tag):
    parent = tag.parent
    return (tag.name == "a"
            and parent.name == "td"
            and parent.has_attr("class")
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


def update_game_database(bgg_client, id_list):
    """
    This function takes a list of game ids, pulls all the data about the
    corresponding games form the BGG API, then uploads them to the
    MonogoDB running on localhost. The database is called "BGG", and the
    collection is called "game_info". The previous data is first cleared,
    so that when the program is run the database is updated with the
    latest BGG data, instead of adding new data to the old (which would
    introduce many duplicates and make the database grow huge over time).
    """
    # first get game data from API. The following API call returns a
    # list of objects representing the games: 
    games = bgg_client.game_list(game_id_list=id_list)
    # for each game, the .data() method returns a dictionary of the
    # game's data. We pack those dictionaries into a list
    data_dict = map(get_good_data, games)
    # create connection:
    client = MongoClient()
    db = client.BGG
    collection = db.game_info
    # first wipe previous data
    collection.delete_many({})
    # upload new data
    collection.insert_many(data_dict)


bgg = boardgamegeek.BGGClient(requests_per_minute=1)
# the default requests_per_minute is 30, but in practice this seems too fast
# to be allowed access to all data needed. Curiously, does not seem signifcantly 
# slower whenthis is reduced, and sometimes gives erros which I believ are due to
# making too many requests - so I have taken it down to the minimum allowed.
most_rated_ids = get_game_ids("numvoters", PAGES)  # get game ids for the number of games desired
update_game_database(bgg, most_rated_ids)  # upload data to Mongo
