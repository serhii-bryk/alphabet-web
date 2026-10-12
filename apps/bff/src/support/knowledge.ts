export interface KnowledgeArticle {
  id: string;
  keywords: string[];
  body: string;
}

const articles: KnowledgeArticle[] = [
  {
    id: 'navigation',
    keywords: [
      'where',
      'find',
      'navigate',
      'menu',
      'casino',
      'live casino',
      'live',
      'sports',
      'lobby',
      'homepage',
      'home',
      'أين',
      'كازينو',
      'مباشر',
      'رياضة',
    ],
    body: 'Casino, Live Casino, and Sports are the main rooms. On a wide screen they sit in the header switch. On a phone they sit in the sticky bar under the header. Casino is /casino. Live Casino is its own room at /live-casino, same account, different lobby. The wordmark returns toward Casino. The side menu also lists Casino, Live Casino, Sports, Promotions, and Search.',
  },
  {
    id: 'search',
    keywords: [
      'search',
      'find game',
      'provider',
      'pragmatic',
      'studio',
      'filter',
      'بحث',
      'مزود',
    ],
    body: 'Search is in the header and in the side menu, and there is a Search page. Casino and Live Casino lobbies also accept a search, so a provider or game name can be opened on that lobby. Studios that share a group are shown once. A short Popular row appears only when the lobby has more than eight games. Support cannot promise a studio is in the catalog.',
  },
  {
    id: 'games',
    keywords: [
      'game',
      'launch',
      'open',
      'demo',
      'real',
      'not opening',
      'won\'t open',
      'wont open',
      'unavailable',
      'minimize',
      'maximise',
      'maximize',
      'another game',
      'multiple',
      'add game',
      'switch',
      'window',
      'mobile',
      'لعبة',
      'تجريبي',
      'فتح',
    ],
    body: 'A game card launches immediately. Guests get demo only when that game allows it; otherwise the login dialog opens. Signed-in players launch real money. The same game in the same mode is focused instead of launched again. A different mode replaces that panel. Login does not turn a demo into real money. Logout closes real-money games and leaves demo games. Up to 5 games can stay open. On a wide screen (at least 1100px) each game is a floating window: drag, resize, minimize, maximize, and restore. Minimized games sit in a dock. Add Game collapses those windows to the dock so the lobby can be used; the games stay open. There is no separate browser pop-out. On a phone, one game is expanded and a switcher changes which game is visible. Add Game returns to the lobby with the games still open. If a game does not start, retry from the game view. If demo is unavailable, that game does not allow demo and a guest needs to sign in. If the session ended, sign in again. Support cannot see the game provider\'s internal error. Game details under the focused game can show name, image, provider, categories, format, game type, RTP, volatility, demo availability, real-money availability, and listed time. Empty values are omitted. RTP and volatility are shown only as the catalog sent them. Support must not invent an RTP.',
  },
  {
    id: 'sports',
    keywords: ['sport', 'sportsbook', 'bet', 'odds', 'fixture', 'رياضة', 'مراهنة'],
    body: 'Sports opens a sportsbook from the product switch. Guests get a demo sportsbook. Signed-in players get their sportsbook. If the session has ended, the sportsbook asks them to sign in again and does not silently fall back to a guest book. If it cannot open, the page says so and offers retry. Support cannot see odds, place bets, or explain a provider outage beyond that.',
  },
  {
    id: 'account',
    keywords: [
      'account',
      'login',
      'log in',
      'sign in',
      'logout',
      'log out',
      'register',
      'registration',
      'sign up',
      'password',
      'email',
      'balance',
      'profile',
      'حساب',
      'تسجيل',
      'دخول',
      'رصيد',
    ],
    body: 'Register is the header Register button, the homepage form for guests, or the Register page. Signup is two steps. Google, Apple, and Phone are visible and not available. Email verification is not required to play. If registration finishes but sign-in does not, the account can still exist: use Login with the same email. Login is the header Login button. Logout is in the header when signed in. Logout closes real-money games and leaves demo games. Balance is shown in the header for a signed-in player and on the Account page. The Account page also shows profile details the player already has: name, email, currency, country, and whether email is verified. On a phone, Account is in the bottom bar. On a wide screen, the email button in the header opens Account. Support must not ask for a password or read a balance amount from chat.',
  },
  {
    id: 'payments',
    keywords: [
      'deposit',
      'withdraw',
      'withdrawal',
      'cashier',
      'payment',
      'pending',
      'card',
      'test deposit',
      'money',
      'إيداع',
      'سحب',
      'دفع',
    ],
    body: 'Deposit and Withdraw open the cashier. They do not move money by themselves. A signed-in player can open Deposit from the header on a wide screen, from the side menu, from the Account page, or from inside an open game. Withdraw is on the Account page and in the cashier. Guests need to sign in first. The payment provider collects payment details in its own secure step. Support must never ask for a full card number, CVV, or a one-time code. A deposit stays pending until the provider confirms it. The cashier shows the status when the player returns. Support cannot mark a payment successful and cannot see a transaction list. Test Deposit, when it is shown, is a separate non-card option for this environment only. If a withdrawal is stuck or rejected, or a payment stays pending with no status, offer human support.',
  },
  {
    id: 'promotions',
    keywords: ['bonus', 'promotion', 'promo', 'wagering', 'offer', 'مكافأة', 'عرض', 'ترويج'],
    body: 'Promotions are preview cards. They are not a bonus wallet. Creating an account does not credit a bonus. No wagering rules are published. Support must not invent a bonus amount, a code, or a deadline.',
  },
  {
    id: 'language-theme',
    keywords: [
      'language',
      'arabic',
      'english',
      'rtl',
      'theme',
      'dark',
      'light',
      'لغة',
      'عربي',
      'داكن',
      'فاتح',
    ],
    body: 'Language and theme are in the side menu: the desktop sidebar, and the menu behind the header button on a phone. Languages are English and Arabic. Arabic uses a right-to-left layout. Switching language keeps the current page. Theme choices are Light, Dark, and System.',
  },
  {
    id: 'pwa',
    keywords: ['install', 'pwa', 'home screen', 'app', 'تثبيت', 'تطبيق'],
    body: 'The browser may offer to install AlphaBet. There is no install button inside the site. The installed app opens Casino. Support cannot promise offline play.',
  },
  {
    id: 'responsible',
    keywords: [
      'responsible',
      'self-exclude',
      'self exclude',
      'exclude',
      'cool off',
      'cool-off',
      'limit',
      'restrict',
      'stop gambling',
      'addiction',
      'close my account',
      '18',
      'لعب مسؤول',
      'استبعاد',
      'حد',
    ],
    body: 'AlphaBet is for adults 18 or older. Deposit limits, time-outs, and self-exclusion are not available in the product yet. The responsible gaming page says to stop playing when it stops being entertainment and to contact support if the account needs to be closed. For a request to self-exclude, cool off, restrict gambling, or set limits, direct the player to that page and to human support. Do not suggest depositing, another game, or continued play.',
  },
  {
    id: 'human',
    keywords: [
      'human',
      'person',
      'agent',
      'support',
      'helpdesk',
      'contact',
      'موظف',
      'شخص',
      'دعم',
    ],
    body: 'Human support is the Talk to a person action. It shows only contact methods that are configured. Support chat cannot create a ticket. If no contact method is configured, say so and still offer a short summary the player can copy. Use human support when the player asks for a person, a payment or withdrawal cannot be resolved here, account access still fails, a provider or sportsbook problem is outside this knowledge, or the answer is not confirmed.',
  },
];

export function selectKnowledge(text: string, limit = 4): KnowledgeArticle[] {
  const haystack = text.toLowerCase();
  return articles
    .map((article) => {
      let score = 0;
      for (const keyword of article.keywords) {
        if (haystack.includes(keyword.toLowerCase())) score += keyword.length;
      }
      return { article, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.article);
}

export function knowledgeById(id: string): KnowledgeArticle | undefined {
  return articles.find((article) => article.id === id);
}
