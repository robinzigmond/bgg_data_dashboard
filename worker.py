"""
Worker file to run on Heroku, listening for jobs added to the job queue
and then executing them. Taken directly from https://devcenter.heroku.com/articles/python-rq
(In the case of this app, all it will ever perform will be the upload_bgg_data function, to
update the dashboard with the latest API data).
"""
import os

import redis
from rq import Worker, Queue, Connection

listen = ["high", "default", "low"]

redis_url = os.getenv("REDISTOGO_URL", "redis://localhost:6379")

conn = redis.from_url(redis_url)

if __name__ == "__main__":
    with Connection(conn):
        worker = Worker(map(Queue, listen))
        worker.work()
