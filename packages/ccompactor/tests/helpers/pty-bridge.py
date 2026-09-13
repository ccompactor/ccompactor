#!/usr/bin/env python3
"""Run a command on a pty and forward it to a pipe.

Node cannot allocate a pty, and `script(1)` on macOS refuses to start unless its
own stdin is already a terminal — neither can be arranged from a test. Python's
`pty` module is in the standard library on macOS and Linux, which is where these
tests run.

The window size is set explicitly, so the layout under test is a number the test
chose rather than whatever the runner happened to report.

usage: pty-bridge.py COLUMNS ROWS COMMAND [ARG...]
"""
import errno
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios


def main() -> int:
    if len(sys.argv) < 4:
        sys.stderr.write("usage: pty-bridge.py COLUMNS ROWS COMMAND [ARG...]\n")
        return 2
    columns = int(sys.argv[1])
    rows = int(sys.argv[2])
    argv = sys.argv[3:]

    # The window size is set on the slave *before* the child exists.
    #
    # `pty.fork()` then a `TIOCSWINSZ` is a race the child can lose: it starts,
    # reads `columns` as 0, and on Linux that is what it renders to — Ink wrote
    # no frame at all, which is how a TUI ends up producing nothing but the
    # mouse-tracking escape and looking hung.
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))

    pid = os.fork()
    if pid == 0:
        try:
            os.close(master)
            os.setsid()
            # Become the controlling terminal, so `isTTY` is true for the child
            # and the TUI's own gate on stdin passes.
            fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
            os.dup2(slave, 0)
            os.dup2(slave, 1)
            os.dup2(slave, 2)
            if slave > 2:
                os.close(slave)
            os.execvp(argv[0], argv)
        except OSError as error:
            sys.stderr.write(f"pty-bridge: cannot exec {argv[0]}: {error}\n")
            os._exit(127)
    os.close(slave)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    stdin_open = True

    while True:
        watch = [master] + ([stdin_fd] if stdin_open else [])
        try:
            readable, _, _ = select.select(watch, [], [], 1.0)
        except InterruptedError:
            continue
        except OSError as error:
            if error.errno == errno.EINTR:
                continue
            raise

        if master in readable:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                break
            if not chunk:
                break
            os.write(stdout_fd, chunk)

        if stdin_open and stdin_fd in readable:
            try:
                chunk = os.read(stdin_fd, 65536)
            except OSError:
                chunk = b""
            if not chunk:
                # stdin closed: keep reading the pty, but stop watching it.
                stdin_open = False
            else:
                os.write(master, chunk)

        # Reap without blocking, so the loop ends when the program does.
        try:
            done, status = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            break
        if done:
            # Drain whatever is still buffered before reporting the status.
            while True:
                try:
                    readable, _, _ = select.select([master], [], [], 0.2)
                except InterruptedError:
                    continue
                if not readable:
                    break
                try:
                    chunk = os.read(master, 65536)
                except OSError:
                    break
                if not chunk:
                    break
                os.write(stdout_fd, chunk)
            os.close(master)
            if os.WIFEXITED(status):
                return os.WEXITSTATUS(status)
            if os.WIFSIGNALED(status):
                return 128 + os.WTERMSIG(status)
            return 1

    try:
        os.close(master)
    except OSError:
        pass
    return 0


if __name__ == "__main__":
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    sys.exit(main())
