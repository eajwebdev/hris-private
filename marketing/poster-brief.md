# EAJ HRIS — Poster Brief & Generation Script

**Purpose:** source of truth for any AI/designer producing the EAJ HRIS lead-gen poster.
**Goal of the poster:** make a Philippine SME owner/HR message us on Messenger.
**The argument the poster makes:** *this many modules, for ₱79 per employee.* The price is the hook;
the feature grid is the proof that ₱79 is absurd value. Neither works alone — a bare price looks
cheap and suspicious, a bare feature list looks expensive. They must be seen together, in one glance.

---

## 0. HARD RULES — do not violate

- **Price is ₱79 / employee / month.** Never write ₱79 flat, never "starting at", never "per user".
- **Only claim what the system does.** Allowed: DTR with selfie + GPS geofence, payroll from
  attendance, digital payslip + PDF, leave approvals, service credits, recruitment pipeline,
  performance reviews, events + RSVP, announcements, analytics, multi-branch, audit log.
- **NEVER claim:** automatic OT computation, automatic tax/BIR, night differential, 13th month,
  biometric hardware, government remittance filing. These do not exist. A false claim on a poster
  is a refund request later.
- No stock photos of foreigners in glass towers. Filipino SME context or clean UI/illustration only.
- No fake logos, no fake client names, no fake testimonials, no invented review counts.

---

## 1. Brand

| Token | Hex | Use |
|---|---|---|
| Navy | `#0a1134` | Background, ink |
| Crimson | `#d61b5d` | Price, CTA, accents |
| Amber | `#e39a3b` | Sparingly — badge/highlight |
| Success | `#1d9e6f` | Checkmarks |
| Off-white | `#f7f8fb` | Body text on navy |

- Logo: circular EAJ mark (`public/logo2.png`) top-left or top-center. Landscape lockup
  (`public/logo1.jpg`) only if the layout is wide.
- Typography: one geometric/grotesque sans (Poppins, Inter, or Montserrat). Headline in
  ExtraBold/Black, body in Regular/Medium. Never more than two weights + two sizes of body.

---

## 2. Layout spec (top → bottom)

Format: **1080 × 1350 px** (Facebook/Instagram portrait). Also export **1080 × 1080** square.
Safe margin: 80px all sides. Dark navy base with a subtle crimson glow bottom-right.

**Budget the height like this:** price block ~22%, feature grid ~40%, everything else ~38%.
The feature grid is the largest region on the poster — that is deliberate.

1. **Logo** — top, small, ~90px tall.
2. **Eyebrow** — small crimson uppercase, letter-spaced: `HRIS PARA SA PINOY NA NEGOSYO`
3. **Headline** — bold white, 2 lines: `Buong HR system` / `ng negosyo mo.`
4. **PRICE BLOCK** — `₱` small, `79` very large (crimson, or white on a crimson slab),
   `/empleyado kada buwan` directly under it. Then one thin line:
   `20 empleyado = ₱1,580/buwan — para sa LAHAT ng nasa baba.`
   That last sentence is the hinge of the whole poster: it points the price *at* the grid.
   The `79` must still be readable when the poster is shrunk to a 150px feed thumbnail.
5. **★ FEATURE GRID — the hero block.** 9 modules, 3×3, icon + short label each.
   - Each cell: a thin rounded card (1px crimson or white border at ~20% opacity, or a very
     dark navy fill), a minimal line icon on top, label under it in 2 short lines max.
   - Equal cell sizes, even gutters. It should read as one dense, complete slab — the visual
     message is *"look how much you get"*, and density is the message.
   - Above the grid, a small crimson section label: `LAHAT NG ITO, KASAMA NA:`
   - The nine cells, in this order (see §3 for exact labels):
     DTR · Payroll · Payslip · Leave · Service Credits · Recruitment · Performance ·
     Announcements & Events · Reports & Analytics
6. **Under-grid line** — small, muted, one line, catches the leftovers:
   `+ Multi-branch · Employee 201 files · Careers page · Audit log`
7. **Trust line** — 3 green checkmarks, one row, small:
   `Walang installation fee · Walang biometric device · Walang lock-in`
8. **CTA block** — crimson button-shaped slab, high contrast:
   `FREE TRIAL — I-message ang "HRIS"`
   Below it, small: `Online agad. Walang i-install.`
9. **Footer** — page name / FB handle / website. Small, muted.

---

## 3. Copy — use verbatim

**Eyebrow:** HRIS PARA SA PINOY NA NEGOSYO

**Headline:** Buong HR system ng negosyo mo.

**Price:** ₱79
**Price sub:** /empleyado kada buwan
**Price proof:** 20 empleyado = ₱1,580/buwan — para sa LAHAT ng nasa baba.

**Grid label:** LAHAT NG ITO, KASAMA NA:

**The 9 feature cells** — label on line 1 (bold), benefit on line 2 (small, muted):

