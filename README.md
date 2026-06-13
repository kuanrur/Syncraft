# Syncraft — Slack Communication Assistant (Prototype)

## What It Does

Syncraft helps remote teammates communicate more effectively by surfacing availability
context and learned communication preferences. It suggests replies tailored to how
each person prefers to communicate.

## Prerequisites

- Node.js >= 18
- A Slack workspace where you can install apps
- A Slack app created at https://api.slack.com/apps

## Slack App Setup

1. Create new app → "From scratch"
2. Enable Socket Mode → generate App-Level Token with `connections:write`
3. OAuth & Permissions → add Bot Token Scopes:
   `commands`, `chat:write`, `users:read`, `channels:history`, `channels:read`
4. Install to workspace → copy Bot Token
5. Create slash command: `/syncraft`
6. Create message shortcuts:
   - callback_id: `analyze_message`, name: "Analyze with Syncraft"
   - callback_id: `suggest_reply`, name: "Suggest Reply with Syncraft"
7. Enable App Home → Home Tab
8. Subscribe to bot events: `app_home_opened`, `message.channels`
9. Copy Signing Secret from Basic Information

## Local Setup

1. Clone repo
2. `npm install`
3. Copy `.env.example` to `.env`, fill in tokens
4. `npm run dev`
5. Open Slack → test `/syncraft @yourself`

## How It Works

- **/syncraft @user**: Shows availability, timezone, reply estimate, and communication style
- **"Analyze with Syncraft"**: Right-click a message to analyze its intent
- **"Suggest Reply with Syncraft"**: Right-click a message to get tailored reply suggestions
- **App Home**: View/edit your profile and see your learned communication style
- **Passive learning**: Syncraft observes public channels to learn communication patterns
  (metadata only — no message text is stored)

## Privacy

- Only public channels are observed
- No message text is ever stored — only derived metadata (word count, timing, intent)
- Users can view and clear their data from the App Home
- Set sharing_enabled to false in your profile to opt out

## Testing Checklist

- [ ] `/syncraft @user` with existing profile
- [ ] `/syncraft @user` with no profile
- [ ] `/syncraft` with no argument
- [ ] `/syncraft reply` in a thread
- [ ] Open App Home → see welcome or profile
- [ ] Set up / edit profile via modal
- [ ] "Analyze with Syncraft" shortcut on a message
- [ ] "Suggest Reply with Syncraft" shortcut on a message
- [ ] Verify communication style appears after ~20 messages
- [ ] Clear My Data from App Home
