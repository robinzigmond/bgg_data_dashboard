from urllib2 import urlopen
import boardgamegeek
from bs4 import BeautifulSoup

def get_game_ids(sortcriterion, pages=1, sortdirection="desc"):
    """
    This function uses BeautifulStoup to return the BGG id #s
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


def export_game_objects(id_list, output_file):
    """
    This function finds all games with ids in the given list, and exports
    them to a text file. I hope later to change it to directly export the data
    to MongoDB
    """
    with open(output_file, "w") as output:
        games = bgg.game_list(game_id_list=id_list)
        for game in games:
            output.write(str(game.data()))
            output.write("\n")


bgg = boardgamegeek.BGGClient(requests_per_minute=15)
# the default requests_per_minute is 30, but in practice this seems too fast
# to be allowed access to all data needed. Halving it to 15 appears to work,
# while keeping run times acceptable.
most_rated_ids = get_game_ids("numvoters", pages=10)  # get 1000 most rated games
export_game_objects(most_rated_ids, "games.txt")  # output data dump to text file
