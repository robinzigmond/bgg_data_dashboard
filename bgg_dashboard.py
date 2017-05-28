from flask import Flask, render_template
from pymongo import MongoClient
import json

app = Flask(__name__)

MONGODB_HOST = "localhost"
MONGODB_PORT = 27017
DBS_NAME = "BGG"
COLLECTION_NAME = "game_info"

@app.route("/")
def index():
    """
    A Flask view to serve the main dashboard page.
    """
    return render_template("index.html")

@app.route("/BGG/game_info")
def game_data():
    """
    A Flask view to serve the project data from
    MondoDB in JSON format.
    """

    # A constant that defines the record fields that we wish to retrive
    # (almost certainly more than I will use, but keeping options open
    # for now):
    FIELDS = {
        "_id": False, "mechanics": True, "publishers": True,
        "minplayers": True, "designers": True, "categories": True,
        "stats": True, "playingtime": True, "yearpublished": True,
        "expansions": True, "maxplayers": True
    }

    # Open a connection to MongoDB using a with statement such that the
    # connection will be closed as soon as we exit the with statement
    with MongoClient(MONGODB_HOST, MONGODB_PORT) as conn:
        # Define which collection we wish to access
        collection = conn[DBS_NAME][COLLECTION_NAME]
        # Retrieve a result set only with the fields defined in FIELDS
        projects = collection.find(projection=FIELDS, limit=1000)
        # COnvert projects to a list in a JSON object and return the JSON data
        return json.dumps(list(projects))


if __name__ == "__main__":
    app.run(debug=True)  # MUST remember to set debug to False when deploying!!
