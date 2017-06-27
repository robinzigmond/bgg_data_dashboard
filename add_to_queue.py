"""
This script simply adds the "main process" (getting data from the BGG API and uploading
it to MongoDB) to the queue of jobs, which will then be executed by worker.py. This will
be set to run daily by the Heroku scheduler addon.
"""

from rq import Queue
from worker import conn
from upload_bgg_data import main_process

q = Queue(connection=conn)
result = q.enqueu(main_process, "http://heroku.com")
