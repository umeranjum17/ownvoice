// Every handle on x.com's page lives here, so a markup change is a one-file fix.
export const SELECTORS = {
  post: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  author: '[data-testid="User-Name"]',
  composer: '[data-testid="tweetTextarea_0"]',
  quoted: '[role="link"]',
};
export type Selectors = typeof SELECTORS;
