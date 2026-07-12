# Deploying EAJ HRIS

The application code is feature-complete and tested. What follows is the work
that is *not* code: the things that must be true of the server before real
employee data goes into it.

## Blockers — do not go live until these are done

**1. Turn off debug mode.**
`APP_DEBUG=true` returns a full stack trace — absolute file paths, framework
internals, query fragments — to anyone who triggers an error. Set
`APP_ENV=production` and `APP_DEBUG=false`.

**2. Remove the demo accounts.**
The seeder creates `admin@eaj.test`, `hr@eaj.test` and `employee@eaj.test`, all
with the password `password`, and the first is a SuperAdmin. Never run
`db:seed` against production. Create the real SuperAdmin instead:

```bash
php artisan tinker
>>> App\Models\User::create([
...   'name' => 'Real Admin',
...   'email' => 'admin@yourcompany.com',
...   'password' => Hash::make('<a long random password>'),
...   'company_id' => 1,
...   'is_super_admin' => true,
...   'preset' => 'super_admin',
... ]);
```

**3. Use a dedicated database user.**
Development runs as `root`. Create a user with rights on the HRIS schema only.

**4. Serve over HTTPS.**
Sanctum tokens are held in the browser's localStorage and sent as bearer
tokens. Over plain HTTP they are readable in transit.

**5. Set withholding tax.**
It ships at **0%** on purpose: Philippine withholding tax is progressive, and a
flat rate would silently produce wrong payslips. Configure it under
**Payroll → Salary components** before the first real run, or accept that no tax
is withheld.

**6. Decide about email.**
`MAIL_MAILER=log` means nothing is ever sent. Notifications appear in-app only.
Leave approvals, payslip releases and applicant confirmations will not reach
anyone by email until a real transport is configured.

## Server setup

```bash
composer install --no-dev --optimize-autoloader
npm ci && npm run build

php artisan key:generate        # only if APP_KEY is empty
php artisan migrate --force     # --force is required in production
php artisan storage:link        # uploads 404 without this

php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Point the web root at `public/`. Ensure `storage/` and `bootstrap/cache/` are
writable by the web user.

## What is already handled in code

- Login is rate limited (5 failed attempts per identifier and per IP, 60s lockout).
- Every API write is guarded by a module permission *and* branch scope; SuperAdmin bypasses both.
- Uploads are validated for type and size (5MB) and stored outside the web root, exposed via the storage symlink.
- Passwords are hashed; the audit log redacts password fields.
- The audit log is append-only.

## Known gaps

- **No queued email.** No `ShouldQueue` jobs exist yet, so no queue worker is
  needed *today* — but one will be (`php artisan queue:work`) as soon as mail is added.
- **No automated backups.** Payroll and 201 records are the system of record for
  people's pay. Schedule `mysqldump` plus a copy of `storage/app/public`.
- **No error monitoring.** With `APP_DEBUG=false`, failures become a generic 500
  for the user and a line in `storage/logs/laravel.log`. Nothing alerts you.
- **Not load tested.** Correctness is covered by tests; behaviour under
  concurrent payroll runs is not.
