# Native factory fixture

This protected synthetic app exercises a real Expo SQLite store and native
delivery. It is not a budgeting product, app template or benchmark candidate.
The dependency graph and lockfile are the common Expo 57/RN 0.86 inputs.

An empty store starts with counter-a and counter-b at 0. The independent device
journey writes a twice and b once, then restarts and requires values 2 and 1.
After a consistent complete-state backup, writing sentinel adds its own row.
A successful restore into an empty owned target must retain both counter IDs
and values, exclude sentinel, and permit another durable write after reopening.
These checks remain pending until actual native build/device evidence exists.

Existing invalid or incompatible stores display an error without replacing the
saved records. The package is app.micro.factory.fixture. Only the trusted
controller operates its dedicated synthetic device and recovery targets.
No network, accounts, external services or product-repository source is used.
