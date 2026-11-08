# Device registry

Manufacturers upload CSV files of the devices they've made. Anyone can look up a model by its TAC, and admins can look up a single device by IMEI.

Node and TypeScript on the server (Express, Apollo), React with Vite on the front, Postgres for storage. The two searches are GraphQL. The CSV upload is an ordinary POST to `/api/imports`, because multipart uploads over GraphQL are more trouble than they're worth here.

## Running it

You just need Docker.

    docker compose up --build       # then open http://localhost:3000
    docker compose run --rm test    # tests
    docker compose down             # stop, keep the data
    docker compose down -v          # stop and throw the data away

On start the app runs the migrations, adds the demo users and starts listening. You can restart it as much as you like, it won't add anything twice. Postgres is also exposed on localhost:5433 if you want to look inside.

## Demo logins

All made up, for local use.

- admin@example.test / admin-demo-pass
- aurora@example.test / aurora-demo-pass (owns TACs 00123401 to 00123404)
- boreal@example.test / boreal-demo-pass (owns TACs 00987601 to 00987603)

Nothing is in the registry to begin with. The five sample files are in `server/test/fixtures`. Upload 01, 02, 04 and 05 as Aurora and 03 as Boreal. 04 and 05 are supposed to fail.

## Where things are

- `server/src/imports` - CSV parsing, row validation, and the transaction that saves a file
- `server/src/graphql`, `server/src/auth` - schema and resolvers, sessions and passwords
- `server/migrations` - plain SQL, applied in name order by a small runner
- `web/src` - the four pages: TAC lookup, login, upload, admin IMEI lookup

## Decisions

The brief says data integrity and access control matter most, so that's where the time went. The UI got what was left.

An import either saves completely or not at all. I check the whole file first (format, ownership, clashes inside the file, clashes with what's already stored) and only then write, in one transaction. If anything is wrong, nothing is kept, and that includes the brand and model for a new TAC. All the problems are reported together with their line numbers in the file, counting the header and any blank lines.

Ownership is checked before anything else on each row. If the TAC isn't one of the signed-in manufacturer's, the row gets a single "not assigned to your account" error, and it's then ignored by every other check. It's the same message whether the TAC is unknown or belongs to someone else. This matters because an IMEI starts with its TAC. Once foreign TACs are dropped, the checks against stored devices can only ever look at the manufacturer's own IMEIs, so there's no way for an error message to give anything away about another manufacturer.

The user, role and manufacturer all come from the session cookie and nowhere else. The cookie holds a random token and the database holds a hash of it. If someone sends a manufacturer ID in the form or in a header it's just ignored (there's a test for that). Passwords are hashed with scrypt, and an email that doesn't exist takes about as long to reject as a wrong password.

For the `device` query the admin check is the very first thing that happens, before the IMEI is even looked at. So a manufacturer or anonymous caller gets the same FORBIDDEN error for an IMEI that exists, one that doesn't, and one that's garbage. The public `TacModel` type has no fields that lead to devices, counts or accounts, and a test checks the list of fields so a new one can't slip in unnoticed. The React app hides pages from the wrong role, but that's only to be tidy. The server decides.

I used `pg` with hand-written SQL, no ORM. That keeps the rules where you can see them, in `001_initial.sql`: IMEI and TAC formats, IMEI must start with its TAC, one manufacturer per TAC, and a user is a manufacturer if and only if they have a manufacturer ID. So the database enforces the basics even if the code is wrong. Brand and model are in `tac_models`, which only gets a row after a file is accepted. The manufacturer name is joined in from the assignment instead of being copied. Carton and pallet serials are just text columns on the device. The brief says the carton-to-pallet mapping can be trusted and there are no packaging screens, so separate tables seemed like extra work for nothing. Empty optional values are stored as NULL. Dates are returned as `YYYY-MM-DD` strings so time zones can't change a value and make an identical row look like a conflict.

Things I wasn't sure about:

- What counts as a repeat. I went with all twelve trimmed values being equal, case sensitive. If the IMEI is already stored and anything differs, the file is rejected and the stored record is left alone.
- Whether a rejected file should leave catalogue entries behind. It doesn't.
- Whether a manufacturer should be told that an IMEI under someone else's TAC is already registered. They aren't. The brief is explicit about this.

Trade-offs worth knowing about:

- Each request looks the session up in the database. It costs a query, but sessions can be revoked and the browser doesn't hold anything sensitive.
- A file is read into memory and saved in one go. Fine for 1,000 rows, wrong for huge files.
- Express serves the built React app, which means one container and no CORS to think about, but you can't host the front end separately without changes.

## Tests

`docker compose run --rm test`. They use Vitest against a real Postgres database (`registry_test`), no mocking.

