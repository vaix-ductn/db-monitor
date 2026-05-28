import os
import json
import time
import datetime
import threading
import redis
import pymysql
from decimal import Decimal
from pymysqlreplication import BinLogStreamReader
from pymysqlreplication.row_event import WriteRowsEvent, UpdateRowsEvent, DeleteRowsEvent

MYSQL_SETTINGS = {
    "host": os.environ.get("MYSQL_HOST", "db"),
    "port": int(os.environ.get("MYSQL_PORT", "3306")),
    "user": os.environ.get("MYSQL_USER", "andes_cloud"),
    "passwd": os.environ.get("MYSQL_PASSWORD", "andes_cloud"),
}
PYMYSQL_CONN = {
    "host": MYSQL_SETTINGS["host"],
    "port": MYSQL_SETTINGS["port"],
    "user": MYSQL_SETTINGS["user"],
    "password": MYSQL_SETTINGS["passwd"],
}
MYSQL_DATABASE = os.environ.get("MYSQL_DATABASE", "andes_cloud")
REDIS_HOST = os.environ.get("REDIS_HOST", "cdc-redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))


def serialize(obj):
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, set):
        return list(obj)
    return str(obj)


def push_schema(r):
    """Push all user databases + tables to Redis every 60s for frontend dropdowns."""
    while True:
        try:
            conn = pymysql.connect(**PYMYSQL_CONN)
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT TABLE_SCHEMA, TABLE_NAME
                    FROM information_schema.TABLES
                    WHERE TABLE_TYPE = 'BASE TABLE'
                      AND TABLE_SCHEMA NOT IN
                          ('mysql','information_schema','performance_schema','sys')
                    ORDER BY TABLE_SCHEMA, TABLE_NAME
                """)
                schema: dict = {}
                for db, tbl in cur.fetchall():
                    schema.setdefault(db, []).append(tbl)
            conn.close()
            r.set("db_schema", json.dumps(schema))
            print(f"[Schema] Updated: {list(schema.keys())}", flush=True)
        except Exception as e:
            print(f"[Schema] Error fetching schema: {e}", flush=True)
        time.sleep(60)


def connect_redis():
    while True:
        try:
            r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
            r.ping()
            print(f"[Reader] Connected to Redis at {REDIS_HOST}:{REDIS_PORT}", flush=True)
            return r
        except Exception as e:
            print(f"[Reader] Waiting for Redis... {e}", flush=True)
            time.sleep(2)


def connect_stream():
    while True:
        try:
            stream = BinLogStreamReader(
                connection_settings=MYSQL_SETTINGS,
                server_id=200,
                only_events=[WriteRowsEvent, UpdateRowsEvent, DeleteRowsEvent],
                resume_stream=True,
                blocking=True,
            )
            print(
                f"[Reader] Connected to MySQL binlog at {MYSQL_SETTINGS['host']}:{MYSQL_SETTINGS['port']}",
                flush=True,
            )
            print("[Reader] Monitoring all databases", flush=True)
            return stream
        except Exception as e:
            print(f"[Reader] Waiting for MySQL binlog... {e}", flush=True)
            time.sleep(5)


r = connect_redis()
threading.Thread(target=push_schema, args=(r,), daemon=True).start()
stream = connect_stream()

for binlog_event in stream:
    try:
        for row in binlog_event.rows:
            if isinstance(binlog_event, WriteRowsEvent):
                op, before, after = "c", None, row["values"]
            elif isinstance(binlog_event, UpdateRowsEvent):
                op, before, after = "u", row["before_values"], row["after_values"]
            elif isinstance(binlog_event, DeleteRowsEvent):
                op, before, after = "d", row["values"], None
            else:
                continue

            event = {
                "table": binlog_event.table,
                "database": binlog_event.schema,
                "operation": op,
                "before": before,
                "after": after,
                "timestamp": datetime.datetime.utcnow().isoformat(),
            }

            event_json = json.dumps(event, default=serialize)
            r.lpush("db_events", event_json)
            r.ltrim("db_events", 0, 499)
            r.publish("db_changes", event_json)
            print(f"[CDC] {binlog_event.schema}.{binlog_event.table} op={op}", flush=True)

    except Exception as e:
        print(f"[Reader] Error processing event: {e}", flush=True)
        continue
