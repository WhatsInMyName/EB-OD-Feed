# Signal Desk — setup guide

An EB/OD material reader that costs nothing to run. A GitHub Action fetches your
feeds on a schedule and saves them to a data file; GitHub Pages serves the page
that reads it. No server, no card, no build tools.

## How the pieces fit

```
  sources.json  ──►  GitHub Action (every 3h)  ──►  writes feed-data.json  ──┐
                       (runs fetch-feeds.mjs)                                 │
                                                                             ▼
  your browser  ◄────────  GitHub Pages serves  ◄────────  index.html reads feed-data.json
```

- **sources.json** — your master list of sources + topics. You edit this.
- **fetch-feeds.mjs** — the fetch script the Action runs. You don't touch it.
- **update-feeds.yml** — the schedule + instructions for the Action.
- **feed-data.json** — the fetched results. The Action overwrites this; don't edit by hand.
- **index.html** — the page everyone opens.

---

## Repo layout

Put the files in a repo exactly like this:

```
your-repo/
├── index.html
├── sources.json
├── feed-data.json          (starts as an empty placeholder)
├── fetch-feeds.mjs
├── package.json
├── README.md
└── .github/
    └── workflows/
        └── update-feeds.yml   ← note the folders: .github/workflows/
```

The only fiddly bit is that `update-feeds.yml` must sit inside a `.github/workflows/`
folder. Everything else goes in the repo root.

---

## Part 1 — Create the repo and add the files

1. Go to github.com → **New repository**. Name it (e.g. `signal-desk`).
   Public is fine and simplest (Pages and Actions are free with no minute cap on
   public repos). If you make it private, Actions still has a free monthly allowance
   that this easily fits inside.
2. Upload the files. Easiest in the browser: on the repo page, **Add file → Upload files**,
   drag in `index.html`, `sources.json`, `feed-data.json`, `fetch-feeds.mjs`,
   `package.json`, `README.md`, and **Commit**.
3. For the workflow file, create it with the right path: **Add file → Create new file**,
   type `.github/workflows/update-feeds.yml` as the name (GitHub turns the slashes into
   folders), paste in the contents of `update-feeds.yml`, and **Commit**.

---

## Part 2 — Turn on GitHub Pages

