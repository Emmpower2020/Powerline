#!/usr/bin/env python3
"""
Daemon-style starter for next-server.
Uses double-fork to fully detach from controlling shell.
"""
import os
import sys
import subprocess
import time
import signal
from pathlib import Path

PID_FILE = "/tmp/next-server.pid"
LOG_FILE = "/tmp/nextstart.log"
WORK_DIR = "/home/z/my-project"

def is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False

def kill_existing():
    if Path(PID_FILE).exists():
        try:
            old_pid = int(Path(PID_FILE).read_text().strip())
            if is_running(old_pid):
                os.kill(old_pid, signal.SIGTERM)
                time.sleep(2)
                if is_running(old_pid):
                    os.kill(old_pid, signal.SIGKILL)
        except Exception:
            pass
        Path(PID_FILE).unlink(missing_ok=True)
    # also kill any stray next-server
    subprocess.run(["pkill", "-9", "-f", "next-server"], capture_output=True)
    subprocess.run(["pkill", "-9", "-f", "next start"], capture_output=True)

def daemonize():
    """Standard double-fork to detach from terminal"""
    if os.fork() > 0:
        sys.exit(0)
    os.setsid()
    if os.fork() > 0:
        sys.exit(0)
    # redirect stdio
    sys.stdout.flush()
    sys.stderr.flush()
    with open('/dev/null', 'r') as f:
        os.dup2(f.fileno(), 0)
    with open(LOG_FILE, 'a') as f:
        os.dup2(f.fileno(), 1)
        os.dup2(f.fileno(), 2)

def main():
    kill_existing()
    time.sleep(1)
    daemonize()
    # Write PID file
    Path(PID_FILE).write_text(str(os.getpid()))
    # Set environment
    env = os.environ.copy()
    env["NODE_ENV"] = "production"
    env["NODE_OPTIONS"] = "--max-old-space-size=512"
    # Exec next start (replaces current process — daemon child)
    os.chdir(WORK_DIR)
    os.execvpe(
        "npx",
        ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"],
        env,
    )

if __name__ == "__main__":
    main()
