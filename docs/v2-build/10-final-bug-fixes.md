# Final 8 Bug Fixes — Post Code Review Cleanup

## CONTEXT

Deep code review found 30 bugs. 22 were fixed. These 8 remain. Fix all of them. None are showstoppers but they affect quality and reliability.

## FIXES

### Fix 1: google-auth.ts — Add refresh token error handling

The OAuth client validates env vars but doesn't catch `invalid_grant` when Google revokes the token. Add a wrapper:

**File: `artifacts/api-server/src/lib/google-auth.ts`**

After creating the OAuth2 client, listen for token refresh failures:

```typescript
// After _auth.setCredentials(...)
_auth.on("tokens", (tokens) => {
  // If Google rotates the refresh token, log it so Tony can update the env var
  if (tokens.refresh_token) {
    console.warn("[google-auth] Google issued a new refresh token. Update GOOGLE_REFRESH_TOKEN env var:", tokens.refresh_token);
  }
});
```

Also export a helper that wraps Google API calls with error detection:

```typescript
export async function withGoogleAuth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (err?.response?.data?.error === "invalid_grant" || err?.message?.includes("invalid_grant")) {
      // Clear the cached auth so next call re-initializes
      _auth = null;
      throw new Error("Google OAuth token expired or revoked. Re-authenticate at Google Cloud Console and update GOOGLE_REFRESH_TOKEN.");
    }
    throw err;
  }
}
```

### Fix 2: eod.ts — Upgrade auto-EOD from Haiku to Sonnet

**File: `artifacts/api-server/src/routes/tcc/eod.ts`**

In the `sendAutoEod()` function, find both Claude API calls that use `"claude-haiku-4-5"` and change them to `"claude-sonnet-4-6"`. This is a once-daily report that drives accountability — worth the extra ~$0.02/day for better analysis.

### Fix 3: brief.ts — Add 3rd email category (Promotions)

**File: `artifacts/api-server/src/routes/tcc/brief.ts`**

Check the `fetchLiveEmails()` function. The Claude classification prompt should already ask for 3 categories: "important", "fyi", "promotions". If it only asks for 2, update the prompt to include:

```
Classify each email into exactly 3 categories: "important", "fyi", or "promotions".
Promotions: newsletters, marketing emails, automated notifications, social media, promotional offers.
Return JSON: { "important": [...], "fyi": [...], "promotions": [...] }
```

Make sure the response parsing extracts `promotions` and the brief response includes `emailsPromotions`.

NOTE: Based on the latest code review, this may ALREADY be fixed. Check first before changing. If the prompt already has 3 categories and `emailsPromotions` is returned, skip this fix.

### Fix 4: brief.ts — Add contact brief-line per email sender

**File: `artifacts/api-server/src/routes/tcc/brief.ts`**

After the email classification step, for each Important email, look up the sender in the contacts table:

```typescript
// After emails are classified, enrich Important emails with contact context
for (const email of emailsImportant) {
  try {
    const [contact] = await db.select()
      .from(contactsTable)
      .where(ilike(contactsTable.name, `%${email.from.split(/[<(]/)[0].trim()}%`))
      .limit(1);

    if (contact) {
      const commCount = await db.select({ count: sql<number>`COUNT(*)` })
        .from(communicationLogTable)
        .where(eq(communicationLogTable.contactId, contact.id));

      const [lastComm] = await db.select()
        .from(communicationLogTable)
        .where(eq(communicationLogTable.contactId, contact.id))
        .orderBy(desc(communicationLogTable.loggedAt))
        .limit(1);

      const count = commCount[0]?.count || 0;
      const lastSummary = lastComm?.summary || "";
      email.contactContext = count > 0
        ? `${count} interaction${count > 1 ? "s" : ""} with ${contact.name}. Last: ${lastSummary.substring(0, 60)}`
        : undefined;
    }
  } catch { /* non-critical — skip enrichment */ }
}
```

Add `contactContext?: string` to the `EmailImportant` type.

### Fix 5: brief.ts — Mark seed data as fallback-only

**File: `artifacts/api-server/src/routes/tcc/brief.ts`**

Add a comment above each DEFAULT_ constant:

```typescript
// ═══ FALLBACK SEED DATA — Only used when live Gmail/Calendar/Slack/Linear APIs are not connected.
// These are static examples from April 2026. Safe to ignore in production.
```

This is cosmetic but prevents confusion during testing.

### Fix 6: brief.ts — Add attendee count to calendar events

**File: `artifacts/api-server/src/routes/tcc/brief.ts`**

In `fetchLiveCalendar()`, check if the calendar API request includes attendee data. The event list call should include `fields` or use `format: "full"` to get attendees. Then set `real` based on attendee count:

```typescript
// When mapping events:
const attendeeCount = e.attendees?.length ?? 0;
const hasVideo = !!(e.conferenceData || (e.description || "").match(/zoom|meet|teams/i));
const isRealMeeting = attendeeCount > 1 || hasVideo;
// Set: real: isRealMeeting, attendeeCount
```

NOTE: Based on the latest review, this may ALREADY be fixed (CalItem type has attendeeCount). Check first.

### Fix 7: sheets-sync.ts — Set BUSINESS_MASTER_SHEET_ID default

**File: `artifacts/api-server/src/routes/tcc/sheets-sync.ts`**

Change the `BUSINESS_MASTER_SHEET_ID` constant from defaulting to empty string to the actual sheet ID:

```typescript
const BUSINESS_MASTER_SHEET_ID = process.env.BUSINESS_MASTER_SHEET_ID || "1WGuJwCoWbwyFamXXP79yxnPmYhdFPgOGhOR8_V-EQyw";
```

This ensures auto-sync works out of the box without Tony needing to set an env var.

### Fix 8: ScheduleView.tsx — Change timeline "now" line from blue to green

**File: `artifacts/tcc/src/components/tcc/ScheduleView.tsx`**

Find the "now" indicator line element. Change the color from `#2563EB` (blue) to `#2E7D32` (green, same as `C.grn`). The spec and wireframes show a green timeline indicator.

## VERIFY AFTER ALL FIXES

1. Brief returns `emailsPromotions` array (even if empty)
2. Important emails have `contactContext` field when sender matches a known contact
3. Timeline "now" line is green
4. BUSINESS_MASTER_SHEET_ID defaults to `1WGuJ...` so auto-sync starts without env var
5. EOD auto-send at 4:30 PM uses Sonnet model
6. Google auth logs a warning if refresh token is rotated
7. Calendar events have `attendeeCount` and `real` is based on actual attendees, not always true
