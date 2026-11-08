# Run at logon in the user session, not as a Windows service

The daemon opens attachments with the user's default applications, so it must run inside the interactive logon session. A Windows service runs in session 0 and cannot launch applications on the user's desktop; `start` would silently do the wrong thing or fail. We therefore start the daemon at logon through Task Scheduler and accept that it does not run before the user logs in.

The same constraint decides the Linux shape: a `systemd --user` unit bound to `graphical-session.target`, never a system-wide service and never `default.target`. A user manager that starts before the compositor produces a daemon whose `/healthz` is green and whose attachment opening is broken, which is worse than a daemon that is plainly offline. Lingering stays off for the same reason: it would start the manager at boot without a graphical session to attach to.
