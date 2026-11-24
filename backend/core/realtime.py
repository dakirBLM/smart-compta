"""Live chat events delivered over Server-Sent Events (SSE).

When a message is sent, an event is published on one channel per recipient
(the company's accountant and the portal client). Each browser keeps one SSE
stream open on ``/api/chat/stream/`` and listens on its own user's channel.

The events carry ids only, never message content. The browser reacts by
re-reading the thread through the normal, permission-checked message API.

Broker: Redis pub/sub when ``REDIS_URL`` is set, so every server process sees
every event. Without it, an in-process broker is used (single process only).
"""
import json
import logging
import queue
import threading

from django.conf import settings

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "smartcompta:chat:user:"
HEARTBEAT_SECONDS = 20


def user_channel(user_id):
    return f"{CHANNEL_PREFIX}{user_id}"


class _LocalSubscription:
    def __init__(self, broker, channel):
        self._broker = broker
        self._channel = channel
        self._queue = queue.Queue()

    def get(self, timeout):
        """Return the next payload, or None if nothing arrived within timeout."""
        try:
            return self._queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def close(self):
        self._broker.unsubscribe(self._channel, self)


class _LocalBroker:
    def __init__(self):
        self._lock = threading.Lock()
        self._subscriptions = {}

    def publish(self, channel, payload):
        with self._lock:
            targets = list(self._subscriptions.get(channel, ()))
        for subscription in targets:
            subscription._queue.put(payload)

    def subscribe(self, channel):
        subscription = _LocalSubscription(self, channel)
        with self._lock:
            self._subscriptions.setdefault(channel, set()).add(subscription)
        return subscription

    def unsubscribe(self, channel, subscription):
        with self._lock:
            subscribers = self._subscriptions.get(channel)
            if subscribers:
                subscribers.discard(subscription)
                if not subscribers:
                    del self._subscriptions[channel]


class _RedisSubscription:
    def __init__(self, pubsub):
        self._pubsub = pubsub

    def get(self, timeout):
        message = self._pubsub.get_message(ignore_subscribe_messages=True, timeout=timeout)
        return message["data"] if message else None

    def close(self):
        try:
            self._pubsub.close()
        except Exception:
            logger.exception("Could not close the Redis subscription")


class _RedisBroker:
    def __init__(self, url):
        import redis

        self._client = redis.Redis.from_url(
            url, decode_responses=True, socket_keepalive=True, health_check_interval=30
        )

    def publish(self, channel, payload):
        self._client.publish(channel, payload)

    def subscribe(self, channel):
        pubsub = self._client.pubsub()
        pubsub.subscribe(channel)
        return _RedisSubscription(pubsub)


_broker = None
_broker_lock = threading.Lock()


def get_broker():
    global _broker
    with _broker_lock:
        if _broker is None:
            url = getattr(settings, "REDIS_URL", "")
            _broker = _RedisBroker(url) if url else _LocalBroker()
        return _broker


def reset_broker():
    """Forget the cached broker (used by tests and when settings change)."""
    global _broker
    with _broker_lock:
        _broker = None


def notify_new_message(message):
    """Tell both sides of a thread that it has a new message.

    Never raises: a broker outage must not stop a message from being saved.
    """
    payload = json.dumps(
        {
            "type": "message",
            "entreprise": message.entreprise_id,
            "client_id": message.client_user_id,
            "message_id": message.id,
        }
    )
    recipients = {message.entreprise.accountant_id, message.client_user_id}
    try:
        broker = get_broker()
        for user_id in recipients:
            broker.publish(user_channel(user_id), payload)
    except Exception:
        logger.exception("Could not publish the chat event for message %s", message.id)


def event_stream(user_id, heartbeat=HEARTBEAT_SECONDS):
    """Yield SSE frames for one user until the client disconnects."""
    subscription = get_broker().subscribe(user_channel(user_id))
    try:
        yield "retry: 3000\n\n"
        yield ": connected\n\n"
        while True:
            payload = subscription.get(timeout=heartbeat)
            if payload is None:
                # Comment frame: keeps proxies from closing an idle stream and
                # makes a dead client fail the write, which ends this generator.
                yield ": keepalive\n\n"
            else:
                yield f"data: {payload}\n\n"
    finally:
        subscription.close()
