// Design rule: every Ex360 table uses the column names of the matching portal page, with the
// portal's default columns. docs/portal-columns.md holds the full mapping; these are the ones checked in code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('tables use the portal column names', () => {
  for (const header of [
    "['Name', 'Available licenses', 'Assigned licenses', 'Account type']", // M365 admin center > Billing > Licenses
    "['Domain name', 'Status']", // M365 admin center > Settings > Domains
    "['Name', 'Toggle', 'Status']", // Defender > Email authentication settings > DKIM
    "['Service', 'Health']", // M365 admin center > Health > Service health
    "['Name', 'Status', 'Priority', 'Type']", // Defender threat policy lists
    "['Time received', 'Subject', 'Sender', 'Quarantine reason', 'Release status', 'Policy type', 'Expires', 'Recipient', 'Sender address override reason', 'Released by']", // Defender > Quarantine
    "['Date', 'Sender', 'Recipient', 'Subject', 'Status']", // EAC > Message trace
    "['Name', 'Status', 'Data consistency score', 'Percentage synced', 'Total', 'Synced', 'Finalized', 'Failed']", // EAC > Migration batches
    "['Display name', 'Email address', 'Recipient type', 'Archive status', 'Last modified time']", // EAC > Mailboxes
    "['Group name', 'Group email', 'Sync status', 'Teams status', 'Membership type', 'Group privacy', 'Created on']", // EAC > Groups > Microsoft 365
    "['Group name', 'Group email', 'Sync status', 'Teams status', 'Membership type', 'Group privacy', 'Created on', 'Last refreshed', 'Next scheduled refresh']", // EAC > Groups > Dynamic distribution list (read live)
    "['Group name', 'Group email', 'Group type', 'Sync status', 'Teams status', 'Membership type', 'Group privacy', 'Created on']", // EAC > Groups, all tabs' columns
    "['Role group', 'Description']", // EAC > Roles > Admin roles
    "['Date', 'Request ID', 'User principal name', 'Application', 'Status', 'IP address', 'Resource', 'Resource ID', 'Conditional access', 'User']", // Entra > Sign-in events (read live)
    "['Date', 'Service', 'Category', 'Activity', 'Status', 'Status Reason']", // Entra > Audit logs (read live)
    "['Display name', 'Email address', 'Type']", // EAC > Resources (read live)
    "['Name', 'Description', 'Roles']", // EAC > Roles > User roles (read live)
    "['Name', 'Type', 'Associated administrator']", // EAC > Migration > Endpoints (read live)
    "['Policy name', 'Last updated']", // Defender > Quarantine policies (read live)
    "['Value', 'Action', 'Override verdicts', 'Modified by', 'Last updated', 'Last used date', 'Remove on', 'Notes']", // Defender > Tenant Allow/Block List > Domains & addresses (read live)
    "['Name', 'Priority', 'Mode', 'Policy sync status', 'Last modified']", // Purview > DLP policies (read live)
    "['Name', 'Priority', 'Scope', 'Created by', 'Last modified']", // Purview > Sensitivity labels (read live)
    "['Name', 'Priority', 'Policy sync status', 'Created by', 'Last modified']", // Purview > Label publishing policies (read live)
    "['Name', 'Created by', 'Last modified']", // Purview > Retention policies (read live)
    "['Name', 'Retention duration', 'Created by', 'Last modified']", // Purview > Retention labels (read live)
    "['Case name', 'Status', 'Created', 'Last modified', 'Modified by', 'Number', 'Description']", // Purview > eDiscovery cases (read live)
    "['Name', 'Type', 'Roles', 'Users', 'Security groups']", // Purview > Role groups (read live)
    "['Date (UTC)', 'IP Address', 'User', 'Record type', 'Activity', 'Item']", // Purview > Audit
  ]) assert.ok(app.includes(header), header);
});

test('columns Ex360 invented are gone from the portal-matched tables', () => {
  for (const old of ["'Part number'", "'Who can release it', 'Expires'", "'People with Full Access', 'Direct sign-in'", "'How booking works']", "['Batch', 'Status', 'Count']", "'What it gives in Exchange Online'", "['Time', 'App', 'Status', 'IP']", "['When', 'User', 'Operation']"]) {
    assert.ok(!app.includes(old), old);
  }
});

test('the facts behind dropped columns still open in the row flyout', () => {
  assert.match(app, /\['Part number \(SKU\)', s\.part/);
  assert.match(app, /\['People with Full Access', m\.FullAccessCount/);
  assert.match(app, /\['How booking works', bookingWords/);
  assert.match(app, /\['Who can release it', x\.release\]/);
});