| # | Icon | Line 1 | Line 2 |
|---|------|--------|--------|
| 1 | map pin + selfie | **DTR** | Selfie + GPS geofence |
| 2 | lightning bolt | **Payroll** | Zero re-encoding |
| 3 | phone / receipt | **Payslip** | Diretso sa phone, may PDF |
| 4 | calendar-check | **Leave** | Employee ➜ Supervisor ➜ HR |
| 5 | ticket | **Service Credits** | Bayad na leave, tracked |
| 6 | user-plus | **Recruitment** | Applied ➜ Interview ➜ Hired |
| 7 | star | **Performance** | Reviews at ratings |
| 8 | megaphone | **Announcements** | Events + RSVP |
| 9 | bar chart | **Reports** | Analytics + export |

**Under-grid line:** + Multi-branch · Employee 201 files · Careers page · Audit log

**Trust:** Walang installation fee · Walang biometric device · Walang lock-in

**CTA:** FREE TRIAL — I-message ang "HRIS"
**CTA sub:** Online agad. Walang i-install, walang ida-download.

---

## 4. Copy-paste prompt for the image AI

> Create a 1080×1350 portrait social media poster for **EAJ HRIS**, a Philippine HR & payroll
> software for small and medium businesses. Modern SaaS advertising aesthetic — clean, confident,
> high contrast, absolutely not clip-art.
>
> **Palette:** deep navy background `#0a1134`, crimson `#d61b5d` for the price and call-to-action,
> off-white `#f7f8fb` text, green `#1d9e6f` checkmarks. Subtle crimson radial glow in the
> bottom-right corner. Optional faint geometric grid or a soft blurred screenshot of an HR
> dashboard at very low opacity behind the content — it must never compete with the text.
>
> **Typography:** one geometric sans (Poppins / Inter / Montserrat). Headline ExtraBold.
>
> **The poster makes one argument: a huge amount of software, for ₱79 per employee.** So it has two
> hero elements — a big price, and a big feature grid — and the price points down at the grid.
>
> **Top:** a small crimson uppercase eyebrow `HRIS PARA SA PINOY NA NEGOSYO`, then a bold white
> headline `Buong HR system ng negosyo mo.` Leave clear space above for a circular logo.
>
> **Price block (about 22% of the height):** `₱79` at large scale in crimson (or white on a crimson
> slab), with `/empleyado kada buwan` in small clean type directly beneath. Under that, one thin
> line: `20 empleyado = ₱1,580/buwan — para sa LAHAT ng nasa baba.` The `79` must stay legible when
> the poster is viewed as a small feed thumbnail.
>
> **Feature grid (about 40% of the height — the largest block on the poster):** above it, a small
> crimson label `LAHAT NG ITO, KASAMA NA:`. Then a **3×3 grid of nine equal cards**, each a thin
> rounded card with a subtle border, containing a minimal white line icon and two lines of text —
> a bold label and a small muted benefit underneath:
>
> 1. map-pin/selfie icon — **DTR** / "Selfie + GPS geofence"
> 2. lightning icon — **Payroll** / "Zero re-encoding"
> 3. phone icon — **Payslip** / "Diretso sa phone, may PDF"
> 4. calendar-check icon — **Leave** / "Employee ➜ Supervisor ➜ HR"
> 5. ticket icon — **Service Credits** / "Bayad na leave, tracked"
> 6. user-plus icon — **Recruitment** / "Applied ➜ Interview ➜ Hired"
> 7. star icon — **Performance** / "Reviews at ratings"
> 8. megaphone icon — **Announcements** / "Events + RSVP"
> 9. bar-chart icon — **Reports** / "Analytics + export"
>
> The grid should read as one dense, complete slab — the density *is* the message. Equal cells,
> even gutters, consistent icon weight across all nine.
>
> **Under the grid:** one small muted line — `+ Multi-branch · Employee 201 files · Careers page ·
> Audit log`. Then a row of three green checkmarks: `Walang installation fee · Walang biometric
> device · Walang lock-in`.
>
> **Bottom:** a solid crimson call-to-action slab reading `FREE TRIAL — I-message ang "HRIS"`,
> with small text under it: `Online agad. Walang i-install.`
>
> Strong vertical hierarchy, crisp correctly-spelled text, consistent icon style. Do not invent any
> logos, brand names, testimonials, star ratings, or features beyond the nine listed — in
> particular, never add overtime computation, tax/BIR filing, night differential, 13th month pay,
> or biometric hardware.

---

## 5. Variants worth generating

- **Square 1080×1080** — same hierarchy, feature strip becomes 2×2.
- **Story 1080×1920** — price even bigger, features cut to 3, CTA pinned to bottom third.
- **"Compute mo" variant** — replace the feature strip with a 3-row price ladder:
  `10 empleyado — ₱790` / `25 empleyado — ₱1,975` / `50 empleyado — ₱3,950`.
  Strong for cost-conscious owners; use as the second boost creative and A/B against the main one.

---

## 6. Before publishing

- [ ] `billing_rate_per_employee` in the app is set to `79` — a lead who signs up must see the same
      price the poster promised.
- [ ] `marketing/messenger-autoreply.md` FAQ 1 updated from ₱50 to ₱79 (it still says ₱50).
- [ ] The Messenger auto-reply fires on the keyword `HRIS` — the poster's entire CTA depends on it.
- [ ] Arithmetic on the poster is correct: 79 × 20 = 1,580.