1. Repo **Settings → Pages**.
2. Under **Build and deployment**, set **Source = Deploy from a branch**.
3. **Branch = main** (or `master`), **folder = / (root)**. **Save**.
4. Wait ~1 minute. The page appears at:
   `https://<your-username>.github.io/<repo-name>/`
   (Settings → Pages shows the exact link once it's live.)

At this point the page loads but is empty — it has no data yet. That's the next step.

---

## Part 3 — Run the Action for the first time

The Action is scheduled every 3 hours, but you don't want to wait — run it manually once.

1. Repo **Actions** tab. If GitHub asks you to enable workflows, click to enable.
2. In the left list, click **Update feed data**.
3. Click **Run workflow → Run workflow** (the button on the right).
4. Watch it run (~1–2 minutes). Click into the run to see live logs — you'll see
   `ok` / `FAIL` lines for each source. `FAIL` is normal for a few; it just means
   that feed URL didn't resolve.
5. When it finishes green, it will have committed an updated `feed-data.json`. You'll
   see a new commit from **feed-bot** on the repo home page.

---

## Part 4 — Test it

1. Open your Pages URL and hit **Refresh** (top right).
2. **Trusted** tab should now show articles, and the status line shows
   "X loaded · Y unavailable · updated just now".
3. Open **Source status** (the panel) — green sources loaded, red ones failed.
4. **Discover** tab should show recent articles plus amber "new publishers spotted" chips.
5. Try the workflow: **Save** an article → check it appears under **Saved**;
   **Tag** it → filter by that tag; **Quote** it → it shows in the quotes block;
   **Copy all quotes** → paste somewhere to confirm.

If everything works, you're done. Share the Pages URL with the firm.

---

## Editing your sources and topics

Everything lives in **sources.json**.

- **Add a direct feed:** add an object to the `sources` array:
  ```json
  { "name": "People Matters", "cat": "Employer Brand", "mode": "direct", "url": "https://www.peoplematters.in/rss" }
  ```
  Tip for finding a feed: try the site's URL with `/feed` or `/rss` on the end.

- **Add a "watch via Google News" source** (when there's no clean feed):
  ```json
  { "name": "Some Consultancy", "cat": "OD", "mode": "news", "query": "\"Some Consultancy\" culture" }
  ```
  (The Discover tab's **Add** button copies a line in exactly this shape for you.)

- **Fix a red/failed source:** correct its `url`, or switch it to `"mode": "news"`
  with a `query`.

- **Change topics:** edit the `topics` array (each entry is a Google News search;
  wrap phrases in `\"quotes\"` to force exact matches).

- **Change region:** edit `locale`. `en-IN` / `IN` / `IN:en` biases toward India +
  global English. For US, use `en-US` / `US` / `US:en`.

After editing, commit. The next scheduled run picks it up — or run the Action manually
to see it immediately.

---

## Schedule notes (worth knowing)

- GitHub cron is **always UTC**. `0 */3 * * *` = every 3 hours. To change frequency,
  edit the `cron` line in `update-feeds.yml` (e.g. `0 */6 * * *` for every 6 hours).
- Scheduled runs are **best-effort** — under heavy GitHub load they can be a few
  minutes late. Fine for a reader.
- **On public repos, GitHub disables scheduled workflows after 60 days with no repo
  activity.** Any commit (or a manual "Run workflow") re-enables it. If content ever
  goes stale, that's the likely reason — just run it once.

---

## Troubleshooting

- **Page is blank / "No data yet":** the Action hasn't run, or Pages hasn't rebuilt.
  Run the Action (Part 3), then Refresh. Confirm `feed-data.json` in the repo is no
  longer the empty placeholder.
- **Every source failed in the logs:** likely a network hiccup on GitHub's side — re-run.
  If it persists, one bad entry in `sources.json` (malformed JSON) can break the run;
  check the logs for a parse error.
- **A specific source is always red:** its feed URL is wrong or it has no RSS. Fix the
  `url` or switch it to `"mode": "news"`.
- **Changes to sources.json didn't show up:** you need a run after committing. Run the
  Action manually, then Refresh the page.
- **Saved items disappeared:** saves live in the browser (localStorage). A different
  browser/device/person has their own set. To share saves across people, see Part 5.

---

## Part 5 (optional) — Firestore for a shared firm library

Everything above is free and needs no account beyond GitHub. The one thing it does
**not** do is share saved items and quotes across people and devices — those live in
each person's browser.

To share them, you add Firebase **Firestore** + **Auth**. This runs entirely on the
free **Spark** plan (no card, no Cloud Functions) because the page talks to Firestore
directly from the browser.

**Set up the Firebase side (no card needed):**

1. console.firebase.google.com → **Add project** → name it → you can skip Analytics → **Create**.
   Leave it on the free **Spark** plan.
2. On the project overview, click the **web icon (`</>`)** to register a web app.
   Give it a nickname, **Register app**. Firebase shows you a `firebaseConfig`
   object — copy it, you'll need it.
3. Left menu → **Build → Authentication → Get started** → enable **Google** as a
   sign-in provider (simplest for a firm on Google Workspace). Save.
4. Left menu → **Build → Firestore Database → Create database** → start in
   **production mode** → pick a region → Enable.
5. **Rules** tab → paste rules so each person can only read/write their own saved items:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
   Publish.

**What's left:** wiring the page to sign in and read/write Firestore instead of
localStorage. That's a change to `index.html` (add the Firebase SDK, a sign-in button,
and swap the save/quote functions to write to `users/{uid}/...`). It's a self-contained
next step — ask and it can be built on top of this version.

> Free-tier headroom, so you know it fits: Firestore's free plan allows 50,000 reads
> and 20,000 writes **per day** and 1 GB stored. A firm reading and saving articles
> won't come close.
