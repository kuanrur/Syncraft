import { App } from '@slack/bolt';
import { initDb } from './db/client';
import { registerCommand } from './slack/commands';
import { registerShortcuts } from './slack/shortcuts';
import { registerAppHome } from './slack/appHome';
import { registerModals } from './slack/modals';
import { registerObserver } from './slack/observer';
import config from './config';

const app = new App({
  token: config.SLACK_BOT_TOKEN,
  appToken: config.SLACK_APP_TOKEN,
  signingSecret: config.SLACK_SIGNING_SECRET,
  socketMode: true,
});

initDb();
registerCommand(app);
registerShortcuts(app);
registerAppHome(app);
registerModals(app);
registerObserver(app);

(async () => {
  await app.start();
  console.log('⚡ Xiami is running');
})();
