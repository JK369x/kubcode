# Scheduled publishing

Skill editing or preparing a queue does not create a schedule. Bind the explicitly selected account, full date/time with timezone, exact clip/caption/cover and hashes, private receipt, expiry and missed-run policy. Use Asia/Bangkok unless specified otherwise. Account selection does not authorize unspecified episodes.

Use the host agent application's real automation tool when available; inspect existing schedules to prevent duplicates. Include the exact skill path for this clone, account binding and job details in the saved prompt, never tokens. Verify actual durable job ID, active status and next run before reporting scheduled. If no scheduler is available, prepare the job and state it is unscheduled. Do not invent an IG publish_at parameter.

At execution verify identity, unchanged files, cover, duplicate receipts and current quota. Use authorized HTTPS staging and Bun + Elysia provider code; the starter does not implement publishing/staging. Record container/media IDs and reconcile uncertain outcomes before retrying. Disable one-time jobs after verified success.

A trigger starts work; service processing can delay publication. Do not promise second-exact timing. Local jobs require the machine, files and scheduler running; a server deployment is separate work. Never use long sleeps as a scheduler.
