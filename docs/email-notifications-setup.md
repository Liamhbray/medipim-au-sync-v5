# Email Notifications Setup

This guide explains how to set up email notifications for successful MediPim sync runs.

## Configuration Methods

You can configure email notifications in two ways:

### Option 1: Local Development (.env file)
Add the SMTP configuration to your `.env` file. This is useful for testing locally:

```env
# Email Notification Configuration
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password-here
NOTIFICATION_EMAIL=your-email@gmail.com
```

### Option 2: GitHub Actions (Production)
For production use with GitHub Actions, add these as repository secrets (see below).

## Prerequisites

You'll need SMTP credentials from an email service provider. Common options include:
- Gmail (with App Password)
- SendGrid
- AWS SES
- Mailgun
- Your own SMTP server

## GitHub Secrets Configuration

Add the following secrets to your repository:

1. Go to your repository → Settings → Secrets and variables → Actions
2. Add these secrets:

| Secret Name | Description | Example |
|------------|-------------|---------|
| `SMTP_SERVER` | SMTP server address | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USERNAME` | SMTP username/email | `your-email@gmail.com` |
| `SMTP_PASSWORD` | SMTP password | Your app password |
| `NOTIFICATION_EMAIL` | Email to receive notifications | `notifications@yourcompany.com` |

## Gmail Setup Example

If using Gmail:

1. Enable 2-factor authentication on your Google account
2. Generate an App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and generate password
3. Use these settings:
   - `SMTP_SERVER`: `smtp.gmail.com`
   - `SMTP_PORT`: `587`
   - `SMTP_USERNAME`: Your Gmail address
   - `SMTP_PASSWORD`: The generated app password

## Email Content

The notification email includes:
- Sync mode (full, fetch-only, maintain-only)
- Total processing time
- Number of records processed
- Records inserted, updated, and skipped
- Direct link to GitHub Actions logs

## Customization

To modify the email template, edit the `html_body` section in `.github/workflows/sync.yml`.

## Disabling Notifications

To disable email notifications temporarily:
1. Comment out or remove the `send-notification` job in the workflow
2. Or delete the `NOTIFICATION_EMAIL` secret

## Testing Notifications

To test email notifications without running a full sync:
1. Go to Actions tab → "MediPim Product Sync"
2. Click "Run workflow"
3. Select **Sync mode**: `notification-only`
4. Run the workflow

This will send a test email with mock data:
- Total Records: 12,345
- Inserted: 1,234
- Updated: 5,678
- Skipped: 5,433

## Troubleshooting

If emails aren't being sent:
1. Check the GitHub Actions logs for the `send-notification` job
2. Verify all SMTP secrets are correctly set
3. Ensure SMTP credentials are valid
4. Check spam folder for notifications