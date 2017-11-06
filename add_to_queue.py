"""
This script simply adds the "main process" (getting data from the BGG API and uploading
it to MongoDB) to the queue of jobs, which will then be executed by worker.py. This will
be set to run daily by the Heroku scheduler addon.
"""

from rq import Queue
from worker import conn
from upload_bgg_data import main_process

q = Queue(connection=conn)
result = q.enqueue(main_process, timeout=14400)  # increase timeout period to 4 hours to ensure it will finish
# unless major problems are encountered. (The default value is just 3 minutes! I tried 2 hours for a long
# time but sometimes API throttling causes it to take longer than this.)
