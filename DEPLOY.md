# Deploying tinyleagueleaks.com

The site is a fully static build — any static host works. The recommended path is **Vercel** (free, fast, handles HTTPS automatically) with the domain pointed from **Namecheap**.

---

## 1. Push the project to GitHub

```bash
cd /Users/alwin/Github/tinyleagueleaks
git init
git add .
git commit -m "Initial site"
gh repo create tinyleagueleaks --public --source=. --remote=origin --push
```

(If you don't use `gh`, create the repo on github.com manually and `git push -u origin main`.)

## 2. Replace SHEET_URL

Open `src/App.tsx`, find:

```ts
const SHEET_URL = "https://docs.google.com/spreadsheets/d/REPLACE_WITH_YOUR_SHEET_ID/edit";
```

Replace with the real shareable URL of the league's Google Sheet. Make sure the sheet is shared as **Anyone with the link · Viewer**.

Commit and push the change.

## 3. Deploy to Vercel

1. Sign in at https://vercel.com (use your GitHub account).
2. Click **Add New… → Project**.
3. Import the `tinyleagueleaks` repo.
4. Vercel auto-detects Vite. Leave all defaults — `npm run build`, output `dist/`. Click **Deploy**.
5. After ~30s you'll have a `tinyleagueleaks.vercel.app` URL. Open it on your phone to verify mobile-first works as expected.

## 4. Point tinyleagueleaks.com to Vercel

### In Vercel
- Open your project → **Settings → Domains**.
- Add `tinyleagueleaks.com`. Vercel will show you the DNS records it needs.
- Also add `www.tinyleagueleaks.com` (Vercel will offer to redirect one to the other — pick whichever is canonical; apex `tinyleagueleaks.com` is the modern default).

You'll see something like:

| Type  | Name | Value                       |
| ----- | ---- | --------------------------- |
| A     | @    | `76.76.21.21`               |
| CNAME | www  | `cname.vercel-dns.com`      |

(Use the values Vercel actually shows you — they update them occasionally.)

### In Namecheap
1. Sign in to Namecheap → **Domain List** → click **Manage** next to `tinyleagueleaks.com`.
2. Go to the **Advanced DNS** tab.
3. Delete any default "Parking page" or "URL Redirect" records that Namecheap added when you bought the domain.
4. Add the records Vercel gave you:
   - **A Record**, Host `@`, Value `76.76.21.21`, TTL `Automatic`.
   - **CNAME Record**, Host `www`, Value `cname.vercel-dns.com.` (trailing dot is fine), TTL `Automatic`.
5. Save.

DNS usually propagates in 5–30 minutes. Vercel will auto-issue a free Let's Encrypt SSL cert as soon as it sees the records resolve. Refresh the **Settings → Domains** page until both rows show green ✓.

## 5. Verify

- https://tinyleagueleaks.com loads the masthead.
- https://www.tinyleagueleaks.com redirects to the apex (or vice versa, your call).
- Open it on an actual phone and run through the mobile checklist in `claude_code_prompt.md` — masthead fits, "Money in Motion" shows the simplified 4-line chart, standings render as cards, no horizontal scroll.

## Future updates

After the initial deploy, the workflow is just:

```bash
# edit src/, or update data/*.csv
git commit -am "Refresh ledger through Apr 27"
git push
```

Vercel auto-deploys every push to `main` within ~30 seconds.

## Alternative: Netlify or Cloudflare Pages

The same approach works on either host. The DNS records are different (Netlify gives you a `*.netlify.app` CNAME; Cloudflare wants you to delegate the whole zone to their nameservers). The Vercel path is the simplest for a no-config Vite site.
