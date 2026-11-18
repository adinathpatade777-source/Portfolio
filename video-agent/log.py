import time

_start = time.time()


def log(msg):
    t = int(time.time() - _start)
    print(f"[{t // 60:02d}:{t % 60:02d}] {msg}", flush=True)