- Unit tests for the Luhn check, CSV parsing and row validation. These include BOM, CRLF, blank lines, line numbers, wrong header, 0 and 1,001 rows, and dates like 2026-02-30.
- `imports.samples.test.ts` uploads the five sample files in order and checks the results against the expected outcomes. That covers the counts, the error lines, re-uploading 01 giving 0 new and 10 skipped, rejected files leaving nothing behind, a conflicting upload not changing the stored record, and Aurora uploading Boreal's file getting ownership errors only.
- `access.test.ts` checks the identical FORBIDDEN for known, unknown and malformed IMEIs (anonymous and manufacturer), the full record or null for an admin, the fields on `TacModel`, 401 for an anonymous upload and 403 for an admin upload, and that a spoofed manufacturer ID does nothing.
- Login, logout and password hashing have their own tests.

I also went through the UI by hand in a browser, starting from an empty database (`docker compose down -v`, then `up --build`). This is a manual check only, nothing automated. In order:

1. Signed out: looked up a TAC before anything was imported (not found), tried malformed TACs (validation message), and opened the upload and device pages directly (refused).
2. Signed in as Aurora (after trying a wrong password first). Uploaded 01 (10 new, 0 skipped), 02 (5 new, 2 skipped), then 01 again (0 new, 10 skipped) to check a repeat file is harmless. Then 04 and 05, which were rejected with the expected line numbers, and 03, which was rejected with ownership errors only.
3. Signed out, signed in as Boreal. Uploaded 03 (10 new) and tried 01, which was rejected with ownership errors only.
4. Signed out and looked up TACs 00123402, 00123404 and 00987601 to check brand, model and manufacturer, and that no device details show.
5. Signed in as admin. Looked up IMEI 001234010000010 (still Black, so file 05 didn't change it), then two IMEIs that only appeared in rejected files (not found), and a malformed one (validation message).
6. As Aurora, sent the `device` query to `/graphql` from the browser console with a known, an unknown and a malformed IMEI. All gave the same FORBIDDEN.
7. Ran `docker compose restart app` and repeated a TAC lookup and the admin lookup. The data was still there, and the restart didn't add or change anything.

Not covered by automated tests: the React pages, big files, two imports at once. I'd add React Testing Library tests for the pages first, then one Playwright test that uploads a file and looks a device up.

## Where I got to

Working: login for the three accounts, the import including repeats and conflicts, both lookups, a page for each, and Docker.

Not done: UI tests, separate carton and pallet tables, and anything to handle very large files (streaming, or `COPY`).

If I carried on, the next job is two imports at the same time. The brief says to assume they happen one at a time so I didn't add any locking. The database keys would make a clash fail the whole transaction instead of corrupting anything, but two uploads could both pass the checks before either one saves. I'd lock the manufacturer's assignment rows with `SELECT ... FOR UPDATE` at the start of the transaction and write a test that fires two uploads together.

## Time spent

About 1 hour 35 minutes of building, of the 3 allowed (09:45 to 11:20, going by the commit times). I stopped building at that point because everything in the brief was working and tested, and I'd rather not add extras I haven't been asked for.

Roughly:

- 25 minutes: setup and scaffolding
- 10 minutes: schema, login, CSV import and both lookups, with their tests
- 10 minutes: the React pages
- 15 minutes: Docker and this README
- 30 minutes: a review of the whole change, fixing what it found, then a clean run through Docker

It went quickly because AI wrote most of the code (see below).

### How I'm using the rest of the time

1. Going through the app by hand again from an empty database, following the checklist under Tests, because the review changed some of the upload and sign-out handling.
2. Reading the code myself so I can explain and change any part of it without AI, starting with the import (`server/src/imports/importService.ts`) and the access checks.
3. Practising small changes by hand, such as a new validation rule with its test.

I'm deliberately not spending it on locking for simultaneous imports, UI tests or styling. Those are listed as next steps under "Where I got to".

## AI usage

I used Claude Code for most of this: Sonnet to build it and Opus for a final review. I had it write a plan first (stack, data model, import steps, test list, commit order), then build it one commit at a time from that plan: scaffold, schema and seed, login, CSV parsing, the import endpoint, the two GraphQL lookups, the React pages, and Docker with this README.

To check the output I ran the tests (including the five sample files against the expected outcomes), ran the whole thing through Docker from an empty database, and went through the app by hand in the browser as described above. I also called the GraphQL endpoint directly to check the access rules.

At the end I had it review the full change and check every code comment. That found real problems, which were fixed:

- a failed sign-out was silent
- upload mistakes such as a wrong form field came back as a 500 error page instead of a clear 400
- an "OK" reply from the server that wasn't valid JSON showed a blank page
- some type shortcuts in the import code weren't explained
- two comments were inaccurate
